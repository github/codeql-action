/**
 * This file is the entry point for the `post:` hook of `analyze-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getConfig } from "./config-utils";
import * as debugArtifacts from "./debug-artifacts";
import { getActionsLogger } from "./logging";

async function run(uploadSarifDebugArtifact: Function) {
  const logger = getActionsLogger();

  const config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
  if (config === undefined) {
    throw new Error(
      "Config file could not be found at expected location. Did the 'init' action fail to start?"
    );
  }

  // Upload Actions SARIF artifacts for debugging
  if (config?.debugMode) {
    core.info(
      "Debug mode is on. Uploading available SARIF files as Actions debugging artifact..."
    );
    const outputDir = actionsUtil.getRequiredInput("output");
    await uploadSarifDebugArtifact(config, outputDir);
  }
}

async function runWrapper() {
  try {
    await run(debugArtifacts.uploadSarifDebugArtifact);
  } catch (error) {
    core.setFailed(`analyze action cleanup failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
