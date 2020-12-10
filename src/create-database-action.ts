import * as core from "@actions/core";
import * as actionsUtil from "./actions-util";
import { finalizeDatabaseCreation } from "./analyze";
import * as config_utils from "./config-utils";
import { getActionsLogger } from "./logging";
import * as util from "./util";

async function run() {
  const logger = getActionsLogger();
  try {
    actionsUtil.prepareLocalRunEnvironment();

    const config = await config_utils.getConfig(
      actionsUtil.getRequiredEnvParam("RUNNER_TEMP"),
      logger
    );
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?"
      );
    }

    await finalizeDatabaseCreation(
      config,
      util.getThreadsFlag(actionsUtil.getOptionalInput("threads"), logger),
      logger
    );
  } catch (error) {
    core.setFailed(`We were unable to create the database.  ${error.message}`);
    console.log(error);
    return;
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`create-database action failed. ${error}`);
    console.log(error);
  }
}

void runWrapper();
