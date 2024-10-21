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
import { Features } from "./feature-flags";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import {
  checkGitHubVersionInRange,
  getErrorMessage,
  getRequiredEnvParam,
} from "./util";

async function runWrapper() {
  try {
    // Restore inputs from `start-proxy` Action.
    actionsUtil.restoreInputs();
    const pid = core.getState("proxy-process-pid");
    if (pid) {
      process.kill(Number(pid));
    }
  } catch (error) {
    core.setFailed(
      `start-proxy post-action step failed: ${getErrorMessage(error)}`,
    );
  }
  const config = await configUtils.getConfig(
    actionsUtil.getTemporaryDirectory(),
    core,
  );

  if ((config && config.debugMode) || core.isDebug()) {
    const logFilePath = core.getState("proxy-log-file");
    core.info(
      "Debug mode is on. Uploading proxy log as Actions debugging artifact...",
    );
    if (config?.gitHubVersion.type === undefined) {
      core.warning(
        `Did not upload debug artifacts because cannot determine the GitHub variant running.`,
      );
      return;
    }

    const logger = getActionsLogger();
    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);
    const repositoryNwo = parseRepositoryNwo(
      getRequiredEnvParam("GITHUB_REPOSITORY"),
    );
    const features = new Features(
      gitHubVersion,
      repositoryNwo,
      actionsUtil.getTemporaryDirectory(),
      logger,
    );

    try {
      const artifactUploader = await getArtifactUploaderClient(
        logger,
        gitHubVersion.type,
        features,
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
    } catch (e) {
      // A failure to upload debug artifacts should not fail the entire action.
      core.warning(`Failed to upload debug artifacts: ${e}`);
    }
  }
}

void runWrapper();
