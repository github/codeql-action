import { ActionsEnv } from "../actions-util";
import {
  RepositoryProperties,
  RepositoryPropertyName,
} from "../feature-flags/properties";

/**
 * Gets the value that is configured for the configuration file, if any.
 */
export function getConfigFileInput(
  actions: ActionsEnv,
  repositoryProperties: Partial<RepositoryProperties>,
): string | undefined {
  return (
    actions.getOptionalInput("config-file") ||
    repositoryProperties[RepositoryPropertyName.CONFIG_FILE]
  );
}
