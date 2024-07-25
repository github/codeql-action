/**
 * This file is the entry point for the `post:` hook of `start-proxy-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as fs from "fs";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import * as configUtils from "./config-utils";
import { wrapError } from "./util";

async function runWrapper() {
  try {
    const pid = core.getState("proxy-process-pid");
    if (pid) {
      process.kill(Number(pid));
    }
  } catch (error) {
    core.setFailed(
      `start-proxy post-action step failed: ${wrapError(error).message}`,
    );
  }
  const config = await configUtils.getConfig(
    actionsUtil.getTemporaryDirectory(),
    core,
  );

  if ((config && config.debugMode) || core.isDebug()) {
    const logFilePath = core.getState("proxy-log-file");
    if (logFilePath) {
      const readStream = fs.createReadStream(logFilePath);
      readStream.pipe(process.stdout, { end: true });
    }
  }
}

void runWrapper();
