/**
 * This file is the entry point for the `post:` hook of `init-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getGitHubVersion } from "./api-client";
import * as debugArtifacts from "./debug-artifacts";
import { Features } from "./feature-flags";
import * as initActionPostHelper from "./init-action-post-helper";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import { checkGitHubVersionInRange, getRequiredEnvParam } from "./util";

async function runWrapper() {
  try {
    const logger = getActionsLogger();
    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);

    const repositoryNwo = parseRepositoryNwo(
      getRequiredEnvParam("GITHUB_REPOSITORY")
    );
    const features = new Features(
      gitHubVersion,
      repositoryNwo,
      actionsUtil.getTemporaryDirectory(),
      logger
    );

    await initActionPostHelper.run(
      debugArtifacts.uploadDatabaseBundleDebugArtifact,
      debugArtifacts.uploadLogsDebugArtifact,
      actionsUtil.printDebugLogs,
      repositoryNwo,
      features,
      logger
    );
  } catch (error) {
    core.setFailed(`init post-action step failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
