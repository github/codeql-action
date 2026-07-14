import { ActionState } from "../action-common";
import * as api from "../api-client";
import * as errorMessages from "../error-messages";
import { Feature } from "../feature-flags";
import {
  RepositoryProperties,
  RepositoryPropertyName,
} from "../feature-flags/properties";
import { ConfigurationError } from "../util";

import { parseUserConfig, UserConfig } from "./db-config";
import { parseRemoteFileAddress } from "./remote-file";

/**
 * Gets the value that is configured for the configuration file, if any.
 */
export async function getConfigFileInput(
  {
    logger,
    actions,
    features,
  }: ActionState<["Logger", "Actions", "FeatureFlags"]>,
  repositoryProperties: Partial<RepositoryProperties>,
): Promise<string | undefined> {
  const input = actions.getOptionalInput("config-file");

  if (input !== undefined) {
    logger.info(`Using configuration file input from workflow: ${input}`);
    return input;
  }

  const propertyValue =
    repositoryProperties[RepositoryPropertyName.CONFIG_FILE];

  if (propertyValue !== undefined && propertyValue.trim().length > 0) {
    // Only use the repository property value if the FF is enabled.
    const useRepositoryProperty = await features.getValue(
      Feature.ConfigFileRepositoryProperty,
    );

    if (useRepositoryProperty) {
      logger.info(
        `Using configuration file input from repository property: ${propertyValue}`,
      );
      return propertyValue;
    } else {
      logger.info(
        "Ignoring configuration file input from repository property, because the corresponding feature flag is disabled.",
      );
    }
  }

  return undefined;
}

/**
 * Attempts to fetch a `UserConfig` from a remote `address`.
 *
 * @param actionState The current Action state.
 * @param configFile The remote address of the configuration file.
 * @param apiDetails Information about how to connect to the API.
 *
 * @returns The `UserConfig`, if it could be fetched and parsed successfully.
 */
export async function getRemoteConfig(
  actionState: ActionState<["Logger", "Env", "FeatureFlags"]>,
  configFile: string,
  apiDetails: api.GitHubApiCombinedDetails,
): Promise<UserConfig> {
  const address = await parseRemoteFileAddress(actionState, configFile);

  const shouldProxyRequest = await actionState.features.getValue(
    Feature.ProxyApiRequests,
  );
  const proxy = shouldProxyRequest
    ? api.getRegistryProxy(actionState)
    : undefined;

  const response = await api
    .getApiClientWithExternalAuth(apiDetails, proxy)
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

  const validateConfig = await actionState.features.getValue(
    Feature.ValidateDbConfig,
  );
  return parseUserConfig(
    actionState.logger,
    configFile,
    Buffer.from(fileContents, "base64").toString("binary"),
    validateConfig,
  );
}
