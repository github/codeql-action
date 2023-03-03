import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import { Feature, FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import {
  CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY,
  CODEQL_ACTION_IS_DATABASE_CLUSTER,
} from "./shared-environment";
import * as uploadLib from "./upload-lib";
import {
  getExistingDatabasePaths,
  getRequiredEnvParam,
  isInTestMode,
  parseMatrixInput,
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
}

function createFailedUploadFailedSarifResult(
  error: unknown
): UploadFailedSarifResult {
  return {
    upload_failed_run_error:
      error instanceof Error ? error.message : String(error),
    upload_failed_run_stack_trace:
      error instanceof Error ? error.stack : undefined,
  };
}

/**
 * Upload a failed SARIF file if we can verify that SARIF upload is enabled and determine the SARIF
 * category for the workflow.
 */
async function maybeUploadFailedSarif(
  config: Config,
  repositoryNwo: RepositoryNwo,
  featureEnablement: FeatureEnablement,
  logger: Logger
): Promise<UploadFailedSarifResult[]> {
  if (!config.codeQLCmd) {
    return [{ upload_failed_run_skipped_because: "CodeQL command not found" }];
  }
  const codeql = await getCodeQL(config.codeQLCmd);
  if (
    !(await featureEnablement.getValue(
      Feature.UploadFailedSarifEnabled,
      codeql
    ))
  ) {
    return [{ upload_failed_run_skipped_because: "Feature disabled" }];
  }
  const workflow = await getWorkflow();
  const jobName = getRequiredEnvParam("GITHUB_JOB");
  const matrix = parseMatrixInput(actionsUtil.getRequiredInput("matrix"));
  if (
    getUploadInputOrThrow(workflow, jobName, matrix) !== "true" ||
    isInTestMode()
  ) {
    return [{ upload_failed_run_skipped_because: "SARIF upload is disabled" }];
  }
  const category = getCategoryInputOrThrow(workflow, jobName, matrix);
  const checkoutPath = getCheckoutPathInputOrThrow(workflow, jobName, matrix);

  const existingDatabasePaths = getExistingDatabasePaths(config);
  if (existingDatabasePaths.length === 0) {
    const sarifFile = "../codeql-failed-run.sarif";
    await codeql.diagnosticsExport(sarifFile, category);
    core.info(`Uploading failed SARIF file ${sarifFile}`);
    const uploadResult = await uploadLib.uploadFromActions(
      sarifFile,
      checkoutPath,
      category,
      logger
    );
    await uploadLib.waitForProcessing(
      repositoryNwo,
      uploadResult.sarifID,
      logger,
      { isUnsuccessfulExecution: true }
    );
    return [uploadResult?.statusReport ?? {}];
  } else {
    const uploadStatusReports: uploadLib.UploadStatusReport[] = [];
    const maybeIsDatabaseCluster =
      process.env[CODEQL_ACTION_IS_DATABASE_CLUSTER];
    // If we have already created database(s), then we call database diagnostic export.
    existingDatabasePaths.map(async (databasePath) => {
      const databaseSarifFile = `../codeql-failed-run-${existingDatabasePaths}.sarif`;
      await codeql.databaseExportDiagnostics(
        databasePath,
        maybeIsDatabaseCluster === undefined ||
          maybeIsDatabaseCluster.length === 0
          ? false
          : true,
        databaseSarifFile,
        category
      );
      core.info(`Uploading failed SARIF file ${databaseSarifFile}`);
      const uploadResult = await uploadLib.uploadFromActions(
        databaseSarifFile,
        checkoutPath,
        category,
        logger
      );
      await uploadLib.waitForProcessing(
        repositoryNwo,
        uploadResult.sarifID,
        logger,
        { isUnsuccessfulExecution: true }
      );
      uploadStatusReports.push(uploadResult.statusReport);
    });
    return uploadStatusReports ?? [];
  }
}

export async function tryUploadSarifIfRunFailed(
  config: Config,
  repositoryNwo: RepositoryNwo,
  featureEnablement: FeatureEnablement,
  logger: Logger
): Promise<UploadFailedSarifResult[]> {
  if (process.env[CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY] !== "true") {
    try {
      return await maybeUploadFailedSarif(
        config,
        repositoryNwo,
        featureEnablement,
        logger
      );
    } catch (e) {
      logger.debug(
        `Failed to upload a SARIF file for this failed CodeQL code scanning run. ${e}`
      );
      return [createFailedUploadFailedSarifResult(e)];
    }
  } else {
    return [
      {
        upload_failed_run_skipped_because:
          "Analyze Action completed successfully",
      },
    ];
  }
}

export async function run(
  uploadDatabaseBundleDebugArtifact: Function,
  uploadLogsDebugArtifact: Function,
  printDebugLogs: Function,
  repositoryNwo: RepositoryNwo,
  featureEnablement: FeatureEnablement,
  logger: Logger
) {
  const config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
  if (config === undefined) {
    logger.warning(
      "Debugging artifacts are unavailable since the 'init' Action failed before it could produce any."
    );
    return;
  }

  const uploadFailedSarifResults = await tryUploadSarifIfRunFailed(
    config,
    repositoryNwo,
    featureEnablement,
    logger
  );

  // If the upload was skipped, it is the only item in the results array.
  if (uploadFailedSarifResults[0].upload_failed_run_skipped_because) {
    logger.debug(
      "Won't upload a failed SARIF file for this CodeQL code scanning run because: " +
        `${uploadFailedSarifResults[0].upload_failed_run_skipped_because}.`
    );
  }
  // Throw an error if in integration tests, we expected to upload a SARIF file for a failed run
  // but we didn't upload anything.
  if (
    process.env["CODEQL_ACTION_EXPECT_UPLOAD_FAILED_SARIF"] === "true" &&
    !uploadFailedSarifResults[0].raw_upload_size_bytes
  ) {
    throw new Error(
      "Expected to upload a failed SARIF file for this CodeQL code scanning run, " +
        `but the result was instead ${uploadFailedSarifResults}.`
    );
  }

  // Upload appropriate Actions artifacts for debugging
  if (config.debugMode) {
    core.info(
      "Debug mode is on. Uploading available database bundles and logs as Actions debugging artifacts..."
    );
    await uploadDatabaseBundleDebugArtifact(config, logger);
    await uploadLogsDebugArtifact(config);

    await printDebugLogs(config);
  }

  return uploadFailedSarifResults;
}
