import * as fs from "fs";

import * as core from "@actions/core";
import * as github from "@actions/github";

import * as actionsUtil from "./actions-util";
import { getApiClient } from "./api-client";
import { getCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { EnvVar } from "./environment";
import { Feature, FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";
import { RepositoryNwo, parseRepositoryNwo } from "./repository";
import { JobStatus } from "./status-report";
import * as uploadLib from "./upload-lib";
import {
  delay,
  getErrorMessage,
  getRequiredEnvParam,
  isInTestMode,
  parseMatrixInput,
  wrapError,
} from "./util";
import {
  getCategoryInputOrThrow,
  getCheckoutPathInputOrThrow,
  getUploadInputOrThrow,
  getWorkflow,
} from "./workflow";

export interface UploadFailedSarifResult extends uploadLib.UploadStatusReport {
  /** If there was an error while uploading a failed run, this is its message. */
  upload_failed_run_error?: string;
  /** If there was an error while uploading a failed run, this is its stack trace. */
  upload_failed_run_stack_trace?: string;
  /** Reason why we did not upload a SARIF payload with `executionSuccessful: false`. */
  upload_failed_run_skipped_because?: string;

  /** The internal ID of SARIF analysis. */
  sarifID?: string;
}

export interface JobStatusReport {
  job_status: JobStatus;
}

function createFailedUploadFailedSarifResult(
  error: unknown,
): UploadFailedSarifResult {
  const wrappedError = wrapError(error);
  return {
    upload_failed_run_error: wrappedError.message,
    upload_failed_run_stack_trace: wrappedError.stack,
  };
}

/**
 * Upload a failed SARIF file if we can verify that SARIF upload is enabled and determine the SARIF
 * category for the workflow.
 */
async function maybeUploadFailedSarif(
  config: Config,
  repositoryNwo: RepositoryNwo,
  features: FeatureEnablement,
  logger: Logger,
): Promise<UploadFailedSarifResult> {
  if (!config.codeQLCmd) {
    return { upload_failed_run_skipped_because: "CodeQL command not found" };
  }
  const workflow = await getWorkflow(logger);
  const jobName = getRequiredEnvParam("GITHUB_JOB");
  const matrix = parseMatrixInput(actionsUtil.getRequiredInput("matrix"));
  const shouldUpload = getUploadInputOrThrow(workflow, jobName, matrix);
  if (
    !["always", "failure-only"].includes(
      actionsUtil.getUploadValue(shouldUpload),
    ) ||
    isInTestMode()
  ) {
    return { upload_failed_run_skipped_because: "SARIF upload is disabled" };
  }
  const category = getCategoryInputOrThrow(workflow, jobName, matrix);
  const checkoutPath = getCheckoutPathInputOrThrow(workflow, jobName, matrix);
  const databasePath = config.dbLocation;

  const codeql = await getCodeQL(config.codeQLCmd);
  const sarifFile = "../codeql-failed-run.sarif";

  // If there is no database or the feature flag is off, we run 'export diagnostics'
  if (
    databasePath === undefined ||
    !(await features.getValue(Feature.ExportDiagnosticsEnabled, codeql))
  ) {
    await codeql.diagnosticsExport(sarifFile, category, config);
  } else {
    // We call 'database export-diagnostics' to find any per-database diagnostics.
    await codeql.databaseExportDiagnostics(databasePath, sarifFile, category);
  }

  logger.info(`Uploading failed SARIF file ${sarifFile}`);
  const uploadResult = await uploadLib.uploadFiles(
    sarifFile,
    checkoutPath,
    category,
    features,
    logger,
  );
  await uploadLib.waitForProcessing(
    repositoryNwo,
    uploadResult.sarifID,
    logger,
    { isUnsuccessfulExecution: true },
  );
  return uploadResult
    ? { ...uploadResult.statusReport, sarifID: uploadResult.sarifID }
    : {};
}

export async function tryUploadSarifIfRunFailed(
  config: Config,
  repositoryNwo: RepositoryNwo,
  features: FeatureEnablement,
  logger: Logger,
): Promise<UploadFailedSarifResult> {
  if (process.env[EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY] !== "true") {
    // If analyze didn't complete successfully and the job status hasn't
    // already been set to Failure/ConfigurationError previously, this
    // means that something along the way failed in a step that is not
    // owned by the Action, for example a manual build step. We
    // consider this a configuration error.
    core.exportVariable(
      EnvVar.JOB_STATUS,
      process.env[EnvVar.JOB_STATUS] ?? JobStatus.ConfigErrorStatus,
    );
    try {
      return await maybeUploadFailedSarif(
        config,
        repositoryNwo,
        features,
        logger,
      );
    } catch (e) {
      logger.debug(
        `Failed to upload a SARIF file for this failed CodeQL code scanning run. ${e}`,
      );
      return createFailedUploadFailedSarifResult(e);
    }
  } else {
    core.exportVariable(
      EnvVar.JOB_STATUS,
      process.env[EnvVar.JOB_STATUS] ?? JobStatus.SuccessStatus,
    );
    return {
      upload_failed_run_skipped_because:
        "Analyze Action completed successfully",
    };
  }
}

export async function run(
  uploadAllAvailableDebugArtifacts: (
    config: Config,
    logger: Logger,
    codeQlVersion: string,
  ) => Promise<void>,
  printDebugLogs: (config: Config) => Promise<void>,
  config: Config,
  repositoryNwo: RepositoryNwo,
  features: FeatureEnablement,
  logger: Logger,
) {
  const uploadFailedSarifResult = await tryUploadSarifIfRunFailed(
    config,
    repositoryNwo,
    features,
    logger,
  );

  if (uploadFailedSarifResult.upload_failed_run_skipped_because) {
    logger.debug(
      "Won't upload a failed SARIF file for this CodeQL code scanning run because: " +
        `${uploadFailedSarifResult.upload_failed_run_skipped_because}.`,
    );
  }
  // Throw an error if in integration tests, we expected to upload a SARIF file for a failed run
  // but we didn't upload anything.
  if (
    process.env["CODEQL_ACTION_EXPECT_UPLOAD_FAILED_SARIF"] === "true" &&
    !uploadFailedSarifResult.raw_upload_size_bytes
  ) {
    const error = JSON.stringify(uploadFailedSarifResult);
    throw new Error(
      "Expected to upload a failed SARIF file for this CodeQL code scanning run, " +
        `but the result was instead ${error}.`,
    );
  }

  if (process.env["CODEQL_ACTION_EXPECT_UPLOAD_FAILED_SARIF"] === "true") {
    if (!github.context.payload.pull_request?.head.repo.fork) {
      await removeUploadedSarif(uploadFailedSarifResult, logger);
    } else {
      logger.info(
        "Skipping deletion of failed SARIF because the workflow was triggered from a fork of " +
          "codeql-action and doesn't have the appropriate permissions for deletion.",
      );
    }
  }

  // Upload appropriate Actions artifacts for debugging
  if (config.debugMode) {
    logger.info(
      "Debug mode is on. Uploading available database bundles and logs as Actions debugging artifacts...",
    );
    const codeql = await getCodeQL(config.codeQLCmd);
    const version = await codeql.getVersion();
    await uploadAllAvailableDebugArtifacts(config, logger, version.version);
    await printDebugLogs(config);
  }

  if (actionsUtil.isSelfHostedRunner()) {
    try {
      fs.rmSync(config.dbLocation, {
        recursive: true,
        force: true,
        maxRetries: 3,
      });
      logger.info(
        `Cleaned up database cluster directory ${config.dbLocation}.`,
      );
    } catch (e) {
      logger.warning(
        `Failed to clean up database cluster directory ${config.dbLocation}. Details: ${e}`,
      );
    }
  } else {
    logger.debug(
      "Skipping cleanup of database cluster directory since we are running on a GitHub-hosted " +
        "runner which will be automatically cleaned up.",
    );
  }

  return uploadFailedSarifResult;
}

async function removeUploadedSarif(
  uploadFailedSarifResult: UploadFailedSarifResult,
  logger: Logger,
) {
  const sarifID = uploadFailedSarifResult.sarifID;
  if (sarifID) {
    logger.startGroup("Deleting failed SARIF upload");
    logger.info(
      `In test mode, therefore deleting the failed analysis to avoid impacting tool status for the Action repository. SARIF ID to delete: ${sarifID}.`,
    );
    const client = getApiClient();

    try {
      const repositoryNwo = parseRepositoryNwo(
        getRequiredEnvParam("GITHUB_REPOSITORY"),
      );

      // Wait to make sure the analysis is ready for download before requesting it.
      await delay(5000);

      // Get the analysis associated with the uploaded sarif
      const analysisInfo = await client.request(
        "GET /repos/:owner/:repo/code-scanning/analyses?sarif_id=:sarif_id",
        {
          owner: repositoryNwo.owner,
          repo: repositoryNwo.repo,
          sarif_id: sarifID,
        },
      );

      // Delete the analysis.
      if (analysisInfo.data.length === 1) {
        const analysis = analysisInfo.data[0];
        logger.info(`Analysis ID to delete: ${analysis.id}.`);
        try {
          await client.request(
            "DELETE /repos/:owner/:repo/code-scanning/analyses/:analysis_id?confirm_delete",
            {
              owner: repositoryNwo.owner,
              repo: repositoryNwo.repo,
              analysis_id: analysis.id,
            },
          );
          logger.info(`Analysis deleted.`);
        } catch (e) {
          const origMessage = getErrorMessage(e);
          const newMessage = origMessage.includes(
            "No analysis found for analysis ID",
          )
            ? `Analysis ${analysis.id} does not exist. It was likely already deleted.`
            : origMessage;
          throw new Error(newMessage);
        }
      } else {
        throw new Error(
          `Expected to find exactly one analysis with sarif_id ${sarifID}. Found ${analysisInfo.data.length}.`,
        );
      }
    } catch (e) {
      throw new Error(
        `Failed to delete uploaded SARIF analysis. Reason: ${getErrorMessage(
          e,
        )}`,
      );
    } finally {
      logger.endGroup();
    }
  } else {
    logger.warning(
      "Could not delete the uploaded SARIF analysis because a SARIF ID wasn't provided by the API when uploading the SARIF file.",
    );
  }
}

/**
 * Returns the final job status sent in the `init-post` Action, based on the
 * current value of the JOB_STATUS environment variable. If the variable is
 * unset, or if its value is not one of the JobStatus enum values, returns
 * Unknown. Otherwise it returns the status set in the environment variable.
 */
export function getFinalJobStatus(): JobStatus {
  const jobStatusFromEnvironment = process.env[EnvVar.JOB_STATUS];
  if (
    !jobStatusFromEnvironment ||
    !Object.values(JobStatus).includes(jobStatusFromEnvironment as JobStatus)
  ) {
    return JobStatus.UnknownStatus;
  }
  return jobStatusFromEnvironment as JobStatus;
}
