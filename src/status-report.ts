import * as os from "os";

import * as core from "@actions/core";

import {
  getWorkflowEventName,
  getOptionalInput,
  getRef,
  getWorkflowRunID,
  getWorkflowRunAttempt,
  getActionVersion,
  getRequiredInput,
} from "./actions-util";
import { getAnalysisKey, getApiClient } from "./api-client";
import { EnvVar } from "./environment";
import {
  UserError,
  isHTTPError,
  getRequiredEnvParam,
  getCachedCodeQlVersion,
  isInTestMode,
  GITHUB_DOTCOM_URL,
  DiskUsage,
} from "./util";

export type ActionName =
  | "autobuild"
  | "finish"
  | "init"
  | "init-post"
  | "resolve-environment"
  | "upload-sarif";

export type ActionStatus =
  | "aborted"
  | "failure"
  | "starting"
  | "success"
  | "user-error";

export interface StatusReportBase {
  /** Name of the action being executed. */
  action_name: ActionName;
  /** Version of the action being executed, as a commit oid. */
  action_oid: string;
  /** Version of the action being executed, as a ref. */
  action_ref?: string;
  /** Time this action started. */
  action_started_at: string;
  /** Action version (x.y.z from package.json). */
  action_version: string;
  /** Analysis key, normally composed from the workflow path and job name. */
  analysis_key: string;
  /** Cause of the failure (or undefined if status is not failure). */
  cause?: string;
  /** CodeQL CLI version (x.y.z from the CLI). */
  codeql_version?: string;
  /** Commit oid that the workflow was triggered on. */
  commit_oid: string;
  /** Time this action completed, or undefined if not yet completed. */
  completed_at?: string;
  /** Stack trace of the failure (or undefined if status is not failure). */
  exception?: string;
  /** Job name from the workflow. */
  job_name: string;
  /**
   * UUID representing the job run that this status report belongs to. We
   * generate our own UUID here because Actions currently does not expose a
   * unique job run identifier. This UUID will allow us to more easily match
   * reports from different steps in the same workflow job.
   *
   * If and when Actions does expose a unique job ID, we plan to populate a
   * separate int field, `job_run_id`, with the Actions-generated identifier,
   * as it will allow us to more easily join our telemetry data with Actions
   * telemetry tables.
   */
  job_run_uuid: string;
  /** Value of the matrix for this instantiation of the job. */
  matrix_vars?: string;
  /**
   * Information about the enablement of the ML-powered JS query pack.
   *
   * @see {@link util.getMlPoweredJsQueriesStatus}
   */
  ml_powered_javascript_queries?: string;
  /** Ref that the workflow was triggered on. */
  ref: string;
  /** Action runner hardware architecture (context runner.arch). */
  runner_arch?: string;
  /** Available disk space on the runner, in bytes. */
  runner_available_disk_space_bytes: number;
  /**
   * Version of the runner image, for workflows running on GitHub-hosted runners. Absent otherwise.
   */
  runner_image_version?: string;
  /** Action runner operating system (context runner.os). */
  runner_os: string;
  /** Action runner operating system release (x.y.z from os.release()). */
  runner_os_release?: string;
  /** Total disk space on the runner, in bytes. */
  runner_total_disk_space_bytes: number;
  /** Time the first action started. Normally the init action. */
  started_at: string;
  /** State this action is currently in. */
  status: ActionStatus;
  /**
   * Testing environment: Set if non-production environment.
   * The server accepts one of the following values:
   *  `["", "qa-rc", "qa-rc-1", "qa-rc-2", "qa-experiment-1", "qa-experiment-2", "qa-experiment-3"]`.
   */
  testing_environment: string;
  /** Workflow name. Converted to analysis_name further down the pipeline.. */
  workflow_name: string;
  /** Attempt number of the run containing the action run. */
  workflow_run_attempt: number;
  /** ID of the workflow run containing the action run. */
  workflow_run_id: number;
}

export interface DatabaseCreationTimings {
  scanned_language_extraction_duration_ms?: number;
  trap_import_duration_ms?: number;
}

export function getActionsStatus(
  error?: unknown,
  otherFailureCause?: string,
): ActionStatus {
  if (error || otherFailureCause) {
    return error instanceof UserError ? "user-error" : "failure";
  } else {
    return "success";
  }
}

// Any status report may include an array of EventReports associated with it.
export interface EventReport {
  /** Time this event ended. */
  completed_at: string;
  /** An enumerable description of the event. */
  event: string;
  /** eg: `success`, `failure`, `timeout`, etc. */
  exit_status?: string;
  /** If the event is language-specific. */
  language?: string;
  /**
   * A generic JSON blob of data related to this event.
   * Use Object.assign() to append additional fields to the object.
   */
  properties?: object;
  /** Time this event started. */
  started_at: string;
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
  diskInfo: DiskUsage,
  cause?: string,
  exception?: string,
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
    action_name: actionName,
    action_oid: "unknown", // TODO decide if it's possible to fill this in
    action_ref: actionRef,
    action_started_at: actionStartedAt.toISOString(),
    action_version: getActionVersion(),
    analysis_key,
    commit_oid: commitOid,
    job_name: jobName,
    job_run_uuid: jobRunUUID,
    ref,
    runner_available_disk_space_bytes: diskInfo.numAvailableBytes,
    runner_os: runnerOs,
    runner_total_disk_space_bytes: diskInfo.numTotalBytes,
    started_at: workflowStartedAt,
    status,
    testing_environment: testingEnvironment,
    workflow_name: workflowName,
    workflow_run_attempt: workflowRunAttempt,
    workflow_run_id: workflowRunID,
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
  const imageVersion = process.env["ImageVersion"];
  if (imageVersion) {
    statusReport.runner_image_version = imageVersion;
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
  statusReport: S,
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
      },
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
                "See https://docs.github.com/en/code-security/secure-coding/configuring-code-scanning#scanning-on-push for more information on how to configure these events.",
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
      "An unexpected error occurred when sending code scanning status report.",
    );
    return true;
  }
}
