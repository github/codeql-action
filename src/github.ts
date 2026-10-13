import type { GitHubInstance } from "./api-client";
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
