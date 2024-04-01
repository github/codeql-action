import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getActionVersion } from "./actions-util";
import { getGitHubVersion } from "./api-client";
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
    await checkDiskUsage(),
    logger,
  );
  const statusReport: UploadSarifStatusReport = {
    ...statusReportBase,
    ...uploadStats,
  };
  await sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  initializeEnvironment(getActionVersion());

  const gitHubVersion = await getGitHubVersion();
  checkActionVersion(getActionVersion(), gitHubVersion);

  await sendStatusReport(
    await createStatusReportBase(
      ActionName.UploadSarif,
      "starting",
      startedAt,
      undefined,
      await checkDiskUsage(),
      logger,
    ),
  );

  try {
    const uploadResult = await upload_lib.uploadFromActions(
      actionsUtil.getRequiredInput("sarif_file"),
      actionsUtil.getRequiredInput("checkout_path"),
      actionsUtil.getOptionalInput("category"),
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
    console.log(error);
    await sendStatusReport(
      await createStatusReportBase(
        ActionName.UploadSarif,
        getActionsStatus(error),
        startedAt,
        undefined,
        await checkDiskUsage(),
        logger,
        message,
        error.stack,
      ),
    );
    return;
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(
      `codeql/upload-sarif action failed: ${wrapError(error).message}`,
    );
  }
}

void runWrapper();
