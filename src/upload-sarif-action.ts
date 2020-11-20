import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as upload_lib from "./upload-lib";

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
    const uploadStats = await upload_lib.upload(
      actionsUtil.getRequiredInput("sarif_file"),
      parseRepositoryNwo(actionsUtil.getRequiredEnvParam("GITHUB_REPOSITORY")),
      await actionsUtil.getCommitOid(),
      await actionsUtil.getRef(),
      await actionsUtil.getAnalysisKey(),
      actionsUtil.getRequiredEnvParam("GITHUB_WORKFLOW"),
      actionsUtil.getWorkflowRunID(),
      actionsUtil.getRequiredInput("checkout_path"),
      actionsUtil.getRequiredInput("matrix"),
      actionsUtil.getRequiredInput("token"),
      actionsUtil.getRequiredEnvParam("GITHUB_SERVER_URL"),
      "actions",
      getActionsLogger()
    );
    await sendSuccessStatusReport(startedAt, uploadStats);
  } catch (error) {
    core.setFailed(error.message);
    console.log(error);
    await actionsUtil.sendStatusReport(
      await actionsUtil.createStatusReportBase(
        "upload-sarif",
        "failure",
        startedAt,
        error.message,
        error.stack
      )
    );
    return;
  }
}

run().catch((e) => {
  core.setFailed(`codeql/upload-sarif action failed: ${e}`);
  console.log(e);
});
