import { ActionState } from "../action-common";
import { ActionsEnvVars } from "../actions-util";
import { Env } from "../environment";
import * as errorMessages from "../error-messages";
import { Feature } from "../feature-flags";
import { ConfigurationError, Failure, Result, Success } from "../util";

/** Represents remote file addresses. */
export interface RemoteFileAddress {
  /** The owner of the repository. */
  owner: string;
  /** The repository name. */
  repo: string;
  /** The path of the file. */
  path: string;
  /** The ref of the repository. */
  ref: string;
}

/** The default file path to use in configuration file shorthands. */
export const DEFAULT_CONFIG_FILE_NAME = ".github/codeql-action.yaml";

/** The default ref to use in configuration file shorthands. */
export const DEFAULT_CONFIG_FILE_REF = "main";

/** Extracts the owner from the `GITHUB_REPOSITORY` environment variable. */
function getDefaultOwner(env: Env): string {
  const currentRepoNwo = env.getRequired(ActionsEnvVars.GITHUB_REPOSITORY);
  const nwoParts = currentRepoNwo.split("/");

  if (nwoParts.length !== 2 || nwoParts[0].trim().length === 0) {
    // This shouldn't happen, so we should throw if `GITHUB_REPOSITORY` doesn't match
    // our expectations.
    throw new Error(
      `Expected ${ActionsEnvVars.GITHUB_REPOSITORY} to contain a name with owner, but got '${currentRepoNwo}'.`,
    );
  }

  return nwoParts[0].trim();
}

/**
 * The old remote address format that's always been supported for the `config-file` input.
 * All the components are required. Unchanged from the previous implementation.
 */
const OLD_REMOTE_ADDRESS_FORMAT = new RegExp(
  "(?<owner>[^/]+)/(?<repo>[^/]+)/(?<path>[^@]+)@(?<ref>.*)",
);

/**
 * Attempts to parse `input` as a `RemoteFileAddress` using the old format.
 *
 * @param input The input to try and parse.
 * @returns A `RemoteFileAddress` value if successful or `undefined` otherwise.
 */
function parseOldRemoteFileAddress(
  input: string,
): Result<RemoteFileAddress, undefined> {
  const pieces = OLD_REMOTE_ADDRESS_FORMAT.exec(input);

  // 5 = 4 groups + the whole expression
  if (pieces?.groups === undefined || pieces.length < 5) {
    return new Failure(undefined);
  }

  return new Success({
    owner: pieces.groups.owner.trim(),
    repo: pieces.groups.repo.trim(),
    path: pieces.groups.path.trim(),
    ref: pieces.groups.ref.trim(),
  });
}

/**
 * Attempts to parse `configFile` into an array of `RemoteFileAddress` components.
 *
 * @param actionState The current Action state.
 * @param configFile The string to try and parse.
 * @returns The successful result of executing the regex.
 * @throws `ConfigurationError` if the format of `configFile` is not valid.
 */
export async function parseRemoteFileAddress(
  actionState: ActionState,
  configFile: string,
): Promise<RemoteFileAddress> {
  // Try to parse the input using the old format. If successful, return the
  // resulting `RemoteFileAddress`. Otherwise, continue using the new format.
  const oldFormatAddressResult = parseOldRemoteFileAddress(configFile);

  if (oldFormatAddressResult.isSuccess()) {
    return oldFormatAddressResult.value;
  }

  // If the FF for the new format is not enabled, throw the old format error.
  const allowNewFormat = await actionState.features.getValue(
    Feature.NewRemoteFileAddresses,
  );
  if (!allowNewFormat) {
    throw new ConfigurationError(
      errorMessages.getConfigFileRepoOldFormatInvalidMessage(configFile),
    );
  }

  // retrieve the various parts of the config location, and ensure they're present
  const format = new RegExp(
    "^((?<owner>[^:@/]+)/)?(?<repo>[^:@/]+)(@(?<ref>[^:]+))?(:(?<path>.+))?$",
  );
  const pieces = format.exec(configFile.trim());

  const repo: string | undefined = pieces?.groups?.repo?.trim();

  // Check that the regular expression matched and that we have at least the repo name.
  if (!pieces?.groups || !repo || repo.length === 0) {
    // Neither the old format nor the new format worked. Throw an error that
    // explains the format we accept. We only mention the new format, since that's
    // what we want to be used going forward.
    throw new ConfigurationError(
      errorMessages.getConfigFileRepoFormatInvalidMessage(configFile),
    );
  }

  const owner: string | undefined = pieces.groups.owner?.trim();
  const path: string | undefined = pieces.groups.path?.trim();
  const ref: string | undefined = pieces.groups.ref?.trim();

  // Ensure that the path is a relative path.
  if (path?.startsWith("/")) {
    throw new ConfigurationError(
      `The path component of '${configFile}' cannot be an absolute path.`,
    );
  }

  return {
    owner: owner || getDefaultOwner(actionState.env),
    repo,
    path: path || DEFAULT_CONFIG_FILE_NAME,
    ref: ref || DEFAULT_CONFIG_FILE_REF,
  };
}
