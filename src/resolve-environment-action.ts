import * as core from "@actions/core";

import {
  createStatusReportBase,
  getRequiredInput,
  getTemporaryDirectory,
  sendStatusReport,
} from "./actions-util";
import { getGitHubVersion } from "./api-client";
import * as configUtils from "./config-utils";
import { Language, resolveAlias } from "./languages";
import { getActionsLogger } from "./logging";
import { runResolveBuildEnvironment } from "./resolve-environment";
import { checkForTimeout, checkGitHubVersionInRange, wrapError } from "./util";
import { validateWorkflow } from "./workflow";

const actionName = "resolve-environment";

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  const language: Language = resolveAlias(getRequiredInput("language"));

  try {
    const workflowErrors = await validateWorkflow(logger);

    if (
      !(await sendStatusReport(
        await createStatusReportBase(
          actionName,
          "starting",
          startedAt,
          workflowErrors
        )
      ))
    ) {
      return;
    }

    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);

    const config = await configUtils.getConfig(getTemporaryDirectory(), logger);
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?"
      );
    }

    const result = await runResolveBuildEnvironment(config.codeQLCmd, logger, language);
    core.setOutput("configuration", result);
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    core.setFailed(error.message);
    await sendStatusReport(
      await createStatusReportBase(
        actionName,
        "aborted",
        startedAt,
        error.message,
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
    core.setFailed(`${actionName} action failed: ${wrapError(error).message}`);
  }
  await checkForTimeout();
}

void runWrapper();
