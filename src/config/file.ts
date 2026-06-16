import { ActionsEnv } from "../actions-util";

/**
 * Gets the value that is configured for the configuration file, if any.
 */
export function getConfigFileInput(actions: ActionsEnv): string | undefined {
  return actions.getOptionalInput("config-file");
}
