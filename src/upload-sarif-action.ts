import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getActionVersion } from "./actions-util";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import {
  createStatusReportBase,
  sendStatusReport,
  StatusReportBase,
  getActionsStatus,
} from "./status-report";
import * as upload_lib from "./upload-lib";
import {
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
) {
  const statusReportBase = await createStatusReportBase(
    "upload-sarif",
    "success",
    startedAt,
    await checkDiskUsage(),
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
  if (
    !(await sendStatusReport(
      await createStatusReportBase(
        "upload-sarif",
        "starting",
        startedAt,
        await checkDiskUsage(),
      ),
    ))
  ) {
    return;
  }

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
    await sendSuccessStatusReport(startedAt, uploadResult.statusReport);
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    const message = error.message;
    core.setFailed(message);
    console.log(error);
    await sendStatusReport(
      await createStatusReportBase(
        "upload-sarif",
        getActionsStatus(error),
        startedAt,
        await checkDiskUsage(),
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
