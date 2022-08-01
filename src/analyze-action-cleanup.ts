import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { Config, getConfig } from "./config-utils";
import { getActionsLogger } from "./logging";
import { doesDirectoryExist } from "./util";

async function uploadSarifDebugArtifact(config: Config, outputDir: string) {
  if (!doesDirectoryExist(outputDir)) {
    return;
  }

  let toUpload: string[] = [];
  for (const lang of config.languages) {
    const sarifFile = path.resolve(outputDir, `${lang}.sarif`);
    if (fs.existsSync(sarifFile)) {
      toUpload = toUpload.concat(sarifFile);
    }
  }
  await actionsUtil.uploadDebugArtifacts(
    toUpload,
    outputDir,
    config.debugArtifactName
  );
}

async function run() {
  const logger = getActionsLogger();

  let config: Config | undefined = undefined;
  config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
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
    await run();
  } catch (error) {
    core.setFailed(`analyze action cleanup failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
