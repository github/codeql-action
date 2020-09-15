import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { AnalysisStatusReport, runAnalyze } from "./analyze";
import { getConfig } from "./config-utils";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as util from "./util";

interface FinishStatusReport
  extends actionsUtil.StatusReportBase,
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
  const statusReportBase = await actionsUtil.createStatusReportBase(
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
  await actionsUtil.sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  let stats: AnalysisStatusReport | undefined = undefined;
  try {
    actionsUtil.prepareLocalRunEnvironment();
    if (
      !(await actionsUtil.sendStatusReport(
        await actionsUtil.createStatusReportBase(
          "finish",
          "starting",
          startedAt
        ),
        true
      ))
    ) {
      return;
    }
    const logger = getActionsLogger();
    const config = await getConfig(
      actionsUtil.getRequiredEnvParam("RUNNER_TEMP"),
      logger
    );
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?"
      );
    }
    stats = await runAnalyze(
      parseRepositoryNwo(actionsUtil.getRequiredEnvParam("GITHUB_REPOSITORY")),
      await actionsUtil.getCommitOid(),
      actionsUtil.getRef(),
      await actionsUtil.getAnalysisKey(),
      actionsUtil.getRequiredEnvParam("GITHUB_WORKFLOW"),
      actionsUtil.getWorkflowRunID(),
      core.getInput("checkout_path"),
      core.getInput("matrix"),
      core.getInput("token"),
      actionsUtil.getRequiredEnvParam("GITHUB_SERVER_URL"),
      core.getInput("upload") === "true",
      "actions",
      core.getInput("output"),
      util.getMemoryFlag(core.getInput("ram")),
      util.getAddSnippetsFlag(core.getInput("add-snippets")),
      util.getThreadsFlag(core.getInput("threads"), logger),
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
