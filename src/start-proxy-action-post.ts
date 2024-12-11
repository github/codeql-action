/**
 * This file is the entry point for the `post:` hook of `start-proxy-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getGitHubVersion } from "./api-client";
import * as configUtils from "./config-utils";
import { getArtifactUploaderClient } from "./debug-artifacts";
import { getActionsLogger } from "./logging";
import { checkGitHubVersionInRange, getErrorMessage } from "./util";

async function runWrapper() {
  const logger = getActionsLogger();

  try {
    // Restore inputs from `start-proxy` Action.
    actionsUtil.restoreInputs();

    // Kill the running proxy
    const pid = core.getState("proxy-process-pid");
    if (pid) {
      process.kill(Number(pid));
    }

    const config = await configUtils.getConfig(
      actionsUtil.getTemporaryDirectory(),
      logger,
    );

    if ((config && config.debugMode) || core.isDebug()) {
      const logFilePath = core.getState("proxy-log-file");
      logger.info(
        "Debug mode is on. Uploading proxy log as Actions debugging artifact...",
      );
      if (config?.gitHubVersion.type === undefined) {
        logger.warning(
          `Did not upload debug artifacts because cannot determine the GitHub variant running.`,
        );
        return;
      }
      const gitHubVersion = await getGitHubVersion();
      checkGitHubVersionInRange(gitHubVersion, logger);

      const artifactUploader = await getArtifactUploaderClient(
        logger,
        gitHubVersion.type,
      );

      await artifactUploader.uploadArtifact(
        "proxy-log-file",
        [logFilePath],
        actionsUtil.getTemporaryDirectory(),
        {
          // ensure we don't keep the debug artifacts around for too long since they can be large.
          retentionDays: 7,
        },
      );
    }
  } catch (error) {
    // A failure in the post step should not fail the entire action.
    logger.warning(
      `start-proxy post-action step failed: ${getErrorMessage(error)}`,
    );
  }
}

void runWrapper();
