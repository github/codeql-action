import * as githubUtils from "@actions/github/lib/utils";
import * as retry from "@octokit/plugin-retry";
import consoleLogLevel from "console-log-level";

import { getRequiredInput } from "./actions-util";
import * as util from "./util";
import { getRequiredEnvParam, GitHubVersion } from "./util";

// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");

export enum DisallowedAPIVersionReason {
  ACTION_TOO_OLD,
  ACTION_TOO_NEW,
}

export type GitHubApiCombinedDetails = GitHubApiDetails &
  GitHubApiExternalRepoDetails;

export interface GitHubApiDetails {
  auth: string;
  url: string;
  apiURL: string | undefined;
}

export interface GitHubApiExternalRepoDetails {
  externalRepoAuth?: string;
  url: string;
  apiURL: string | undefined;
}

function createApiClientWithDetails(
  apiDetails: GitHubApiCombinedDetails,
  { allowExternal = false } = {}
) {
  const auth =
    (allowExternal && apiDetails.externalRepoAuth) || apiDetails.auth;
  const retryingOctokit = githubUtils.GitHub.plugin(retry.retry);
  return new retryingOctokit(
    githubUtils.getOctokitOptions(auth, {
      baseUrl: apiDetails.apiURL,
      userAgent: `CodeQL-Action/${pkg.version}`,
      log: consoleLogLevel({ level: "debug" }),
    })
  );
}

export function getApiDetails() {
  return {
    auth: getRequiredInput("token"),
    url: getRequiredEnvParam("GITHUB_SERVER_URL"),
    apiURL: getRequiredEnvParam("GITHUB_API_URL"),
  };
}

export function getApiClient() {
  return createApiClientWithDetails(getApiDetails());
}

export function getApiClientWithExternalAuth(
  apiDetails: GitHubApiCombinedDetails
) {
  return createApiClientWithDetails(apiDetails, { allowExternal: true });
}

let cachedGitHubVersion: GitHubVersion | undefined = undefined;

/**
 * Report the GitHub server version. This is a wrapper around
 * util.getGitHubVersion() that automatically supplies GitHub API details using
 * GitHub Action inputs.
 *
 * @returns GitHub version
 */
export async function getGitHubVersion(): Promise<GitHubVersion> {
  if (cachedGitHubVersion === undefined) {
    cachedGitHubVersion = await util.getGitHubVersion(getApiDetails());
  }
  return cachedGitHubVersion;
}
