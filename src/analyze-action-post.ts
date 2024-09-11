/**
 * This file is the entry point for the `post:` hook of `analyze-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as core from "@actions/core";

import * as analyzeActionPostHelper from "./analyze-action-post-helper";
import * as debugArtifacts from "./debug-artifacts";
import * as uploadSarifActionPostHelper from "./upload-sarif-action-post-helper";
import { wrapError } from "./util";

async function runWrapper() {
  try {
    await analyzeActionPostHelper.run();

    // Also run the upload-sarif post action since we're potentially running
    // the same steps in the analyze action.
    await uploadSarifActionPostHelper.uploadArtifacts(
      debugArtifacts.uploadDebugArtifacts,
    );
  } catch (error) {
    core.setFailed(
      `analyze post-action step failed: ${wrapError(error).message}`,
    );
  }
}

void runWrapper();
