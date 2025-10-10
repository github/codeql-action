import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getActionVersion, getTemporaryDirectory } from "./actions-util";
import * as analyses from "./analyses";
import { getGitHubVersion } from "./api-client";
import { Features } from "./feature-flags";
import { Logger, getActionsLogger } from "./logging";
import { getRepositoryNwo } from "./repository";
import {
  createStatusReportBase,
  sendStatusReport,
  StatusReportBase,
  getActionsStatus,
  ActionName,
  isThirdPartyAnalysis,
} from "./status-report";
import * as upload_lib from "./upload-lib";
import { uploadSarif } from "./upload-sarif";
import {
  ConfigurationError,
  checkActionVersion,
  checkDiskUsage,
  getErrorMessage,
  initializeEnvironment,
  shouldSkipSarifUpload,
  wrapError,
} from "./util";

interface UploadSarifStatusReport
  extends StatusReportBase,
    upload_lib.UploadStatusReport {}

async function sendSuccessStatusReport(
  startedAt: Date,
  uploadStats: upload_lib.UploadStatusReport,
  logger: Logger,
) {
  const statusReportBase = await createStatusReportBase(
    ActionName.UploadSarif,
    "success",
    startedAt,
    undefined,
    await checkDiskUsage(logger),
    logger,
  );
  if (statusReportBase !== undefined) {
    const statusReport: UploadSarifStatusReport = {
      ...statusReportBase,
      ...uploadStats,
    };
    await sendStatusReport(statusReport);
  }
}

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  initializeEnvironment(getActionVersion());

  const gitHubVersion = await getGitHubVersion();
  checkActionVersion(getActionVersion(), gitHubVersion);

  // Make inputs accessible in the `post` step.
  actionsUtil.persistInputs();

  const repositoryNwo = getRepositoryNwo();
  const features = new Features(
    gitHubVersion,
    repositoryNwo,
    getTemporaryDirectory(),
    logger,
  );

  const startingStatusReportBase = await createStatusReportBase(
    ActionName.UploadSarif,
    "starting",
    startedAt,
    undefined,
    await checkDiskUsage(logger),
    logger,
  );
  if (startingStatusReportBase !== undefined) {
    await sendStatusReport(startingStatusReportBase);
  }

  try {
    // `sarifPath` can either be a path to a single file, or a path to a directory.
    const sarifPath = actionsUtil.getRequiredInput("sarif_file");
    const checkoutPath = actionsUtil.getRequiredInput("checkout_path");
    const category = actionsUtil.getOptionalInput("category");

    const uploadResults = await uploadSarif(
      logger,
      features,
      checkoutPath,
      sarifPath,
      category,
    );

    // Fail if we didn't upload anything.
    if (Object.keys(uploadResults).length === 0) {
      throw new ConfigurationError(
        `No SARIF files found to upload in "${sarifPath}".`,
      );
    }

    const codeScanningResult =
      uploadResults[analyses.AnalysisKind.CodeScanning];
    if (codeScanningResult !== undefined) {
      core.setOutput("sarif-id", codeScanningResult.sarifID);
    }
    core.setOutput("sarif-ids", JSON.stringify(uploadResults));

    // We don't upload results in test mode, so don't wait for processing
    if (shouldSkipSarifUpload()) {
      core.debug(
        "SARIF upload disabled by an environment variable. Waiting for processing is disabled.",
      );
    } else if (actionsUtil.getRequiredInput("wait-for-processing") === "true") {
      if (codeScanningResult !== undefined) {
        await upload_lib.waitForProcessing(
          getRepositoryNwo(),
          codeScanningResult.sarifID,
          logger,
        );
      }
      // The code quality service does not currently have an endpoint to wait for SARIF processing,
      // so we can't wait for that here.
    }
    await sendSuccessStatusReport(
      startedAt,
      codeScanningResult?.statusReport || {},
      logger,
    );
  } catch (unwrappedError) {
    const error =
      isThirdPartyAnalysis(ActionName.UploadSarif) &&
      unwrappedError instanceof upload_lib.InvalidSarifUploadError
        ? new ConfigurationError(unwrappedError.message)
        : wrapError(unwrappedError);
    const message = error.message;
    core.setFailed(message);

    const errorStatusReportBase = await createStatusReportBase(
      ActionName.UploadSarif,
      getActionsStatus(error),
      startedAt,
      undefined,
      await checkDiskUsage(logger),
      logger,
      message,
      error.stack,
    );
    if (errorStatusReportBase !== undefined) {
      await sendStatusReport(errorStatusReportBase);
    }
    return;
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(
      `codeql/upload-sarif action failed: ${getErrorMessage(error)}`,
    );
  }
}

void runWrapper();
