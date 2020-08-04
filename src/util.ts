import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from "fs";
import * as os from 'os';
import * as path from 'path';

import * as api from './api-client';
import * as sharedEnv from './shared-environment';

/**
 * Should the current action be aborted?
 *
 * This method should be called at the start of all CodeQL actions and they
 * should abort cleanly if this returns true without failing the action.
 * This method will call `core.setFailed` if necessary.
 */
export function should_abort(actionName: string, requireInitActionHasRun: boolean): boolean {

  // Check that required aspects of the environment are present
  const ref = process.env['GITHUB_REF'];
  if (ref === undefined) {
    core.setFailed('GITHUB_REF must be set.');
    return true;
  }

  // If the init action is required, then check the it completed successfully.
  if (requireInitActionHasRun && process.env[sharedEnv.CODEQL_ACTION_INIT_COMPLETED] === undefined) {
    core.setFailed('The CodeQL ' + actionName + ' action cannot be used unless the CodeQL init action is run first. Aborting.');
    return true;
  }

  return false;
}

/**
 * Get an environment parameter, but throw an error if it is not set.
 */
export function getRequiredEnvParam(paramName: string): string {
  const value = process.env[paramName];
  if (value === undefined || value.length === 0) {
    throw new Error(paramName + ' environment variable must be set');
  }
  core.debug(paramName + '=' + value);
  return value;
}

/**
 * Gets the SHA of the commit that is currently checked out.
 */
export async function getCommitOid(): Promise<string> {
  // Try to use git to get the current commit SHA. If that fails then
  // log but otherwise silently fall back to using the SHA from the environment.
  // The only time these two values will differ is during analysis of a PR when
  // the workflow has changed the current commit to the head commit instead of
  // the merge commit, which must mean that git is available.
  // Even if this does go wrong, it's not a huge problem for the alerts to
  // reported on the merge commit.
  try {
    let commitOid = '';
    await exec.exec('git', ['rev-parse', 'HEAD'], {
      silent: true,
      listeners: {
        stdout: (data) => { commitOid += data.toString(); },
        stderr: (data) => { process.stderr.write(data); }
      }
    });
    return commitOid.trim();
  } catch (e) {
    core.info("Failed to call git to get current commit. Continuing with data from environment: " + e);
    return getRequiredEnvParam('GITHUB_SHA');
  }
}

/**
 * Get the path of the currently executing workflow.
 */
async function getWorkflowPath(): Promise<string> {
  const repo_nwo = getRequiredEnvParam('GITHUB_REPOSITORY').split("/");
  const owner = repo_nwo[0];
  const repo = repo_nwo[1];
  const run_id = Number(getRequiredEnvParam('GITHUB_RUN_ID'));

  const apiClient = api.getApiClient();
  const runsResponse = await apiClient.request('GET /repos/:owner/:repo/actions/runs/:run_id', {
    owner,
    repo,
    run_id
  });
  const workflowUrl = runsResponse.data.workflow_url;

  const workflowResponse = await apiClient.request('GET ' + workflowUrl);

  return workflowResponse.data.path;
}

/**
 * Get the analysis key paramter for the current job.
 *
 * This will combine the workflow path and current job name.
 * Computing this the first time requires making requests to
 * the github API, but after that the result will be cached.
 */
export async function getAnalysisKey(): Promise<string> {
  let analysisKey = process.env[sharedEnv.CODEQL_ACTION_ANALYSIS_KEY];
  if (analysisKey !== undefined) {
    return analysisKey;
  }

  const workflowPath = await getWorkflowPath();
  const jobName = getRequiredEnvParam('GITHUB_JOB');

  analysisKey = workflowPath + ':' + jobName;
  core.exportVariable(sharedEnv.CODEQL_ACTION_ANALYSIS_KEY, analysisKey);
  return analysisKey;
}

/**
 * Get the ref currently being analyzed.
 */
