import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getActionVersion } from "./actions-util";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as upload_lib from "./upload-lib";
import {
  getRequiredEnvParam,
  initializeEnvironment,
  isInTestMode,
  wrapError,
} from "./util";

interface UploadSarifStatusReport
  extends actionsUtil.StatusReportBase,
    upload_lib.UploadStatusReport {}

async function sendSuccessStatusReport(
  startedAt: Date,
  uploadStats: upload_lib.UploadStatusReport
) {
  const statusReportBase = await actionsUtil.createStatusReportBase(
    "upload-sarif",
    "success",
    startedAt
  );
  const statusReport: UploadSarifStatusReport = {
    ...statusReportBase,
    ...uploadStats,
  };
  await actionsUtil.sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  initializeEnvironment(getActionVersion());
  if (
    !(await actionsUtil.sendStatusReport(
      await actionsUtil.createStatusReportBase(
        "upload-sarif",
        "starting",
        startedAt
      )
    ))
  ) {
    return;
  }

  try {
    const uploadResult = await upload_lib.uploadFromActions(
      actionsUtil.getRequiredInput("sarif_file"),
      actionsUtil.getRequiredInput("checkout_path"),
      actionsUtil.getOptionalInput("category"),
      getActionsLogger()
    );
    core.setOutput("sarif-id", uploadResult.sarifID);

    // We don't upload results in test mode, so don't wait for processing
    if (isInTestMode()) {
      core.debug("In test mode. Waiting for processing is disabled.");
    } else if (actionsUtil.getRequiredInput("wait-for-processing") === "true") {
      await upload_lib.waitForProcessing(
        parseRepositoryNwo(getRequiredEnvParam("GITHUB_REPOSITORY")),
        uploadResult.sarifID,
        getActionsLogger()
      );
    }
    await sendSuccessStatusReport(startedAt, uploadResult.statusReport);
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    const message = error.message;
    core.setFailed(message);
    console.log(error);
    await actionsUtil.sendStatusReport(
      await actionsUtil.createStatusReportBase(
        "upload-sarif",
        actionsUtil.getActionsStatus(error),
        startedAt,
        message,
        error.stack
      )
    );
    return;
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(
      `codeql/upload-sarif action failed: ${wrapError(error).message}`
    );
  }
}

void runWrapper();
