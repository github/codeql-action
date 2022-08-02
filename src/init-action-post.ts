/**
 * This file is the entry point for the `post:` hook of `init-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getConfig } from "./config-utils";
import * as debugArtifacts from "./debug-artifacts";
import { getActionsLogger } from "./logging";

async function run(
  uploadDatabaseBundleDebugArtifact: Function,
  uploadLogsDebugArtifact: Function,
  uploadFinalLogsDebugArtifact: Function
) {
  const logger = getActionsLogger();

  const config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
  if (config === undefined) {
    throw new Error(
      "Config file could not be found at expected location. Did the 'init' action fail to start?"
    );
  }

  // Upload appropriate Actions artifacts for debugging
  if (config?.debugMode) {
    await uploadDatabaseBundleDebugArtifact(config, logger);
    await uploadLogsDebugArtifact(config);
    await uploadFinalLogsDebugArtifact(config);
  }
}

async function runWrapper() {
  try {
    await run(
      debugArtifacts.uploadDatabaseBundleDebugArtifact,
      debugArtifacts.uploadLogsDebugArtifact,
      debugArtifacts.uploadFinalLogsDebugArtifact
    );
  } catch (error) {
    core.setFailed(`init action cleanup failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
