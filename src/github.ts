import { ActionsEnvVars, type ReadOnlyEnv } from "./environment";
import { ConfigurationError } from "./util";

/** A string representing a GitHub instance address. */
export type InstanceURL = string;

/**
 * The URL for github.com.
 */
export const GITHUB_DOTCOM_URL: InstanceURL = "https://github.com";

/** A string representing a GitHub API instance address. */
export type InstanceApiURL = string;

/**
 * The URL for api.github.com.
 */
export const GITHUB_DOTCOM_API_URL: InstanceApiURL = "https://api.github.com";

/**
 * Represents information about a GitHub instance, how to authenticate to it,
 * and how to authenticate to other repos on it.
 */
export type GitHubApiCombinedDetails = GitHubApiDetails &
  GitHubApiExternalRepoDetails;

/** Represents information about a GitHub instance. */
export type GitHubInstance = {
  /** The base URL of the GitHub instance, such as `https://github.com`. */
  url: string;
  /**
   * The API base URL of the GitHub instance, such as `https://api.github.com`.
   * Typically this is the `api.` subdomain of the `url` domain.
   */
  apiURL: string | undefined;
};

/** Represents a {@link GitHubInstance} with a token for accessing the API. */
export type GitHubApiDetails = GitHubInstance & {
  /** The token to use for accessing the API of the GitHub instance. */
  auth?: string;
};

/**
 * Represents information for accessing a repository on the same GitHub instance as the Action
 * is currently running on.
 */
export type GitHubApiExternalRepoDetails = {
  /** An optional token for accessing repo(s) on the same GitHub instance. */
  externalRepoAuth?: string;
};

/**
 * Parses user input of a github.com or GHES URL to a canonical form.
 * Removes any API prefix or suffix if one is present.
 */
export function parseGitHubUrl(inputUrl: string): string {
  const originalUrl = inputUrl;
  if (inputUrl.indexOf("://") === -1) {
    inputUrl = `https://${inputUrl}`;
  }
  if (!inputUrl.startsWith("http://") && !inputUrl.startsWith("https://")) {
    throw new ConfigurationError(`"${originalUrl}" is not a http or https URL`);
  }

  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch {
    throw new ConfigurationError(`"${originalUrl}" is not a valid URL`);
  }

  // If we detect this is trying to be to github.com
  // then return with a fixed canonical URL.
  if (url.hostname === "github.com" || url.hostname === "api.github.com") {
    return GITHUB_DOTCOM_URL;
  }

  // Remove the API prefix if it's present
  if (url.pathname.indexOf("/api/v3") !== -1) {
    url.pathname = url.pathname.substring(0, url.pathname.indexOf("/api/v3"));
  }
  // Also consider subdomain isolation on GHES
  if (url.hostname.startsWith("api.")) {
    url.hostname = url.hostname.substring(4);
  }

  // Normalise path to having a trailing slash for consistency
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  return url.toString();
}

/** Retrieves a {@link GitHubInstance} describing the instance we are running on. */
export function getCurrentInstance(env: ReadOnlyEnv): GitHubInstance {
  return {
    url: env.getRequired(ActionsEnvVars.GITHUB_SERVER_URL),
    apiURL: env.getRequired(ActionsEnvVars.GITHUB_API_URL),
  };
}

/** Retrieves a {@link GitHubInstance} describing the GitHub.com instance. */
export function getDotcomInstance(): GitHubInstance {
  return {
    url: GITHUB_DOTCOM_URL,
    apiURL: GITHUB_DOTCOM_API_URL,
  };
}
