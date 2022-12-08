import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as upload_lib from "./upload-lib";
import {
  checkActionVersion,
  getRequiredEnvParam,
  initializeEnvironment,
  isInTestMode,
} from "./util";

// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");

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
  initializeEnvironment(pkg.version);
  await checkActionVersion(pkg.version);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : String(error);
    core.setFailed(message);
    console.log(error);
    await actionsUtil.sendStatusReport(
      await actionsUtil.createStatusReportBase(
        "upload-sarif",
        actionsUtil.getActionsStatus(error),
        startedAt,
        message,
        stack
      )
    );
    return;
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`codeql/upload-sarif action failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
