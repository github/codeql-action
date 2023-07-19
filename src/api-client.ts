import * as os from "os";

import * as core from "@actions/core";
import * as githubUtils from "@actions/github/lib/utils";
import * as retry from "@octokit/plugin-retry";
import consoleLogLevel from "console-log-level";

import {
  ActionName,
  ActionStatus,
  StatusReportBase,
  getActionVersion,
  getOptionalInput,
  getRef,
  getRequiredInput,
  getWorkflowEventName,
  getWorkflowRunAttempt,
  getWorkflowRunID,
} from "./actions-util";
import { EnvVar } from "./environment";
import {
  getCachedCodeQlVersion,
  getRequiredEnvParam,
  GITHUB_DOTCOM_URL,
  GitHubVariant,
  GitHubVersion,
  isHTTPError,
  isInTestMode,
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
  { allowExternal = false } = {}
) {
  const auth =
    (allowExternal && apiDetails.externalRepoAuth) || apiDetails.auth;
  const retryingOctokit = githubUtils.GitHub.plugin(retry.retry);
  return new retryingOctokit(
    githubUtils.getOctokitOptions(auth, {
      baseUrl: apiDetails.apiURL,
      userAgent: `CodeQL-Action/${getActionVersion()}`,
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

export async function getGitHubVersionFromApi(
  apiClient: any,
  apiDetails: GitHubApiDetails
): Promise<GitHubVersion> {
  // We can avoid making an API request in the standard dotcom case
  if (parseGitHubUrl(apiDetails.url) === GITHUB_DOTCOM_URL) {
    return { type: GitHubVariant.DOTCOM };
  }

  // Doesn't strictly have to be the meta endpoint as we're only
  // using the response headers which are available on every request.
  const response = await apiClient.rest.meta.get();

  // This happens on dotcom, although we expect to have already returned in that
  // case. This can also serve as a fallback in cases we haven't foreseen.
  if (response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === undefined) {
    return { type: GitHubVariant.DOTCOM };
  }

  if (response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === "GitHub AE") {
    return { type: GitHubVariant.GHAE };
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
      getApiDetails()
    );
  }
  return cachedGitHubVersion;
}

/**
 * Compose a StatusReport.
 *
 * @param actionName The name of the action, e.g. 'init', 'finish', 'upload-sarif'
 * @param status The status. Must be 'success', 'failure', or 'starting'
 * @param startedAt The time this action started executing.
 * @param cause  Cause of failure (only supply if status is 'failure')
 * @param exception Exception (only supply if status is 'failure')
 */
export async function createStatusReportBase(
  actionName: ActionName,
  status: ActionStatus,
  actionStartedAt: Date,
  cause?: string,
  exception?: string
): Promise<StatusReportBase> {
  const commitOid = getOptionalInput("sha") || process.env["GITHUB_SHA"] || "";
  const ref = await getRef();
  const jobRunUUID = process.env[EnvVar.JOB_RUN_UUID] || "";
  const workflowRunID = getWorkflowRunID();
  const workflowRunAttempt = getWorkflowRunAttempt();
  const workflowName = process.env["GITHUB_WORKFLOW"] || "";
  const jobName = process.env["GITHUB_JOB"] || "";
  const analysis_key = await getAnalysisKey();
  let workflowStartedAt = process.env[EnvVar.WORKFLOW_STARTED_AT];
  if (workflowStartedAt === undefined) {
    workflowStartedAt = actionStartedAt.toISOString();
    core.exportVariable(EnvVar.WORKFLOW_STARTED_AT, workflowStartedAt);
  }
  const runnerOs = getRequiredEnvParam("RUNNER_OS");
  const codeQlCliVersion = getCachedCodeQlVersion();
  const actionRef = process.env["GITHUB_ACTION_REF"];
  const testingEnvironment = process.env[EnvVar.TESTING_ENVIRONMENT] || "";
  // re-export the testing environment variable so that it is available to subsequent steps,
  // even if it was only set for this step
  if (testingEnvironment !== "") {
    core.exportVariable(EnvVar.TESTING_ENVIRONMENT, testingEnvironment);
  }

  const statusReport: StatusReportBase = {
    job_run_uuid: jobRunUUID,
    workflow_run_id: workflowRunID,
    workflow_run_attempt: workflowRunAttempt,
    workflow_name: workflowName,
    job_name: jobName,
    analysis_key,
    commit_oid: commitOid,
    ref,
    action_name: actionName,
    action_ref: actionRef,
    action_oid: "unknown", // TODO decide if it's possible to fill this in
    started_at: workflowStartedAt,
    action_started_at: actionStartedAt.toISOString(),
    status,
    testing_environment: testingEnvironment,
    runner_os: runnerOs,
    action_version: getActionVersion(),
  };

  // Add optional parameters
  if (cause) {
    statusReport.cause = cause;
  }
  if (exception) {
    statusReport.exception = exception;
  }
  if (
    status === "success" ||
    status === "failure" ||
    status === "aborted" ||
    status === "user-error"
  ) {
    statusReport.completed_at = new Date().toISOString();
  }
  const matrix = getRequiredInput("matrix");
  if (matrix) {
    statusReport.matrix_vars = matrix;
  }
  if ("RUNNER_ARCH" in process.env) {
    // RUNNER_ARCH is available only in GHES 3.4 and later
    // Values other than X86, X64, ARM, or ARM64 are discarded server side
    statusReport.runner_arch = process.env["RUNNER_ARCH"];
  }
  if (runnerOs === "Windows" || runnerOs === "macOS") {
    statusReport.runner_os_release = os.release();
  }
  if (codeQlCliVersion !== undefined) {
    statusReport.codeql_version = codeQlCliVersion;
  }

  return statusReport;
}

const GENERIC_403_MSG =
  "The repo on which this action is running is not opted-in to CodeQL code scanning.";
const GENERIC_404_MSG =
  "Not authorized to use the CodeQL code scanning feature on this repo.";
const OUT_OF_DATE_MSG =
  "CodeQL Action is out-of-date. Please upgrade to the latest version of codeql-action.";
const INCOMPATIBLE_MSG =
  "CodeQL Action version is incompatible with the code scanning endpoint. Please update to a compatible version of codeql-action.";

/**
 * Send a status report to the code_scanning/analysis/status endpoint.
 *
 * Optionally checks the response from the API endpoint and sets the action
 * as failed if the status report failed. This is only expected to be used
 * when sending a 'starting' report.
 *
 * Returns whether sending the status report was successful of not.
 */
export async function sendStatusReport<S extends StatusReportBase>(
  statusReport: S
): Promise<boolean> {
  const statusReportJSON = JSON.stringify(statusReport);
  core.debug(`Sending status report: ${statusReportJSON}`);
  // If in test mode we don't want to upload the results
  if (isInTestMode()) {
    core.debug("In test mode. Status reports are not uploaded.");
    return true;
  }

  const nwo = getRequiredEnvParam("GITHUB_REPOSITORY");
  const [owner, repo] = nwo.split("/");
  const client = getApiClient();

  try {
    await client.request(
      "PUT /repos/:owner/:repo/code-scanning/analysis/status",
      {
        owner,
        repo,
        data: statusReportJSON,
      }
    );

    return true;
  } catch (e) {
    console.log(e);
    if (isHTTPError(e)) {
      switch (e.status) {
        case 403:
          if (
            getWorkflowEventName() === "push" &&
            process.env["GITHUB_ACTOR"] === "dependabot[bot]"
          ) {
            core.setFailed(
              'Workflows triggered by Dependabot on the "push" event run with read-only access. ' +
                "Uploading Code Scanning results requires write access. " +
                'To use Code Scanning with Dependabot, please ensure you are using the "pull_request" event for this workflow and avoid triggering on the "push" event for Dependabot branches. ' +
                "See https://docs.github.com/en/code-security/secure-coding/configuring-code-scanning#scanning-on-push for more information on how to configure these events."
            );
          } else {
            core.setFailed(e.message || GENERIC_403_MSG);
          }
          return false;
        case 404:
          core.setFailed(GENERIC_404_MSG);
          return false;
        case 422:
          // schema incompatibility when reporting status
          // this means that this action version is no longer compatible with the API
          // we still want to continue as it is likely the analysis endpoint will work
          if (getRequiredEnvParam("GITHUB_SERVER_URL") !== GITHUB_DOTCOM_URL) {
            core.debug(INCOMPATIBLE_MSG);
          } else {
            core.debug(OUT_OF_DATE_MSG);
          }
          return true;
      }
    }

    // something else has gone wrong and the request/response will be logged by octokit
    // it's possible this is a transient error and we should continue scanning
    core.error(
      "An unexpected error occurred when sending code scanning status report."
    );
    return true;
  }
}

/**
 * Get the path of the currently executing workflow relative to the repository root.
 */
export async function getWorkflowRelativePath(): Promise<string> {
  const repo_nwo = getRequiredEnvParam("GITHUB_REPOSITORY").split("/");
  const owner = repo_nwo[0];
  const repo = repo_nwo[1];
  const run_id = Number(getRequiredEnvParam("GITHUB_RUN_ID"));

  const apiClient = getApiClient();
  const runsResponse = await apiClient.request(
    "GET /repos/:owner/:repo/actions/runs/:run_id?exclude_pull_requests=true",
    {
      owner,
      repo,
      run_id,
    }
  );
  const workflowUrl = runsResponse.data.workflow_url;

  const workflowResponse = await apiClient.request(`GET ${workflowUrl}`);

  return workflowResponse.data.path;
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
  environment: string | undefined
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
