import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import { Feature, FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import { CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY } from "./shared-environment";
import * as uploadLib from "./upload-lib";
import { getRequiredEnvParam, isInTestMode, parseMatrixInput } from "./util";
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

export async function uploadFailedSarif(
  config: Config,
  repositoryNwo: RepositoryNwo,
  featureEnablement: FeatureEnablement,
  logger: Logger
): Promise<UploadFailedSarifResult> {
  if (!config.codeQLCmd) {
    logger.warning(
      "CodeQL command not found. Unable to upload failed SARIF file."
    );
    return { upload_failed_run_skipped_because: "CodeQL command not found" };
  }
  const codeql = await getCodeQL(config.codeQLCmd);
  if (
    !(await featureEnablement.getValue(
      Feature.UploadFailedSarifEnabled,
      codeql
    ))
  ) {
    logger.debug("Uploading failed SARIF is disabled.");
    return { upload_failed_run_skipped_because: "Feature disabled" };
  }
  const workflow = await getWorkflow();
  const jobName = getRequiredEnvParam("GITHUB_JOB");
  const matrix = parseMatrixInput(actionsUtil.getRequiredInput("matrix"));
  if (
    getUploadInputOrThrow(workflow, jobName, matrix) !== "true" ||
    isInTestMode()
  ) {
    logger.debug(
      "Won't upload a failed SARIF file since SARIF upload is disabled."
    );
    return { upload_failed_run_skipped_because: "SARIF upload is disabled" };
  }
  const category = getCategoryInputOrThrow(workflow, jobName, matrix);
  const checkoutPath = getCheckoutPathInputOrThrow(workflow, jobName, matrix);

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
  return uploadResult?.statusReport ?? {};
}

export async function uploadSarifIfRunFailed(
  config: Config,
  repositoryNwo: RepositoryNwo,
  featureEnablement: FeatureEnablement,
  logger: Logger
): Promise<UploadFailedSarifResult> {
  // This environment variable is used to integration test uploading a SARIF file for failed runs
  const expectFailedSarifUpload =
    process.env["CODEQL_ACTION_EXPECT_UPLOAD_FAILED_SARIF"] === "true";

  if (process.env[CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY] !== "true") {
    try {
      return await uploadFailedSarif(
        config,
        repositoryNwo,
        featureEnablement,
        logger
      );
    } catch (e) {
      if (expectFailedSarifUpload) {
        throw new Error(
          "Expected to upload a SARIF file for this failed CodeQL code scanning run, but encountered " +
            `the following error: ${e}`
        );
      }
      logger.debug(
        `Failed to upload a SARIF file for this failed CodeQL code scanning run. ${e}`
      );
      return createFailedUploadFailedSarifResult(e);
    }
  } else if (expectFailedSarifUpload) {
    throw new Error(
      "Expected to upload a SARIF file for this failed CodeQL code scanning run, but didn't."
    );
  } else {
    return {
      upload_failed_run_skipped_because:
        "Analyze Action completed successfully",
    };
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

  const uploadFailedSarifResult = await uploadSarifIfRunFailed(
    config,
    repositoryNwo,
    featureEnablement,
    logger
  );

  // Upload appropriate Actions artifacts for debugging
  if (config.debugMode) {
    core.info(
      "Debug mode is on. Uploading available database bundles and logs as Actions debugging artifacts..."
    );
    await uploadDatabaseBundleDebugArtifact(config, logger);
    await uploadLogsDebugArtifact(config);

    await printDebugLogs(config);
  }

  return uploadFailedSarifResult;
}
