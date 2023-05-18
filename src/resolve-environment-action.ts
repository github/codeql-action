import * as core from "@actions/core";

import { checkForTimeout, wrapError } from "./util";

async function run() {
  return;
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(
      `resolve environment action failed: ${wrapError(error).message}`
    );
  }
  await checkForTimeout();
}

void runWrapper();
