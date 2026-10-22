import * as core from "@actions/core";

import { runInActions, type Action, type ActionState } from "./action-common";
import { getActionVersion, getTemporaryDirectory } from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { CliError } from "./cli-errors";
import { Config, getConfig } from "./config-utils";
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
  ConfigurationError,
  wrapError,
} from "./util";

const ENVIRONMENT_OUTPUT_NAME = "environment";

/**
 * The main functionality of the `resolve-environment` action is implemented by this function.
 * This is called once by {@link runInActions} after it is called in {@link runWrapper}.
 */
async function run(action: ActionState<["Base", "Logger", "Actions"]>) {
  // To capture errors appropriately, keep as much code within the try-catch as
  // possible, and only use safe functions outside.

  const logger = action.logger;

  let config: Config | undefined;

  try {
    const statusReportBase = await createStatusReportBase(
      action.name,
      "starting",
      action.startedAt,
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
      throw new ConfigurationError(
        "Config file could not be found at expected location. Has the 'init' action been called?",
      );
    }

    const workingDirectory =
      action.actions.getOptionalInput("working-directory");
    const result = await runResolveBuildEnvironment(
      config.codeQLCmd,
      logger,
      workingDirectory,
      action.actions.getRequiredInput("language"),
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
      action.actions.setFailed(
        `Failed to resolve a build environment suitable for automatically building your code. ${error.message}`,
      );

      const statusReportBase = await createStatusReportBase(
        action.name,
        getActionsStatus(error),
        action.startedAt,
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
    action.name,
    "success",
    action.startedAt,
    config,
    await checkDiskUsage(logger),
    logger,
  );
  if (statusReportBase !== undefined) {
    await sendStatusReport(statusReportBase);
  }
}

/** Defines the `resolve-environment` action. */
const resolveEnvironmentAction: Action = {
  name: ActionName.ResolveEnvironment,
  run,
};

/** The main entry point for the `resolve-environment` action. */
export async function runWrapper() {
  await runInActions(resolveEnvironmentAction);
  await checkForTimeout();
}
