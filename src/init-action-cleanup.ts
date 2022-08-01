import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { Config, getConfig } from "./config-utils";
import { getActionsLogger } from "./logging";

async function run(
  uploadDatabaseBundleDebugArtifact: Function,
  uploadLogsDebugArtifact: Function,
  uploadFinalLogsDebugArtifact: Function
) {
  const logger = getActionsLogger();

  let config: Config | undefined = undefined;
  config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
  if (config === undefined) {
    throw new Error(
      "Config file could not be found at expected location. Has the 'init' action been called?"
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
      actionsUtil.uploadDatabaseBundleDebugArtifact,
      actionsUtil.uploadLogsDebugArtifact,
      actionsUtil.uploadFinalLogsDebugArtifact
    );
  } catch (error) {
    core.setFailed(`init action cleanup failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
