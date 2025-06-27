import * as fs from "fs";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getActionVersion, getTemporaryDirectory } from "./actions-util";
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
import {
  ConfigurationError,
  checkActionVersion,
  checkDiskUsage,
  getErrorMessage,
  initializeEnvironment,
  isInTestMode,
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
    const sarifPath = actionsUtil.getRequiredInput("sarif_file");
    const checkoutPath = actionsUtil.getRequiredInput("checkout_path");
    const category = actionsUtil.getOptionalInput("category");

    const uploadResult = await upload_lib.uploadFiles(
      sarifPath,
      checkoutPath,
      category,
      features,
      logger,
      upload_lib.CodeScanningTarget,
    );
    core.setOutput("sarif-id", uploadResult.sarifID);

    // If there are `.quality.sarif` files in `sarifPath`, then upload those to the code quality service.
    // Code quality can currently only be enabled on top of security, so we'd currently always expect to
    // have a directory for the results here.
    if (fs.lstatSync(sarifPath).isDirectory()) {
      const qualitySarifFiles = upload_lib.findSarifFilesInDir(
        sarifPath,
        upload_lib.CodeQualityTarget.sarifPredicate,
      );

      if (qualitySarifFiles.length !== 0) {
        await upload_lib.uploadSpecifiedFiles(
          qualitySarifFiles,
          checkoutPath,
          category,
          features,
          logger,
          upload_lib.CodeQualityTarget,
        );
      }
    }

    // We don't upload results in test mode, so don't wait for processing
    if (isInTestMode()) {
      core.debug("In test mode. Waiting for processing is disabled.");
    } else if (actionsUtil.getRequiredInput("wait-for-processing") === "true") {
      await upload_lib.waitForProcessing(
        getRepositoryNwo(),
        uploadResult.sarifID,
        logger,
      );
      // The code quality service does not currently have an endpoint to wait for SARIF processing,
      // so we can't wait for that here.
    }
    await sendSuccessStatusReport(startedAt, uploadResult.statusReport, logger);
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
