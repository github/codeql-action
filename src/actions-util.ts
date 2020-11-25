import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";
import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as safeWhich from "@chrisgavin/safe-which";
import * as yaml from "js-yaml";

import * as api from "./api-client";
import * as sharedEnv from "./shared-environment";
import { GITHUB_DOTCOM_URL, isLocalRun } from "./util";

/**
 * Wrapper around core.getInput for inputs that always have a value.
 * Also see getOptionalInput.
 *
 * This allows us to get stronger type checking of required/optional inputs
 * and make behaviour more consistent between actions and the runner.
 */
export function getRequiredInput(name: string): string {
  return core.getInput(name, { required: true });
}

/**
 * Wrapper around core.getInput that converts empty inputs to undefined.
 * Also see getRequiredInput.
 *
 * This allows us to get stronger type checking of required/optional inputs
 * and make behaviour more consistent between actions and the runner.
 */
export function getOptionalInput(name: string): string | undefined {
  const value = core.getInput(name);
  return value.length > 0 ? value : undefined;
}

/**
 * Get an environment parameter, but throw an error if it is not set.
 */
export function getRequiredEnvParam(paramName: string): string {
  const value = process.env[paramName];
  if (value === undefined || value.length === 0) {
    throw new Error(`${paramName} environment variable must be set`);
  }
  core.debug(`${paramName}=${value}`);
  return value;
}

/**
 * Ensures all required environment variables are set in the context of a local run.
 */
export function prepareLocalRunEnvironment() {
  if (!isLocalRun()) {
    return;
  }

  core.debug("Action is running locally.");
  if (!process.env.GITHUB_JOB) {
    core.exportVariable("GITHUB_JOB", "UNKNOWN-JOB");
  }
  if (!process.env.CODEQL_ACTION_ANALYSIS_KEY) {
    core.exportVariable(
      "CODEQL_ACTION_ANALYSIS_KEY",
      `LOCAL-RUN:${process.env.GITHUB_JOB}`
    );
  }
}

/**
 * Gets the SHA of the commit that is currently checked out.
 */
export const getCommitOid = async function (): Promise<string> {
  // Try to use git to get the current commit SHA. If that fails then
  // log but otherwise silently fall back to using the SHA from the environment.
  // The only time these two values will differ is during analysis of a PR when
  // the workflow has changed the current commit to the head commit instead of
  // the merge commit, which must mean that git is available.
  // Even if this does go wrong, it's not a huge problem for the alerts to
  // reported on the merge commit.
  try {
    let commitOid = "";
    await new toolrunner.ToolRunner(
      await safeWhich.safeWhich("git"),
      ["rev-parse", "HEAD"],
      {
        silent: true,
        listeners: {
          stdout: (data) => {
            commitOid += data.toString();
          },
          stderr: (data) => {
            process.stderr.write(data);
          },
        },
      }
    ).exec();
    return commitOid.trim();
  } catch (e) {
    core.info(
      `Failed to call git to get current commit. Continuing with data from environment: ${e}`
    );
    return getRequiredEnvParam("GITHUB_SHA");
  }
};

interface WorkflowJobStep {
  run: any;
}

interface WorkflowJob {
  steps?: WorkflowJobStep[];
}

interface WorkflowTrigger {
  branches?: string[];
  paths?: string[];
}

interface WorkflowTriggers {
  push?: WorkflowTrigger | null;
  pull_request?: WorkflowTrigger | null;
}

interface Workflow {
  jobs?: { [key: string]: WorkflowJob };
  on?: string | string[] | WorkflowTriggers;
}

function isObject(o): o is object {
  return o !== null && typeof o === "object";
}

enum MissingTriggers {
  None = 0,
  Push = 1,
  PullRequest = 2,
}

interface CodedError {
  message: string;
  code: string;
}

function toCodedErrors(errors: {
  [key: string]: string;
}): { [key: string]: CodedError } {
  return Object.entries(errors).reduce((acc, [key, value]) => {
    acc[key] = { message: value, code: key };
    return acc;
  }, {} as ReturnType<typeof toCodedErrors>);
}

