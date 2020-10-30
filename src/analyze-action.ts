import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import {
  AnalysisStatusReport,
  runAnalyze,
  CodeQLAnalysisError,
} from "./analyze";
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
      await actionsUtil.getRef(),
      await actionsUtil.getAnalysisKey(),
      actionsUtil.getRequiredEnvParam("GITHUB_WORKFLOW"),
      actionsUtil.getWorkflowRunID(),
      actionsUtil.getRequiredInput("checkout_path"),
      actionsUtil.getRequiredInput("matrix"),
      actionsUtil.getRequiredInput("token"),
      actionsUtil.getRequiredEnvParam("GITHUB_SERVER_URL"),
      actionsUtil.getRequiredInput("upload") === "true",
      "actions",
      actionsUtil.getRequiredInput("output"),
      util.getMemoryFlag(actionsUtil.getOptionalInput("ram")),
      util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")),
      util.getThreadsFlag(actionsUtil.getOptionalInput("threads"), logger),
      config,
      logger
    );
  } catch (error) {
    core.setFailed(error.message);
    console.log(error);

    if (error instanceof CodeQLAnalysisError) {
      stats = { ...error.queriesStatusReport };
    }

    await sendStatusReport(startedAt, stats, error);
    return;
  }

  await sendStatusReport(startedAt, stats);
}

run().catch((e) => {
  core.setFailed(`analyze action failed: ${e}`);
  console.log(e);
});
