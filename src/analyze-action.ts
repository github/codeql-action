import * as core from "@actions/core";

import { AnalysisStatusReport, runAnalyze } from "./analyze";
import { getConfig } from "./config-utils";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as util from "./util";

interface FinishStatusReport
  extends util.StatusReportBase,
    AnalysisStatusReport {}

async function sendStatusReport(
  startedAt: Date,
  stats: AnalysisStatusReport | undefined,
  error?: Error
) {
  const status =
    stats?.analyze_failure_language !== undefined || error !== undefined
      ? "failure"
      : "success";
  const statusReportBase = await util.createStatusReportBase(
    "finish",
    status,
    startedAt,
    error?.message,
    error?.stack
  );
  const statusReport: FinishStatusReport = {
    ...statusReportBase,
    ...(stats || {}),
  };
  await util.sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  let stats: AnalysisStatusReport | undefined = undefined;
  try {
    util.prepareLocalRunEnvironment();
    if (
      !(await util.sendStatusReport(
        await util.createStatusReportBase("finish", "starting", startedAt),
        true
      ))
    ) {
      return;
    }
    const logger = getActionsLogger();
    const config = await getConfig(
      util.getRequiredEnvParam("RUNNER_TEMP"),
      logger
    );
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?"
      );
    }
    stats = await runAnalyze(
      parseRepositoryNwo(util.getRequiredEnvParam("GITHUB_REPOSITORY")),
      await util.getCommitOid(),
      util.getRef(),
      await util.getAnalysisKey(),
      util.getRequiredEnvParam("GITHUB_WORKFLOW"),
      util.getWorkflowRunID(),
      util.getRequiredInput("checkout_path"),
      util.getOptionalInput("matrix"),
      util.getRequiredInput("token"),
      util.getRequiredEnvParam("GITHUB_SERVER_URL"),
      util.getOptionalInput("upload") === "true",
      "actions",
      util.getRequiredInput("output"),
      util.getMemoryFlag(util.getOptionalInput("ram")),
      util.getAddSnippetsFlag(util.getOptionalInput("add-snippets")),
      util.getThreadsFlag(util.getOptionalInput("threads"), logger),
      config,
      logger
    );
  } catch (error) {
    core.setFailed(error.message);
    console.log(error);
    await sendStatusReport(startedAt, stats, error);
    return;
  }

  await sendStatusReport(startedAt, stats);
}

run().catch((e) => {
  core.setFailed(`analyze action failed: ${e}`);
  console.log(e);
});
