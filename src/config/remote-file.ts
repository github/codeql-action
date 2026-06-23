import { ActionsEnvVars } from "../actions-util";
import { Env } from "../environment";
import * as errorMessages from "../error-messages";
import { ConfigurationError } from "../util";

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
 * Attempts to parse `configFile` into an array of `RemoteFileAddress` components.
 *
 * @param env The current environment variables.
 * @param configFile The string to try and parse.
 * @returns The successful result of executing the regex.
 * @throws `ConfigurationError` if the format of `configFile` is not valid.
 */
export function parseRemoteFileAddress(
  env: Env,
  configFile: string,
): RemoteFileAddress {
  // retrieve the various parts of the config location, and ensure they're present
  const format = new RegExp(
    "((?<owner>[^/]+)/)?(?<repo>[^/@]+)(/(?<path>[^@]+))?(@(?<ref>.*))?",
  );
  const pieces = format.exec(configFile);

  // Check that the regular expression matched and that we have at least the repo name.
  if (!pieces?.groups?.repo || pieces.groups.repo.trim().length === 0) {
    throw new ConfigurationError(
      errorMessages.getConfigFileRepoFormatInvalidMessage(configFile),
    );
  }

  // Ensure that the path is a relative path.
  if (pieces.groups.path?.startsWith("/")) {
    throw new ConfigurationError(
      `The path component of '${configFile}' cannot be an absolute path.`,
    );
  }

  return {
    owner: pieces.groups.owner || getDefaultOwner(env),
    repo: pieces.groups.repo.trim(),
    path: pieces.groups.path || DEFAULT_CONFIG_FILE_NAME,
    ref: pieces.groups.ref || DEFAULT_CONFIG_FILE_REF,
  };
}
