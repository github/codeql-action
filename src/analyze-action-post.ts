/**
 * This file is the entry point for the `post:` hook of `analyze-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { getCodeQL } from "./codeql";
import { getConfig } from "./config-utils";
import * as debugArtifacts from "./debug-artifacts";
import { EnvVar } from "./environment";
import { getActionsLogger } from "./logging";
import { checkGitHubVersionInRange, getErrorMessage } from "./util";

async function runWrapper() {
  try {
    actionsUtil.restoreInputs();
    const logger = getActionsLogger();
    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);

    // Upload SARIF artifacts if we determine that this is a first-party analysis run.
    // For third-party runs, this artifact will be uploaded in the `upload-sarif-post` step.
    if (process.env[EnvVar.INIT_ACTION_HAS_RUN] === "true") {
      const config = await getConfig(
        actionsUtil.getTemporaryDirectory(),
        logger,
      );
      if (config !== undefined) {
        const codeql = await getCodeQL(config.codeQLCmd);
        const version = await codeql.getVersion();
        await debugArtifacts.uploadCombinedSarifArtifacts(
          logger,
          config.gitHubVersion.type,
          version.version,
        );
      }
    }
  } catch (error) {
    core.setFailed(
      `analyze post-action step failed: ${getErrorMessage(error)}`,
    );
  }
}

void runWrapper();
