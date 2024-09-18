/**
 * This file is the entry point for the `post:` hook of `analyze-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as core from "@actions/core";

import * as debugArtifacts from "./debug-artifacts";
import { EnvVar } from "./environment";
import { getActionsLogger, withGroup } from "./logging";
import { getErrorMessage } from "./util";

async function runWrapper() {
  try {
    const logger = getActionsLogger();

    // Upload SARIF artifacts if we determine that this is a first-party analysis run.
    // For third-party runs, this artifact will be uploaded in the `upload-sarif-post` step.
    if (process.env[EnvVar.INIT_ACTION_HAS_RUN] === "true") {
      await withGroup("Uploading combined SARIF debug artifact", () =>
        debugArtifacts.uploadCombinedSarifArtifacts(logger),
      );
    }
  } catch (error) {
    core.setFailed(
      `analyze post-action step failed: ${getErrorMessage(error)}`,
    );
  }
}

void runWrapper();
