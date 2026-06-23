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
  // retrieve the various parts of the config location, and ensure they're present
  const format = new RegExp(
    "(?<owner>[^/]+)/(?<repo>[^/]+)/(?<path>[^@]+)@(?<ref>.*)",
  );
  const pieces = format.exec(configFile);
  // 5 = 4 groups + the whole expression
  if (pieces?.groups === undefined || pieces.length < 5) {
    throw new ConfigurationError(
      errorMessages.getConfigFileRepoFormatInvalidMessage(configFile),
    );
  }

  const response = await api
    .getApiClientWithExternalAuth(apiDetails)
    .rest.repos.getContent({
      owner: pieces.groups.owner,
      repo: pieces.groups.repo,
      path: pieces.groups.path,
      ref: pieces.groups.ref,
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
