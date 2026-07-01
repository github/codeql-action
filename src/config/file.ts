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
  useRepositoryProperty: boolean,
): string | undefined {
  const input = actions.getOptionalInput("config-file");

  if (input !== undefined) {
    logger.info(`Using configuration file input from workflow: ${input}`);
    return input;
  }

  // Don't take the repository property into consideration if the FF is not enabled.
  if (!useRepositoryProperty) {
    return undefined;
  }

  const propertyValue =
    repositoryProperties[RepositoryPropertyName.CONFIG_FILE];

  if (propertyValue !== undefined && propertyValue.trim().length > 0) {
    logger.info(
      `Using configuration file input from repository property: ${propertyValue}`,
    );
    return propertyValue;
  }

  return undefined;
}
