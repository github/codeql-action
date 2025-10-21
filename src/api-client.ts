import * as core from "@actions/core";
import * as githubUtils from "@actions/github/lib/utils";
import * as retry from "@octokit/plugin-retry";
import consoleLogLevel from "console-log-level";

import { getActionVersion, getRequiredInput } from "./actions-util";
import { Logger } from "./logging";
import { getRepositoryNwo, RepositoryNwo } from "./repository";
import {
  asHTTPError,
  ConfigurationError,
  getRequiredEnvParam,
  GITHUB_DOTCOM_URL,
  GitHubVariant,
  GitHubVersion,
  parseGitHubUrl,
  parseMatrixInput,
} from "./util";

const GITHUB_ENTERPRISE_VERSION_HEADER = "x-github-enterprise-version";

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
  { allowExternal = false } = {},
) {
  const auth =
    (allowExternal && apiDetails.externalRepoAuth) || apiDetails.auth;
  const retryingOctokit = githubUtils.GitHub.plugin(retry.retry);
  return new retryingOctokit(
    githubUtils.getOctokitOptions(auth, {
      baseUrl: apiDetails.apiURL,
      userAgent: `CodeQL-Action/${getActionVersion()}`,
      log: consoleLogLevel({ level: "debug" }),
    }),
  );
}

export function getApiDetails(): GitHubApiDetails {
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
  apiDetails: GitHubApiCombinedDetails,
) {
  return createApiClientWithDetails(apiDetails, { allowExternal: true });
}

/**
 * Gets a value for the `Authorization` header for a request to `url`; or `undefined` if the
 * `Authorization` header should not be set for `url`.
 *
 * @param logger The logger to use for debugging messages.
 * @param apiDetails Details of the GitHub API we are using.
 * @param url The URL for which we want to add an `Authorization` header.
 *
 * @returns The value for the `Authorization` header or `undefined` if it shouldn't be populated.
 */
export function getAuthorizationHeaderFor(
  logger: Logger,
  apiDetails: GitHubApiDetails,
  url: string,
): string | undefined {
  // We only want to provide an authorization header if we are downloading
  // from the same GitHub instance the Action is running on.
  // This avoids leaking Enterprise tokens to dotcom.
  if (
    url.startsWith(`${apiDetails.url}/`) ||
    (apiDetails.apiURL && url.startsWith(`${apiDetails.apiURL}/`))
  ) {
    logger.debug(`Providing an authorization token.`);
    return `token ${apiDetails.auth}`;
  }

  logger.debug(`Not using an authorization token.`);
  return undefined;
}

let cachedGitHubVersion: GitHubVersion | undefined = undefined;

export async function getGitHubVersionFromApi(
  apiClient: any,
  apiDetails: GitHubApiDetails,
): Promise<GitHubVersion> {
  // We can avoid making an API request in the standard dotcom case
  if (parseGitHubUrl(apiDetails.url) === GITHUB_DOTCOM_URL) {
    return { type: GitHubVariant.DOTCOM };
  }

  // Doesn't strictly have to be the meta endpoint as we're only
  // using the response headers which are available on every request.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const response = await apiClient.rest.meta.get();

  // This happens on dotcom, although we expect to have already returned in that
  // case. This can also serve as a fallback in cases we haven't foreseen.
  if (response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === undefined) {
    return { type: GitHubVariant.DOTCOM };
  }

  if (response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === "ghe.com") {
    return { type: GitHubVariant.GHE_DOTCOM };
  }

  const version = response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] as string;
  return { type: GitHubVariant.GHES, version };
}

/**
 * Report the GitHub server version. This is a wrapper around
 * util.getGitHubVersion() that automatically supplies GitHub API details using
 * GitHub Action inputs.
 *
 * @returns GitHub version
 */
export async function getGitHubVersion(): Promise<GitHubVersion> {
  if (cachedGitHubVersion === undefined) {
    cachedGitHubVersion = await getGitHubVersionFromApi(
      getApiClient(),
      getApiDetails(),
    );
  }
  return cachedGitHubVersion;
}

/**
 * Get the path of the currently executing workflow relative to the repository root.
 */
