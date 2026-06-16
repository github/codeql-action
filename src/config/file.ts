import { ActionsEnv } from "../actions-util";
import {
  RepositoryProperties,
  RepositoryPropertyName,
} from "../feature-flags/properties";
import { Logger } from "../logging";

/**
 * Gets the value that is configured for the configuration file, if any.
 */
export function getConfigFileInput(
  logger: Logger,
  actions: ActionsEnv,
  repositoryProperties: Partial<RepositoryProperties>,
): string | undefined {
  const input = actions.getOptionalInput("config-file");

  if (input !== undefined) {
    logger.info(`Using configuration file input from workflow: ${input}`);
    return input;
  }

  const propertyValue =
    repositoryProperties[RepositoryPropertyName.CONFIG_FILE];

  if (propertyValue !== undefined) {
    logger.info(
      `Using configuration file input from repository property: ${propertyValue}`,
    );
    return propertyValue;
  }

  return undefined;
}
