import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getConfig } from "./config-utils";
import { getActionsLogger } from "./logging";

async function run(uploadSarifDebugArtifact: Function) {
  const logger = getActionsLogger();

  const config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
  if (config === undefined) {
    throw new Error(
      "Config file could not be found at expected location. Has the 'init' action been called?"
    );
  }

  // Upload Actions SARIF artifacts for debugging
  if (config?.debugMode) {
    const outputDir = actionsUtil.getRequiredInput("output");
    await uploadSarifDebugArtifact(config, outputDir);
  }
}

async function runWrapper() {
  try {
    await run(actionsUtil.uploadSarifDebugArtifact);
  } catch (error) {
    core.setFailed(`analyze action cleanup failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
