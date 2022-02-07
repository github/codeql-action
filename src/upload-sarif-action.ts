import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as upload_lib from "./upload-lib";
import {
  getGitHubVersion,
  getRequiredEnvParam,
  initializeEnvironment,
  Mode,
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
  initializeEnvironment(Mode.actions, pkg.version);
  const startedAt = new Date();
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
    const apiDetails = {
      auth: actionsUtil.getRequiredInput("token"),
      url: getRequiredEnvParam("GITHUB_SERVER_URL"),
    };

    const gitHubVersion = await getGitHubVersion(apiDetails);

    const uploadResult = await upload_lib.uploadFromActions(
      actionsUtil.getRequiredInput("sarif_file"),
      gitHubVersion,
      apiDetails,
      getActionsLogger()
    );
    core.setOutput("sarif-id", uploadResult.sarifID);
    if (actionsUtil.getRequiredInput("wait-for-processing") === "true") {
      await upload_lib.waitForProcessing(
        parseRepositoryNwo(getRequiredEnvParam("GITHUB_REPOSITORY")),
        uploadResult.sarifID,
        apiDetails,
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
        "failure",
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
