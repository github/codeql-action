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

/** The default ref to use in configuration file shorthands. */
export const DEFAULT_CONFIG_FILE_REF = "main";

/**
 * Attempts to parse `configFile` into an array of `RemoteFileAddress` components.
 *
 * @param configFile The string to try and parse.
 * @returns The successful result of executing the regex.
 * @throws `ConfigurationError` if the format of `configFile` is not valid.
 */
export function parseRemoteFileAddress(configFile: string): RemoteFileAddress {
  // retrieve the various parts of the config location, and ensure they're present
  const format = new RegExp(
    "(?<owner>[^/]+)/(?<repo>[^/]+)/(?<path>[^@]+)(@(?<ref>.*))?",
  );
  const pieces = format.exec(configFile);

  // Check that the regular expression matched and that we have at least the required components.
  if (
    !pieces?.groups?.owner ||
    !pieces?.groups?.repo ||
    !pieces?.groups?.path
  ) {
    throw new ConfigurationError(
      errorMessages.getConfigFileRepoFormatInvalidMessage(configFile),
    );
  }

  return {
    owner: pieces.groups.owner,
    repo: pieces.groups.repo,
    path: pieces.groups.path,
    ref: pieces.groups.ref || DEFAULT_CONFIG_FILE_REF,
  };
}
