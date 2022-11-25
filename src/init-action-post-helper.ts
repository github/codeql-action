import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import { Feature, FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import { CODEQL_ACTION_ANALYZE_DID_UPLOAD_SARIF } from "./shared-environment";
import * as uploadLib from "./upload-lib";
import { getRequiredEnvParam, isInTestMode, parseMatrixInput } from "./util";
import {
  getCategoryInputOrThrow,
  getCheckoutPathInputOrThrow,
  getUploadInputOrThrow,
  getWaitForProcessingInputOrThrow,
  getWorkflow,
} from "./workflow";

async function uploadFailedSarif(
  config: Config,
  repositoryNwo: RepositoryNwo,
  featureEnablement: FeatureEnablement,
  logger: Logger
) {
  if (!config.codeQLCmd) {
    logger.warning(
      "CodeQL command not found. Unable to upload failed SARIF file."
    );
    return;
  }
  const codeql = await getCodeQL(config.codeQLCmd);
  if (
    !(await featureEnablement.getValue(
      Feature.UploadFailedSarifEnabled,
      codeql
    ))
  ) {
    logger.debug("Uploading failed SARIF is disabled.");
    return;
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
    return;
  }
  const category = getCategoryInputOrThrow(workflow, jobName, matrix);
  const checkoutPath = getCheckoutPathInputOrThrow(workflow, jobName, matrix);
  const waitForProcessing =
    getWaitForProcessingInputOrThrow(workflow, jobName, matrix) === "true";

  const sarifFile = "../codeql-failed-run.sarif";
  await codeql.diagnosticsExport(sarifFile, category);

  core.info(`Uploading failed SARIF file ${sarifFile}`);
  const uploadResult = await uploadLib.uploadFromActions(
    sarifFile,
    checkoutPath,
    category,
    logger
  );
  if (uploadResult !== undefined && waitForProcessing) {
    await uploadLib.waitForProcessing(
      repositoryNwo,
      uploadResult.sarifID,
      logger
    );
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

  if (process.env[CODEQL_ACTION_ANALYZE_DID_UPLOAD_SARIF] !== "true") {
    try {
      await uploadFailedSarif(config, repositoryNwo, featureEnablement, logger);
    } catch (e) {
      logger.warning(
        `Failed to upload a SARIF file for the failed run. Error: ${e}`
      );
    }
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
}
