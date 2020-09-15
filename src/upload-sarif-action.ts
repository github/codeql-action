import * as core from "@actions/core";

import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as upload_lib from "./upload-lib";
import * as util from "./util";

interface UploadSarifStatusReport
  extends util.StatusReportBase,
    upload_lib.UploadStatusReport {}

async function sendSuccessStatusReport(
  startedAt: Date,
  uploadStats: upload_lib.UploadStatusReport
) {
  const statusReportBase = await util.createStatusReportBase(
    "upload-sarif",
    "success",
    startedAt
  );
  const statusReport: UploadSarifStatusReport = {
    ...statusReportBase,
    ...uploadStats,
  };
  await util.sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  if (
    !(await util.sendStatusReport(
      await util.createStatusReportBase("upload-sarif", "starting", startedAt),
      true
    ))
  ) {
    return;
  }

  try {
    const uploadStats = await upload_lib.upload(
      util.getRequiredInput("sarif_file"),
      parseRepositoryNwo(util.getRequiredEnvParam("GITHUB_REPOSITORY")),
      await util.getCommitOid(),
      util.getRef(),
      await util.getAnalysisKey(),
      util.getRequiredEnvParam("GITHUB_WORKFLOW"),
      util.getWorkflowRunID(),
      util.getRequiredInput("checkout_path"),
      util.getRequiredInput("matrix"),
      util.getRequiredInput("token"),
      util.getRequiredEnvParam("GITHUB_SERVER_URL"),
      "actions",
      getActionsLogger()
    );
    await sendSuccessStatusReport(startedAt, uploadStats);
  } catch (error) {
    core.setFailed(error.message);
    console.log(error);
    await util.sendStatusReport(
      await util.createStatusReportBase(
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
