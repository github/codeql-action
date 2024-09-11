import * as actionsUtil from "./actions-util";
import { getConfig } from "./config-utils";
import { getActionsLogger } from "./logging";

export async function run() {
  const logger = getActionsLogger();

  const config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
  if (config === undefined) {
    throw new Error(
      "Config file could not be found at expected location. Did the 'init' action fail to start?",
    );
  }
}