export const WorkflowErrors = toCodedErrors({
  MismatchedBranches: `Please make sure that every branch in on.pull_request is also in on.push so that Code Scanning can compare pull requests against the state of the base branch.`,
  MissingHooks: `Please specify on.push and on.pull_request hooks so that Code Scanning can compare pull requests against the state of the base branch.`,
  MissingPullRequestHook: `Please specify an on.pull_request hook so that Code Scanning is run against pull requests.`,
  MissingPushHook: `Please specify an on.push hook so that Code Scanning can compare pull requests against the state of the base branch.`,
  PathsSpecified: `Please do not specify paths in on.pull as this can cause missing Code Scanning analysis states for the base branch.`,
  CheckoutWrongHead: `git checkout HEAD^2 is no longer necessary. Please remove this step as Code Scanning recommends analyzing the merge commit for best results.`,
});

export function validateWorkflow(doc: Workflow): CodedError[] {
  const errors: CodedError[] = [];

  // .jobs[key].steps[].run
  for (const job of Object.values(doc?.jobs || {})) {
    for (const step of job?.steps || []) {
      // this was advice that we used to give in the README
      // we actually want to run the analysis on the merge commit
      // to produce results that are more inline with expectations
      // (i.e: this is what will happen if you merge this PR)
      // and avoid some race conditions
      if (step?.run === "git checkout HEAD^2") {
        errors.push(WorkflowErrors.CheckoutWrongHead);
      }
    }
  }

  let missing = MissingTriggers.None;

  if (doc.on === undefined) {
    missing = MissingTriggers.Push | MissingTriggers.PullRequest;
  } else if (typeof doc.on === "string") {
    switch (doc.on) {
      case "push":
        missing = MissingTriggers.PullRequest;
        break;
      case "pull_request":
        missing = MissingTriggers.Push;
        break;
      default:
        missing = MissingTriggers.Push | MissingTriggers.PullRequest;
        break;
    }
  } else if (Array.isArray(doc.on)) {
    if (!doc.on.includes("push")) {
      missing = missing | MissingTriggers.Push;
    }
    if (!doc.on.includes("pull_request")) {
      missing = missing | MissingTriggers.PullRequest;
    }
  } else if (isObject(doc.on)) {
    if (!Object.prototype.hasOwnProperty.call(doc.on, "pull_request")) {
      missing = missing | MissingTriggers.PullRequest;
    }
    if (!Object.prototype.hasOwnProperty.call(doc.on, "push")) {
      missing = missing | MissingTriggers.Push;
    } else {
      const paths = doc.on.push?.paths;
      if (Array.isArray(paths) && paths.length > 0) {
        // if you specify paths you can end up with commits that have no baseline
        // if they didn't change any files
        // currently we cannot go back through the history and find the most recent baseline
        errors.push(WorkflowErrors.PathsSpecified);
      }
    }

    if (doc.on.push) {
      const push = doc.on.push.branches || [];

      if (doc.on.pull_request) {
        const pull_request = doc.on.pull_request.branches || [];
        const intersects = pull_request.filter(
          (value) => !push.includes(value)
        );
        if (intersects.length > 0) {
          // there are branches in pull_request that may not have a baseline
          // because we are not building them on push
          errors.push(WorkflowErrors.MismatchedBranches);
        }
      } else if (push.length > 0) {
        // push is set up to run on a subset of branches
        // and you could open a PR against a branch with no baseline
        errors.push(WorkflowErrors.MismatchedBranches);
      }
    }
  }

  switch (missing) {
    case MissingTriggers.PullRequest | MissingTriggers.Push:
      errors.push(WorkflowErrors.MissingHooks);
      break;
    case MissingTriggers.PullRequest:
      errors.push(WorkflowErrors.MissingPullRequestHook);
      break;
    case MissingTriggers.Push:
      errors.push(WorkflowErrors.MissingPushHook);
      break;
  }

  return errors;
}

export async function getWorkflowErrors(): Promise<CodedError[] | undefined> {
  const workflow = await getWorkflow();

  if (workflow === undefined) {
    return undefined;
  }

  const workflowErrors = validateWorkflow(workflow);

  if (workflowErrors.length === 0) {
    return undefined;
  }

  return workflowErrors;
}

export function formatWorkflowErrors(errors: CodedError[]): string {
  const issuesWere = errors.length === 1 ? "issue was" : "issues were";

  const errorsList = `* ${errors.map((e) => e.message).join("\n* ")}`;

  return `${errors.length} ${issuesWere} detected with this workflow:
  
${errorsList}

Please visit https://docs.github.com/en/free-pro-team@latest/github/finding-security-vulnerabilities-and-errors-in-your-code/configuring-code-scanning for the latest guidance on configuring Code Scanning.`;
}

