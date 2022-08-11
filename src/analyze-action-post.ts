/**
 * This file is the entry point for the `post:` hook of `analyze-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as core from "@actions/core";

import * as analyzeActionPostHelper from "./analyze-action-post-helper";
import * as debugArtifacts from "./debug-artifacts";

async function runWrapper() {
  try {
    await analyzeActionPostHelper.run(debugArtifacts.uploadSarifDebugArtifact);
  } catch (error) {
    core.setFailed(`analyze post-action step failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
