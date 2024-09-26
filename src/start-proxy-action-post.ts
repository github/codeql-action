/**
 * This file is the entry point for the `post:` hook of `start-proxy-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as artifact from "@actions/artifact";
import * as artifactLegacy from "@actions/artifact-legacy";
import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getGitHubVersion } from "./api-client";
import * as configUtils from "./config-utils";
import { Feature, Features } from "./feature-flags";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import {
  checkGitHubVersionInRange,
  getErrorMessage,
  getRequiredEnvParam,
  GitHubVariant,
} from "./util";

async function runWrapper() {
  try {
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
      // `@actions/artifact@v2` is not yet supported on GHES so the legacy version of the client will be used on GHES
      // until it is supported. We also use the legacy version of the client if the feature flag is disabled.
      let artifactUploader:
        | artifact.ArtifactClient
        | artifactLegacy.ArtifactClient;
      if (gitHubVersion.type === GitHubVariant.GHES) {
        logger.info(
          "Uploading debug artifacts using the `@actions/artifact@v1` client because the `v2` version is not yet supported on GHES.",
        );
        artifactUploader = artifactLegacy.create();
      } else if (!(await features.getValue(Feature.ArtifactV2Upgrade))) {
        logger.info(
          "Uploading debug artifacts using the `@actions/artifact@v1` client because the value of the relevant feature flag is false. To use the `v2` version of the client, set the `CODEQL_ACTION_ARTIFACT_V2_UPGRADE` environment variable to true.",
        );
        artifactUploader = artifactLegacy.create();
      } else {
        logger.info(
          "Uploading debug artifacts using the `@actions/artifact@v2` client.",
        );
        artifactUploader = new artifact.DefaultArtifactClient();
      }

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
