/**
 * This file is the entry point for the `post:` hook of `upload-sarif-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getTemporaryDirectory } from "./actions-util";
import { getGitHubVersion } from "./api-client";
import * as debugArtifacts from "./debug-artifacts";
import { EnvVar } from "./environment";
import { Features } from "./feature-flags";
import { getActionsLogger, withGroup } from "./logging";
import { parseRepositoryNwo } from "./repository";
import {
  checkGitHubVersionInRange,
  getErrorMessage,
  getRequiredEnvParam,
} from "./util";

async function runWrapper() {
  try {
    // Restore inputs from `upload-sarif` Action.
    actionsUtil.restoreInputs();
    const logger = getActionsLogger();
    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);
    const repositoryNwo = parseRepositoryNwo(
      getRequiredEnvParam("GITHUB_REPOSITORY"),
    );
    const features = new Features(
      gitHubVersion,
      repositoryNwo,
      getTemporaryDirectory(),
      logger,
    );

    // Upload SARIF artifacts if we determine that this is a third-party analysis run.
    // For first-party runs, this artifact will be uploaded in the `analyze-post` step.
    if (process.env[EnvVar.INIT_ACTION_HAS_RUN] !== "true") {
      if (gitHubVersion.type === undefined) {
        core.warning(
          `Did not upload debug artifacts because cannot determine the GitHub variant running.`,
        );
        return;
      }
      await withGroup("Uploading combined SARIF debug artifact", () =>
        debugArtifacts.uploadCombinedSarifArtifacts(
          logger,
          gitHubVersion.type,
          features,
        ),
      );
    }
  } catch (error) {
    core.setFailed(
      `upload-sarif post-action step failed: ${getErrorMessage(error)}`,
    );
  }
}

void runWrapper();
