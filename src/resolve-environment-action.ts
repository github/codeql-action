import * as core from "@actions/core";

import {
  getOptionalInput,
  getRequiredInput,
  getTemporaryDirectory,
} from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { CommandInvocationError } from "./codeql";
import * as configUtils from "./config-utils";
import { Language, resolveAlias } from "./languages";
import { getActionsLogger } from "./logging";
import { runResolveBuildEnvironment } from "./resolve-environment";
import {
  sendStatusReport,
  createStatusReportBase,
  getActionsStatus,
} from "./status-report";
import {
  checkDiskUsage,
  checkForTimeout,
  checkGitHubVersionInRange,
  wrapError,
} from "./util";

const ACTION_NAME = "resolve-environment";
const ENVIRONMENT_OUTPUT_NAME = "environment";

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  const language: Language = resolveAlias(getRequiredInput("language"));

  try {
    if (
      !(await sendStatusReport(
        await createStatusReportBase(
          ACTION_NAME,
          "starting",
          startedAt,
          await checkDiskUsage(logger),
        ),
      ))
    ) {
      return;
    }

    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);

    const config = await configUtils.getConfig(getTemporaryDirectory(), logger);
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?",
      );
    }

    const workingDirectory = getOptionalInput("working-directory");
    const result = await runResolveBuildEnvironment(
      config.codeQLCmd,
      logger,
      workingDirectory,
      language,
    );
    core.setOutput(ENVIRONMENT_OUTPUT_NAME, result);
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);

    if (error instanceof CommandInvocationError) {
      // If the CLI failed to run successfully for whatever reason,
      // we just return an empty JSON object and proceed with the workflow.
      core.setOutput(ENVIRONMENT_OUTPUT_NAME, {});
      logger.warning(
        `Failed to resolve a build environment suitable for automatically building your code. ${error.message}`,
      );
    } else {
      // For any other error types, something has more seriously gone wrong and we fail.
      core.setFailed(
        `Failed to resolve a build environment suitable for automatically building your code. ${error.message}`,
      );

      await sendStatusReport(
        await createStatusReportBase(
          ACTION_NAME,
          getActionsStatus(error),
          startedAt,
          await checkDiskUsage(),
          error.message,
          error.stack,
        ),
      );
    }

    return;
  }

  await sendStatusReport(
    await createStatusReportBase(
      ACTION_NAME,
      "success",
      startedAt,
      await checkDiskUsage(),
    ),
  );
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`${ACTION_NAME} action failed: ${wrapError(error).message}`);
  }
  await checkForTimeout();
}

void runWrapper();
