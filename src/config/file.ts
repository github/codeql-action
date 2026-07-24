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
import { getComputedInput, InputName, type ComputedInput } from "./inputs";
import { parseRemoteFileAddress } from "./remote-file";

/**
 * The prefix that can be specified to indicate that a path should be treated as a local file address.
 */
export const LOCAL_PATH_PREFIX = "./";

/**
 * The prefix that can be specified to indicate that a path should be treated as a remote file address.
 * The new remote file address format must start with either an owner or repository name. Both
 * are restricted to ASCII characters, '.', and '-'. The prefix chosen here does not interfere with
 * those (since it contains an `=`) and is _unlikely_ (but not impossible) to appear in a local file path.
 */
export const REMOTE_PATH_PREFIX = "remote=";

/**
 * Gets the value that is configured for the configuration file, if any.
 */
export async function getConfigFileInput(
  action: ActionState<["Logger", "Actions", "FeatureFlags"]>,
  repositoryProperties: Partial<RepositoryProperties>,
): Promise<ComputedInput | undefined> {
  // Only use the repository property value if the FF is enabled.
  const useRepositoryProperty = await action.features.getValue(
    Feature.ConfigFileRepositoryProperty,
  );

  return getComputedInput(action, repositoryProperties, InputName.ConfigFile, {
    repositoryPropertyFeatureEnabled: useRepositoryProperty,
    allowForcedRepositoryPropertyValue: false,
    repositoryPropertyName: RepositoryPropertyName.CONFIG_FILE,
  });
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
