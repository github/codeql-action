import * as fs from "fs";

import * as github from "@actions/github";

import * as actionsUtil from "./actions-util";
import { CodeScanning } from "./analyses";
import { getApiClient } from "./api-client";
import { CodeQL, getCodeQL } from "./codeql";
import { Config, isCodeScanningEnabled } from "./config-utils";
import * as dependencyCaching from "./dependency-caching";
import { EnvVar } from "./environment";
import { Feature, FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";
import { OverlayDatabaseMode } from "./overlay";
import { OverlayStatus, saveOverlayStatus } from "./overlay/status";
import { RepositoryNwo, getRepositoryNwo } from "./repository";
import { JobStatus } from "./status-report";
import * as uploadLib from "./upload-lib";
import {
  checkDiskUsage,
  delay,
  getErrorMessage,
  getRequiredEnvParam,
  parseMatrixInput,
  shouldSkipSarifUpload,
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

export interface DependencyCachingUsageReport {
  dependency_caching_usage?: dependencyCaching.DependencyCachingUsageReport;
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
    shouldSkipSarifUpload()
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
    CodeScanning,
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
  // Only upload the failed SARIF to Code scanning if Code scanning is enabled.
  if (!isCodeScanningEnabled(config)) {
    return {
      upload_failed_run_skipped_because: "Code Scanning is not enabled.",
    };
  }
  if (process.env[EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY] === "true") {
    return {
      upload_failed_run_skipped_because:
        "Analyze Action completed successfully",
    };
  }
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
}

export async function run(
  uploadAllAvailableDebugArtifacts: (
    codeql: CodeQL,
    config: Config,
    logger: Logger,
    codeQlVersion: string,
  ) => Promise<void>,
  printDebugLogs: (config: Config) => Promise<void>,
  codeql: CodeQL,
  config: Config,
  repositoryNwo: RepositoryNwo,
  features: FeatureEnablement,
  logger: Logger,
) {
  await recordOverlayStatus(codeql, config, features, logger);

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
    const version = await codeql.getVersion();
    await uploadAllAvailableDebugArtifacts(
      codeql,
      config,
      logger,
      version.version,
    );
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

/**
 * If overlay base database creation was attempted but the analysis did not complete
 * successfully, save the failure status to the Actions cache so that subsequent runs
 * can skip overlay analysis until something changes (e.g. a new CodeQL version).
 */
async function recordOverlayStatus(
  codeql: CodeQL,
  config: Config,
  features: FeatureEnablement,
  logger: Logger,
) {
  if (
    config.overlayDatabaseMode !== OverlayDatabaseMode.OverlayBase ||
    process.env[EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY] === "true" ||
    !(await features.getValue(Feature.OverlayAnalysisStatusSave))
  ) {
    return;
  }

  const overlayStatus: OverlayStatus = {
    attemptedToBuildOverlayBaseDatabase: true,
    builtOverlayBaseDatabase: false,
  };

  const diskUsage = await checkDiskUsage(logger);
  if (diskUsage === undefined) {
    logger.warning(
      "Unable to save overlay status to the Actions cache because the available disk space could not be determined.",
    );
    return;
  }

  const saved = await saveOverlayStatus(
    codeql,
    config.languages,
    diskUsage,
    overlayStatus,
    logger,
  );

  const blurb =
    "This job attempted to run with improved incremental analysis but it did not complete successfully. " +
    "This may have been due to disk space constraints: using improved incremental analysis can " +
    "require a significant amount of disk space for some repositories.";

  if (saved) {
    logger.error(
      `${blurb} ` +
        "This failure has been recorded in the Actions cache, so the next CodeQL analysis will run " +
        "without improved incremental analysis. If you want to enable improved incremental analysis, " +
        "increase the disk space available to the runner. " +
        "If that doesn't help, contact GitHub Support for further assistance.",
    );
  } else {
    logger.error(
      `${blurb} ` +
        "The attempt to save this failure status to the Actions cache failed. The Action will attempt to " +
        "run with improved incremental analysis again.",
    );
  }
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
      const repositoryNwo = getRepositoryNwo();

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
