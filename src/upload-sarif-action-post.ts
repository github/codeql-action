/**
 * This file is the entry point for the `post:` hook of `upload-sarif-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as core from "@actions/core";

import * as debugArtifacts from "./debug-artifacts";
import * as uploadSarifActionPostHelper from "./upload-sarif-action-post-helper";
import { wrapError } from "./util";

async function runWrapper() {
  try {
    await uploadSarifActionPostHelper.uploadArtifacts(
      debugArtifacts.uploadDebugArtifacts,
    );
  } catch (error) {
    core.setFailed(
      `upload-sarif post-action step failed: ${wrapError(error).message}`,
    );
  }
}

void runWrapper();
