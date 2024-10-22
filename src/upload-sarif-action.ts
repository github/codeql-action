import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getActionVersion, getTemporaryDirectory } from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { Features } from "./feature-flags";
import { Logger, getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import {
  createStatusReportBase,
  sendStatusReport,
  StatusReportBase,
  getActionsStatus,
  ActionName,
  isFirstPartyAnalysis,
} from "./status-report";
import * as upload_lib from "./upload-lib";
import {
  ConfigurationError,
  checkActionVersion,
  checkDiskUsage,
  getErrorMessage,
  getRequiredEnvParam,
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

  const repositoryNwo = parseRepositoryNwo(
    getRequiredEnvParam("GITHUB_REPOSITORY"),
  );
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
    const uploadResult = await upload_lib.uploadFiles(
      actionsUtil.getRequiredInput("sarif_file"),
      actionsUtil.getRequiredInput("checkout_path"),
      actionsUtil.getOptionalInput("category"),
      features,
      logger,
    );
    core.setOutput("sarif-id", uploadResult.sarifID);

    // We don't upload results in test mode, so don't wait for processing
    if (isInTestMode()) {
      core.debug("In test mode. Waiting for processing is disabled.");
    } else if (actionsUtil.getRequiredInput("wait-for-processing") === "true") {
      await upload_lib.waitForProcessing(
        parseRepositoryNwo(getRequiredEnvParam("GITHUB_REPOSITORY")),
        uploadResult.sarifID,
        logger,
      );
    }
    await sendSuccessStatusReport(startedAt, uploadResult.statusReport, logger);
  } catch (unwrappedError) {
    const error =
      !isFirstPartyAnalysis(ActionName.UploadSarif) &&
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