export function getRef(): string {
  // Will be in the form "refs/heads/master" on a push event
  // or in the form "refs/pull/N/merge" on a pull_request event
  const ref = getRequiredEnvParam('GITHUB_REF');

  // For pull request refs we want to convert from the 'merge' ref
  // to the 'head' ref, as that is what we want to analyse.
  // There should have been some code earlier in the workflow to do
  // the checkout, but we have no way of verifying that here.
  const pull_ref_regex = /refs\/pull\/(\d+)\/merge/;
  if (pull_ref_regex.test(ref)) {
    return ref.replace(pull_ref_regex, 'refs/pull/$1/head');
  } else {
    return ref;
  }
}

type ActionName = 'init' | 'autobuild' | 'finish' | 'upload-sarif';
type ActionStatus = 'starting' | 'aborted' | 'success' | 'failure';

export interface StatusReportBase {
  // ID of the workflow run containing the action run
  "workflow_run_id": number;
  // Workflow name. Converted to analysis_name further down the pipeline.
  "workflow_name": string;
  // Job name from the workflow
  "job_name": string;
  // Analysis key, normally composed from the workflow path and job name
  "analysis_key": string;
  // Value of the matrix for this instantiation of the job
  "matrix_vars"?: string;
  // Commit oid that the workflow was triggered on
  "commit_oid": string;
  // Ref that the workflow was triggered on
  "ref": string;
  // Name of the action being executed
  "action_name": ActionName;
  // Version if the action being executed, as a commit oid
  "action_oid": string;
  // Time the first action started. Normally the init action
  "started_at": string;
  // Time this action started
  "action_started_at": string;
  // Time this action completed, or undefined if not yet completed
  "completed_at"?: string;
  // State this action is currently in
  "status": ActionStatus;
  // Cause of the failure (or undefined if status is not failure)
  "cause"?: string;
  // Stack trace of the failure (or undefined if status is not failure)
  "exception"?: string;
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
  exception?: string):
  Promise<StatusReportBase> {

  const commitOid = process.env['GITHUB_SHA'] || '';
  const ref = getRef();
  const workflowRunIDStr = process.env['GITHUB_RUN_ID'];
  let workflowRunID = -1;
  if (workflowRunIDStr) {
    workflowRunID = parseInt(workflowRunIDStr, 10);
  }
  const workflowName = process.env['GITHUB_WORKFLOW'] || '';
  const jobName = process.env['GITHUB_JOB'] || '';
  const analysis_key = await getAnalysisKey();
  let workflowStartedAt = process.env[sharedEnv.CODEQL_WORKFLOW_STARTED_AT];
  if (workflowStartedAt === undefined) {
    workflowStartedAt = actionStartedAt.toISOString();
    core.exportVariable(sharedEnv.CODEQL_WORKFLOW_STARTED_AT, workflowStartedAt);
  }

  let statusReport: StatusReportBase = {
    workflow_run_id: workflowRunID,
    workflow_name: workflowName,
    job_name: jobName,
    analysis_key: analysis_key,
    commit_oid: commitOid,
    ref: ref,
    action_name: actionName,
    action_oid: "unknown", // TODO decide if it's possible to fill this in
    started_at: workflowStartedAt,
    action_started_at: actionStartedAt.toISOString(),
    status: status
  };

  // Add optional parameters
  if (cause) {
    statusReport.cause = cause;
  }
  if (exception) {
    statusReport.exception = exception;
  }
  if (status === 'success' || status === 'failure' || status === 'aborted') {
    statusReport.completed_at = new Date().toISOString();
  }
  let matrix: string | undefined = core.getInput('matrix');
  if (matrix) {
    statusReport.matrix_vars = matrix;
  }

  return statusReport;
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
  statusReport: S,
  ignoreFailures?: boolean): Promise<boolean> {

  const statusReportJSON = JSON.stringify(statusReport);

  core.debug('Sending status report: ' + statusReportJSON);

  const nwo = getRequiredEnvParam("GITHUB_REPOSITORY");
  const [owner, repo] = nwo.split("/");
  const statusResponse = await api.getApiClient().request('PUT /repos/:owner/:repo/code-scanning/analysis/status', {
    owner: owner,
    repo: repo,
    data: statusReportJSON,
  });

  if (!ignoreFailures) {
    // If the status report request fails with a 403 or a 404, then this is a deliberate
    // message from the endpoint that the SARIF upload can be expected to fail too,
    // so the action should fail to avoid wasting actions minutes.
    //
    // Other failure responses (or lack thereof) could be transitory and should not
    // cause the action to fail.
    if (statusResponse.status === 403) {
      core.setFailed('The repo on which this action is running is not opted-in to CodeQL code scanning.');
      return false;
    }
    if (statusResponse.status === 404) {
      core.setFailed('Not authorized to used the CodeQL code scanning feature on this repo.');
      return false;
    }
  }

  return true;
}

