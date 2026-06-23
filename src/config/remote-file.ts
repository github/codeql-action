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
    "(?<owner>[^/]+)/(?<repo>[^/]+)/(?<path>[^@]+)@(?<ref>.*)",
  );
  const pieces = format.exec(configFile);

  // 5 = 4 groups + the whole expression
  if (pieces?.groups === undefined || pieces.length < 5) {
    throw new ConfigurationError(
      errorMessages.getConfigFileRepoFormatInvalidMessage(configFile),
    );
  }

  return {
    owner: pieces.groups.owner,
    repo: pieces.groups.repo,
    path: pieces.groups.path,
    ref: pieces.groups.ref,
  };
}
