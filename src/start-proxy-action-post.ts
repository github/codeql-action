/**
 * This file is the entry point for the `post:` hook of `start-proxy-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as artifact from "@actions/artifact";
import * as artifactLegacy from "@actions/artifact-legacy";
import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import * as configUtils from "./config-utils";
import { GitHubVariant, wrapError } from "./util";

async function runWrapper() {
  try {
    const pid = core.getState("proxy-process-pid");
    if (pid) {
      process.kill(Number(pid));
    }
  } catch (error) {
    core.setFailed(
      `start-proxy post-action step failed: ${wrapError(error).message}`,
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
    try {
      if (config.gitHubVersion.type === GitHubVariant.GHES) {
        await artifactLegacy
          .create()
          .uploadArtifact(
            "proxy-log-file",
            [logFilePath],
            actionsUtil.getTemporaryDirectory(),
            {
              continueOnError: true,
              retentionDays: 7,
            },
          );
      } else {
        const artifactClient = new artifact.DefaultArtifactClient();
        await artifactClient.uploadArtifact(
          "proxy-log-file",
          [logFilePath],
          actionsUtil.getTemporaryDirectory(),
          {
            retentionDays: 7,
          },
        );
      }
    } catch (e) {
      // A failure to upload debug artifacts should not fail the entire action.
      core.warning(`Failed to upload debug artifacts: ${e}`);
    }
  }
}

void runWrapper();