/**
 * Get the array of all the tool names contained in the given sarif contents.
 *
 * Returns an array of unique string tool names.
 */
export function getToolNames(sarifContents: string): string[] {
  const sarif = JSON.parse(sarifContents);
  const toolNames = {};

  for (const run of sarif.runs || []) {
    const tool = run.tool || {};
    const driver = tool.driver || {};
    if (typeof driver.name === "string" && driver.name.length > 0) {
      toolNames[driver.name] = true;
    }
  }

  return Object.keys(toolNames);
}

// Creates a random temporary directory, runs the given body, and then deletes the directory.
// Mostly intended for use within tests.
export async function withTmpDir<T>(body: (tmpDir: string) => Promise<T>): Promise<T> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-action-'));
  const realSubdir = path.join(tmpDir, 'real');
  fs.mkdirSync(realSubdir);
  const symlinkSubdir = path.join(tmpDir, 'symlink');
  fs.symlinkSync(realSubdir, symlinkSubdir, 'dir');
  const result = await body(symlinkSubdir);
  fs.rmdirSync(tmpDir, { recursive: true });
  return result;
}

/**
 * Get the codeql `--ram` flag as configured by the `ram` input. If no value was
 * specified, the total available memory will be used minus 256 MB.
 *
 * @returns string
 */
export function getMemoryFlag(): string {
  let memoryToUseMegaBytes: number;
  const memoryToUseString = core.getInput("ram");
  if (memoryToUseString) {
    memoryToUseMegaBytes = Number(memoryToUseString);
    if (Number.isNaN(memoryToUseMegaBytes) || memoryToUseMegaBytes <= 0) {
      throw new Error("Invalid RAM setting \"" + memoryToUseString + "\", specified.");
    }
  } else {
    const totalMemoryBytes = os.totalmem();
    const totalMemoryMegaBytes = totalMemoryBytes / (1024 * 1024);
    const systemReservedMemoryMegaBytes = 256;
    memoryToUseMegaBytes = totalMemoryMegaBytes - systemReservedMemoryMegaBytes;
  }
  return "--ram=" + Math.floor(memoryToUseMegaBytes);
}

/**
 * Get the codeql `--threads` value specified for the `threads` input. The value
 * defaults to 1. The value will be capped to the number of available CPUs.
 *
 * @returns string
 */
export function getThreadsFlag(): string {
  let numThreads = 1;
  const numThreadsString = core.getInput("threads");
  if (numThreadsString) {
    numThreads = Number(numThreadsString);
    if (Number.isNaN(numThreads)) {
      throw new Error(`Invalid threads setting "${numThreadsString}", specified.`);
    }
    const maxThreads = os.cpus().length;
    if (numThreads > maxThreads) {
      numThreads = maxThreads;
    }
    const minThreads = -maxThreads;
    if (numThreads < minThreads) {
      numThreads = minThreads;
    }
  }
  return `--threads=${numThreads}`;
}