export async function getWorkflowRelativePath(): Promise<string> {
  const repo_nwo = getRepositoryNwo();
  const run_id = Number(getRequiredEnvParam("GITHUB_RUN_ID"));

  const apiClient = getApiClient();
  const runsResponse = await apiClient.request(
    "GET /repos/:owner/:repo/actions/runs/:run_id?exclude_pull_requests=true",
    {
      owner: repo_nwo.owner,
      repo: repo_nwo.repo,
      run_id,
    },
  );
  const workflowUrl = runsResponse.data.workflow_url;

  const requiredWorkflowRegex =
    /\/repos\/[^/]+\/[^/]+\/actions\/required_workflows\/[^/]+/;
  if (!workflowUrl || requiredWorkflowRegex.test(workflowUrl as string)) {
    // For required workflows, the workflowUrl is invalid so we cannot fetch more informations
    // about the workflow.
    // However, the path is available in the original response.
    return runsResponse.data.path as string;
  }

  const workflowResponse = await apiClient.request(`GET ${workflowUrl}`);

  return workflowResponse.data.path as string;
}

/**
 * Get the analysis key parameter for the current job.
 *
 * This will combine the workflow path and current job name.
 * Computing this the first time requires making requests to
 * the GitHub API, but after that the result will be cached.
 */
export async function getAnalysisKey(): Promise<string> {
  const analysisKeyEnvVar = "CODEQL_ACTION_ANALYSIS_KEY";

  let analysisKey = process.env[analysisKeyEnvVar];
  if (analysisKey !== undefined) {
    return analysisKey;
  }

  const workflowPath = await getWorkflowRelativePath();
  const jobName = getRequiredEnvParam("GITHUB_JOB");

  analysisKey = `${workflowPath}:${jobName}`;
  core.exportVariable(analysisKeyEnvVar, analysisKey);
  return analysisKey;
}

export async function getAutomationID(): Promise<string> {
  const analysis_key = await getAnalysisKey();
  const environment = getRequiredInput("matrix");

  return computeAutomationID(analysis_key, environment);
}

export function computeAutomationID(
  analysis_key: string,
  environment: string | undefined,
): string {
  let automationID = `${analysis_key}/`;

  const matrix = parseMatrixInput(environment);
  if (matrix !== undefined) {
    // the id has to be deterministic so we sort the fields
    for (const entry of Object.entries(matrix).sort()) {
      if (typeof entry[1] === "string") {
        automationID += `${entry[0]}:${entry[1]}/`;
      } else {
        // In code scanning we just handle the string values,
        // the rest get converted to the empty string
        automationID += `${entry[0]}:/`;
      }
    }
  }

  return automationID;
}

export interface ActionsCacheItem {
  created_at?: string;
  id?: number;
  key?: string;
  size_in_bytes?: number;
}

/** List all Actions cache entries matching the provided key and ref. */
export async function listActionsCaches(
  key: string,
  ref?: string,
): Promise<ActionsCacheItem[]> {
  const repositoryNwo = getRepositoryNwo();

  return await getApiClient().paginate(
    "GET /repos/{owner}/{repo}/actions/caches",
    {
      owner: repositoryNwo.owner,
      repo: repositoryNwo.repo,
      key,
      ref,
    },
  );
}

/** Delete an Actions cache item by its ID. */
export async function deleteActionsCache(id: number) {
  const repositoryNwo = getRepositoryNwo();

  await getApiClient().rest.actions.deleteActionsCacheById({
    owner: repositoryNwo.owner,
    repo: repositoryNwo.repo,
    cache_id: id,
  });
}

/** Retrieve all custom repository properties. */
export async function getRepositoryProperties(repositoryNwo: RepositoryNwo) {
  return getApiClient().request("GET /repos/:owner/:repo/properties/values", {
    owner: repositoryNwo.owner,
    repo: repositoryNwo.repo,
  });
}

export function wrapApiConfigurationError(e: unknown) {
  const httpError = asHTTPError(e);
  if (httpError !== undefined) {
    if (
      [
        /API rate limit exceeded/,
        /commit not found/,
        /Resource not accessible by integration/,
        /ref .* not found in this repository/,
      ].some((pattern) => pattern.test(httpError.message))
    ) {
      return new ConfigurationError(httpError.message);
    }
    if (
      httpError.message.includes("Bad credentials") ||
      httpError.message.includes("Not Found")
    ) {
      return new ConfigurationError(
        "Please check that your token is valid and has the required permissions: contents: read, security-events: write",
      );
    }
    if (httpError.status === 429) {
      return new ConfigurationError("API rate limit exceeded");
    }
  }
  return e;
}
