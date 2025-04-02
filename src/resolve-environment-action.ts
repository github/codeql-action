import * as core from "@actions/core";

import {
  getActionVersion,
  getOptionalInput,
  getRequiredInput,
  getTemporaryDirectory,
} from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { CliError } from "./cli-errors";
import { Config, getConfig } from "./config-utils";
import { getActionsLogger } from "./logging";
import { runResolveBuildEnvironment } from "./resolve-environment";
import {
  sendStatusReport,
  createStatusReportBase,
  getActionsStatus,
  ActionName,
} from "./status-report";
import {
  checkActionVersion,
  checkDiskUsage,
  checkForTimeout,
  checkGitHubVersionInRange,
  getErrorMessage,
  wrapError,
} from "./util";

const ENVIRONMENT_OUTPUT_NAME = "environment";

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();

  let config: Config | undefined;

  try {
    const statusReportBase = await createStatusReportBase(
      ActionName.ResolveEnvironment,
      "starting",
      startedAt,
      config,
      await checkDiskUsage(logger),
      logger,
    );
    if (statusReportBase !== undefined) {
      await sendStatusReport(statusReportBase);
    }

    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);
    checkActionVersion(getActionVersion(), gitHubVersion);

    config = await getConfig(getTemporaryDirectory(), logger);
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
      getRequiredInput("language"),
    );
    core.setOutput(ENVIRONMENT_OUTPUT_NAME, result);
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);

    if (error instanceof CliError) {
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

      const statusReportBase = await createStatusReportBase(
        ActionName.ResolveEnvironment,
        getActionsStatus(error),
        startedAt,
        config,
        await checkDiskUsage(logger),
        logger,
        error.message,
        error.stack,
      );
      if (statusReportBase !== undefined) {
        await sendStatusReport(statusReportBase);
      }
    }

    return;
  }

  const statusReportBase = await createStatusReportBase(
    ActionName.ResolveEnvironment,
    "success",
    startedAt,
    config,
    await checkDiskUsage(logger),
    logger,
  );
  if (statusReportBase !== undefined) {
    await sendStatusReport(statusReportBase);
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(
      `${ActionName.ResolveEnvironment} action failed: ${getErrorMessage(
        error,
      )}`,
    );
  }
  await checkForTimeout();
}

void runWrapper();