export function formatWorkflowCause(errors?: CodedError[]): undefined | string {
  if (errors === undefined) {
    return undefined;
  }
  return errors.map((e) => e.code).join(",");
}

export async function getWorkflow(): Promise<Workflow | undefined> {
  const relativePath = await getWorkflowPath();
  const absolutePath = path.join(
    getRequiredEnvParam("GITHUB_WORKSPACE"),
    relativePath
  );

  try {
    return yaml.safeLoad(fs.readFileSync(absolutePath, "utf-8"));
  } catch (e) {
    core.warning(`Could not read workflow: ${e.toString()}`);
    return undefined;
  }
}

/**
 * Get the path of the currently executing workflow.
 */
async function getWorkflowPath(): Promise<string> {
  if (isLocalRun()) {
    return getRequiredEnvParam("WORKFLOW_PATH");
  }

  const repo_nwo = getRequiredEnvParam("GITHUB_REPOSITORY").split("/");
  const owner = repo_nwo[0];
  const repo = repo_nwo[1];
  const run_id = Number(getRequiredEnvParam("GITHUB_RUN_ID"));

  const apiClient = api.getActionsApiClient();
  const runsResponse = await apiClient.request(
    "GET /repos/:owner/:repo/actions/runs/:run_id",
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
 * Get the workflow run ID.
 */
export function getWorkflowRunID(): number {
  const workflowRunID = parseInt(getRequiredEnvParam("GITHUB_RUN_ID"), 10);
  if (Number.isNaN(workflowRunID)) {
    throw new Error("GITHUB_RUN_ID must define a non NaN workflow run ID");
  }
  return workflowRunID;
}

/**
 * Get the analysis key paramter for the current job.
 *
 * This will combine the workflow path and current job name.
 * Computing this the first time requires making requests to
 * the github API, but after that the result will be cached.
 */
export async function getAnalysisKey(): Promise<string> {
  const analysisKeyEnvVar = "CODEQL_ACTION_ANALYSIS_KEY";

  let analysisKey = process.env[analysisKeyEnvVar];
  if (analysisKey !== undefined) {
    return analysisKey;
  }

  const workflowPath = await getWorkflowPath();
  const jobName = getRequiredEnvParam("GITHUB_JOB");

  analysisKey = `${workflowPath}:${jobName}`;
  core.exportVariable(analysisKeyEnvVar, analysisKey);
  return analysisKey;
}

/**
 * Get the ref currently being analyzed.
 */
export async function getRef(): Promise<string> {
  // Will be in the form "refs/heads/master" on a push event
  // or in the form "refs/pull/N/merge" on a pull_request event
  const ref = getRequiredEnvParam("GITHUB_REF");

  // For pull request refs we want to detect whether the workflow
  // has run `git checkout HEAD^2` to analyze the 'head' ref rather
  // than the 'merge' ref. If so, we want to convert the ref that
  // we report back.
  const pull_ref_regex = /refs\/pull\/(\d+)\/merge/;
  const checkoutSha = await getCommitOid();

  if (
    pull_ref_regex.test(ref) &&
    checkoutSha !== getRequiredEnvParam("GITHUB_SHA")
  ) {
    return ref.replace(pull_ref_regex, "refs/pull/$1/head");
  } else {
    return ref;
  }
}

type ActionName = "init" | "autobuild" | "finish" | "upload-sarif";
type ActionStatus = "starting" | "aborted" | "success" | "failure";

export interface StatusReportBase {
  // ID of the workflow run containing the action run
  workflow_run_id: number;
  // Workflow name. Converted to analysis_name further down the pipeline.
  workflow_name: string;
  // Job name from the workflow
  job_name: string;
  // Analysis key, normally composed from the workflow path and job name
  analysis_key: string;
  // Value of the matrix for this instantiation of the job
  matrix_vars?: string;
  // Commit oid that the workflow was triggered on
  commit_oid: string;
  // Ref that the workflow was triggered on
  ref: string;
  // Name of the action being executed
  action_name: ActionName;
  // Version of the action being executed, as a ref
  action_ref?: string;
  // Version of the action being executed, as a commit oid
  action_oid: string;
  // Time the first action started. Normally the init action
  started_at: string;
  // Time this action started
  action_started_at: string;
  // Time this action completed, or undefined if not yet completed
  completed_at?: string;
  // State this action is currently in
  status: ActionStatus;
  // Cause of the failure (or undefined if status is not failure)
  cause?: string;
  // Stack trace of the failure (or undefined if status is not failure)
  exception?: string;
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
  const commitOid = process.env["GITHUB_SHA"] || "";
  const ref = await getRef();
  const workflowRunIDStr = process.env["GITHUB_RUN_ID"];
  let workflowRunID = -1;
  if (workflowRunIDStr) {
    workflowRunID = parseInt(workflowRunIDStr, 10);
  }
  const workflowName = process.env["GITHUB_WORKFLOW"] || "";
  const jobName = process.env["GITHUB_JOB"] || "";
  const analysis_key = await getAnalysisKey();
  let workflowStartedAt = process.env[sharedEnv.CODEQL_WORKFLOW_STARTED_AT];
  if (workflowStartedAt === undefined) {
    workflowStartedAt = actionStartedAt.toISOString();
    core.exportVariable(
      sharedEnv.CODEQL_WORKFLOW_STARTED_AT,
      workflowStartedAt
    );
  }
  // If running locally then the GITHUB_ACTION_REF cannot be trusted as it may be for the previous action
  // See https://github.com/actions/runner/issues/803
  const actionRef = isRunningLocalAction()
    ? undefined
    : process.env["GITHUB_ACTION_REF"];

  const statusReport: StatusReportBase = {
    workflow_run_id: workflowRunID,
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
  };

  // Add optional parameters
  if (cause) {
    statusReport.cause = cause;
  }
  if (exception) {
    statusReport.exception = exception;
  }
  if (status === "success" || status === "failure" || status === "aborted") {
    statusReport.completed_at = new Date().toISOString();
  }
  const matrix = getRequiredInput("matrix");
  if (matrix) {
    statusReport.matrix_vars = matrix;
  }

  return statusReport;
}

interface HTTPError {
  status: number;
}

function isHTTPError(arg: any): arg is HTTPError {
  return arg?.status !== undefined && Number.isInteger(arg.status);
}

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
  if (isLocalRun()) {
    core.debug("Not sending status report because this is a local run");
    return true;
  }

  const statusReportJSON = JSON.stringify(statusReport);
  core.debug(`Sending status report: ${statusReportJSON}`);

  const nwo = getRequiredEnvParam("GITHUB_REPOSITORY");
  const [owner, repo] = nwo.split("/");
  const client = api.getActionsApiClient();

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
    if (isHTTPError(e)) {
      switch (e.status) {
        case 403:
          core.setFailed(
            "The repo on which this action is running is not opted-in to CodeQL code scanning."
          );
          return false;
        case 404:
          core.setFailed(
            "Not authorized to used the CodeQL code scanning feature on this repo."
          );
          return false;
        case 422:
          // schema incompatibility when reporting status
          // this means that this action version is no longer compatible with the API
          // we still want to continue as it is likely the analysis endpoint will work
          if (getRequiredEnvParam("GITHUB_SERVER_URL") !== GITHUB_DOTCOM_URL) {
            core.warning(
              "CodeQL Action version is incompatible with the code scanning endpoint. Please update to a compatible version of codeql-action."
            );
          } else {
            core.warning(
              "CodeQL Action is out-of-date. Please upgrade to the latest version of codeql-action."
            );
          }

          return true;
      }
    }

    // something else has gone wrong and the request/response will be logged by octokit
    // it's possible this is a transient error and we should continue scanning
    core.error(
      "An unexpected error occured when sending code scanning status report."
    );
    return true;
  }
}

// Is the current action executing a local copy (i.e. we're running a workflow on the codeql-action repo itself)
// as opposed to running a remote action (i.e. when another repo references us)
export function isRunningLocalAction(): boolean {
  const relativeScriptPath = getRelativeScriptPath();
  return (
    relativeScriptPath.startsWith("..") || path.isAbsolute(relativeScriptPath)
  );
}

// Get the location where the action is running from.
// This can be used to get the actions name or tell if we're running a local action.
export function getRelativeScriptPath(): string {
  const runnerTemp = getRequiredEnvParam("RUNNER_TEMP");
  const actionsDirectory = path.join(path.dirname(runnerTemp), "_actions");
  return path.relative(actionsDirectory, __filename);
}
