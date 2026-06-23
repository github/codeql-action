import { ActionsEnv } from "../actions-util";
import * as api from "../api-client";
import * as errorMessages from "../error-messages";
import {
  RepositoryProperties,
  RepositoryPropertyName,
} from "../feature-flags/properties";
import { Logger } from "../logging";
import { ConfigurationError } from "../util";

import { parseUserConfig, UserConfig } from "./db-config";
import { parseRemoteFileAddress } from "./remote-file";

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

  if (propertyValue !== undefined && propertyValue.trim().length > 0) {
    logger.info(
      `Using configuration file input from repository property: ${propertyValue}`,
    );
    return propertyValue;
  }

  return undefined;
}

export async function getRemoteConfig(
  logger: Logger,
  configFile: string,
  apiDetails: api.GitHubApiCombinedDetails,
  validateConfig: boolean,
): Promise<UserConfig> {
  const address = parseRemoteFileAddress(configFile);

  const response = await api
    .getApiClientWithExternalAuth(apiDetails)
    .rest.repos.getContent({
      owner: address.owner,
      repo: address.repo,
      path: address.path,
      ref: address.ref,
    });

  let fileContents: string;
  if ("content" in response.data && response.data.content !== undefined) {
    fileContents = response.data.content;
  } else if (Array.isArray(response.data)) {
    throw new ConfigurationError(
      errorMessages.getConfigFileDirectoryGivenMessage(configFile),
    );
  } else {
    throw new ConfigurationError(
      errorMessages.getConfigFileFormatInvalidMessage(configFile),
    );
  }

  return parseUserConfig(
    logger,
    configFile,
    Buffer.from(fileContents, "base64").toString("binary"),
    validateConfig,
  );
}
