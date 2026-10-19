/**
 * This file is the entry point for the `post:` hook of `start-proxy-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as core from "@actions/core";

import {
  ActionName,
  runInActions,
  type Action,
  type ActionState,
} from "./action-common";
import * as actionsUtil from "./actions-util";
import { getGitHubVersion } from "./api-client";
import * as configUtils from "./config-utils";
import { uploadArtifacts } from "./debug-artifacts";
import { getSafeErrorMessage } from "./start-proxy/status-report";
import { checkGitHubVersionInRange, getErrorMessage } from "./util";

/**
 * The main functionality of the `start-proxy` post-action is implemented by this function.
 * This is called once by {@link runInActions} after it is called in {@link runWrapper}.
 */
export async function run(action: ActionState<["Logger"]>) {
  // To capture errors appropriately, keep as much code within the try-catch as
  // possible, and only use safe functions outside.

  const logger = action.logger;

  try {
    // Restore inputs from `start-proxy` Action.
    actionsUtil.restoreInputs(logger);

    // Kill the running proxy
    const pid = core.getState("proxy-process-pid");
    if (pid) {
      process.kill(Number(pid));
    }

    const config = await configUtils.getConfig(
      actionsUtil.getTemporaryDirectory(),
      logger,
    );

    if (config?.debugMode || core.isDebug()) {
      const logFilePath = core.getState("proxy-log-file");
      logger.info(
        "Debug mode is on. Uploading proxy log as Actions debugging artifact...",
      );
      const gitHubVersion = await getGitHubVersion();
      checkGitHubVersionInRange(gitHubVersion, logger);

      await uploadArtifacts(
        logger,
        [logFilePath],
        actionsUtil.getTemporaryDirectory(),
        "proxy-log-file",
        gitHubVersion.type,
      );
    }
  } catch (error) {
    // A failure in the post step should not fail the entire action.
    logger.warning(
      `start-proxy post-action step failed: ${getErrorMessage(error)}`,
    );
  }
}

/** Defines the `start-proxy` post-action. */
const startProxyPostAction: Action = {
  name: ActionName.StartProxyPost,
  run,
  transformTelemetryError: getSafeErrorMessage,
};

/** The main entry point for the `start-proxy` post-action. */
export async function runWrapper() {
  await runInActions(startProxyPostAction);
}
