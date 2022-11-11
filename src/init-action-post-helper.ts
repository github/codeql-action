import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getConfig } from "./config-utils";
import { getActionsLogger } from "./logging";

export async function run(
  uploadDatabaseBundleDebugArtifact: Function,
  uploadLogsDebugArtifact: Function,
  printDebugLogs: Function
) {
  const logger = getActionsLogger();

  const config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
  if (config === undefined) {
    logger.warning(
      "Debugging artifacts are unavailable since the 'init' Action failed before it could produce any."
    );
  }

  // Upload appropriate Actions artifacts for debugging
  if (config?.debugMode) {
    core.info(
      "Debug mode is on. Uploading available database bundles and logs as Actions debugging artifacts..."
    );
    await uploadDatabaseBundleDebugArtifact(config, logger);
    await uploadLogsDebugArtifact(config);

    await printDebugLogs(config);
  }
}
