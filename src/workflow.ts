import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";
import * as yaml from "js-yaml";

import * as api from "./api-client";
import { getRequiredEnvParam } from "./util";

export interface WorkflowJobStep {
  name?: string;
  run?: any;
  uses?: string;
  with?: { [key: string]: boolean | number | string };
}

interface WorkflowJob {
  name?: string;
  "runs-on"?: string;
  steps?: WorkflowJobStep[];
  uses?: string;
}

interface WorkflowTrigger {
  branches?: string[] | string;
  paths?: string[];
}

// on: {} then push/pull_request are undefined
// on:
//   push:
//   pull_request:
// then push/pull_request are null
interface WorkflowTriggers {
  push?: WorkflowTrigger | null;
  pull_request?: WorkflowTrigger | null;
}

export interface Workflow {
  name?: string;
  jobs?: { [key: string]: WorkflowJob };
  on?: string | string[] | WorkflowTriggers;
}

function isObject(o: unknown): o is object {
  return o !== null && typeof o === "object";
}

const GLOB_PATTERN = new RegExp("(\\*\\*?)");

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

function patternToRegExp(value) {
  return new RegExp(
    `^${value
      .toString()
      .split(GLOB_PATTERN)
      .reduce(function (arr, cur) {
        if (cur === "**") {
          arr.push(".*?");
        } else if (cur === "*") {
          arr.push("[^/]*?");
        } else if (cur) {
          arr.push(escapeRegExp(cur));
        }
        return arr;
      }, [])
      .join("")}$`
  );
}

// this function should return true if patternA is a superset of patternB
// e.g: * is a superset of main-* but main-* is not a superset of *.
export function patternIsSuperset(patternA: string, patternB: string): boolean {
  return patternToRegExp(patternA).test(patternB);
}

function branchesToArray(branches?: string | null | string[]): string[] | "**" {
  if (typeof branches === "string") {
    return [branches];
  }
  if (Array.isArray(branches)) {
    if (branches.length === 0) {
      return "**";
    }
    return branches;
  }
  return "**";
}
export interface CodedError {
  message: string;
  code: string;
}

function toCodedErrors(errors: {
  [code: string]: string;
}): Record<string, CodedError> {
  return Object.entries(errors).reduce((acc, [code, message]) => {
    acc[code] = { message, code };
    return acc;
  }, {} as Record<string, CodedError>);
}

// code to send back via status report
// message to add as a warning annotation to the run
export const WorkflowErrors = toCodedErrors({
  MismatchedBranches: `Please make sure that every branch in on.pull_request is also in on.push so that Code Scanning can compare pull requests against the state of the base branch.`,
  MissingPushHook: `Please specify an on.push hook so that Code Scanning can compare pull requests against the state of the base branch.`,
  PathsSpecified: `Using on.push.paths can prevent Code Scanning annotating new alerts in your pull requests.`,
  PathsIgnoreSpecified: `Using on.push.paths-ignore can prevent Code Scanning annotating new alerts in your pull requests.`,
  CheckoutWrongHead: `git checkout HEAD^2 is no longer necessary. Please remove this step as Code Scanning recommends analyzing the merge commit for best results.`,
});

export function getWorkflowErrors(doc: Workflow): CodedError[] {
  const errors: CodedError[] = [];

  const jobName = process.env.GITHUB_JOB;

  if (jobName) {
    const job = doc?.jobs?.[jobName];

    const steps = job?.steps;

    if (Array.isArray(steps)) {
      for (const step of steps) {
        // this was advice that we used to give in the README
        // we actually want to run the analysis on the merge commit
        // to produce results that are more inline with expectations
        // (i.e: this is what will happen if you merge this PR)
        // and avoid some race conditions
        if (step?.run === "git checkout HEAD^2") {
          errors.push(WorkflowErrors.CheckoutWrongHead);
          break;
        }
      }
    }
  }

  let missingPush = false;

  if (doc.on === undefined) {
    // this is not a valid config
  } else if (typeof doc.on === "string") {
    if (doc.on === "pull_request") {
      missingPush = true;
    }
  } else if (Array.isArray(doc.on)) {
    const hasPush = doc.on.includes("push");
    const hasPullRequest = doc.on.includes("pull_request");
    if (hasPullRequest && !hasPush) {
      missingPush = true;
    }
  } else if (isObject(doc.on)) {
    const hasPush = Object.prototype.hasOwnProperty.call(doc.on, "push");
    const hasPullRequest = Object.prototype.hasOwnProperty.call(
      doc.on,
      "pull_request"
    );

    if (!hasPush && hasPullRequest) {
      missingPush = true;
    }
    if (hasPush && hasPullRequest) {
      const paths = doc.on.push?.paths;
      // if you specify paths or paths-ignore you can end up with commits that have no baseline
      // if they didn't change any files
      // currently we cannot go back through the history and find the most recent baseline
      if (Array.isArray(paths) && paths.length > 0) {
        errors.push(WorkflowErrors.PathsSpecified);
      }
      const pathsIgnore = doc.on.push?.["paths-ignore"];
      if (Array.isArray(pathsIgnore) && pathsIgnore.length > 0) {
        errors.push(WorkflowErrors.PathsIgnoreSpecified);
      }
    }

    // if doc.on.pull_request is null that means 'all branches'
    // if doc.on.pull_request is undefined that means 'off'
    // we only want to check for mismatched branches if pull_request is on.
    if (doc.on.pull_request !== undefined) {
      const push = branchesToArray(doc.on.push?.branches);

      if (push !== "**") {
        const pull_request = branchesToArray(doc.on.pull_request?.branches);

        if (pull_request !== "**") {
          const difference = pull_request.filter(
            (value) => !push.some((o) => patternIsSuperset(o, value))
          );
          if (difference.length > 0) {
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
  }

  if (missingPush) {
    errors.push(WorkflowErrors.MissingPushHook);
  }

  return errors;
}

export async function validateWorkflow(): Promise<undefined | string> {
  let workflow: Workflow;
  try {
    workflow = await getWorkflow();
  } catch (e) {
    return `error: getWorkflow() failed: ${String(e)}`;
  }
  let workflowErrors: CodedError[];
  try {
    workflowErrors = getWorkflowErrors(workflow);
  } catch (e) {
    return `error: getWorkflowErrors() failed: ${String(e)}`;
  }

  if (workflowErrors.length > 0) {
    let message: string;
    try {
      message = formatWorkflowErrors(workflowErrors);
    } catch (e) {
      return `error: formatWorkflowErrors() failed: ${String(e)}`;
    }
    core.warning(message);
  }

  return formatWorkflowCause(workflowErrors);
}

export function formatWorkflowErrors(errors: CodedError[]): string {
  const issuesWere = errors.length === 1 ? "issue was" : "issues were";

  const errorsList = errors.map((e) => e.message).join(" ");

  return `${errors.length} ${issuesWere} detected with this workflow: ${errorsList}`;
}

export function formatWorkflowCause(errors: CodedError[]): undefined | string {
  if (errors.length === 0) {
    return undefined;
  }
  return errors.map((e) => e.code).join(",");
}

export async function getWorkflow(): Promise<Workflow> {
  const relativePath = await getWorkflowPath();
  const absolutePath = path.join(
    getRequiredEnvParam("GITHUB_WORKSPACE"),
    relativePath
  );

  try {
    return yaml.load(fs.readFileSync(absolutePath, "utf-8")) as Workflow;
  } catch (e) {
    if (e instanceof Error && e["code"] === "ENOENT") {
      throw new Error(
        `Unable to load code scanning workflow from ${absolutePath}. This can happen if the currently ` +
          "running workflow checks out a branch that doesn't contain the corresponding workflow file."
      );
    }
    throw e;
  }
}

/**
 * Get the path of the currently executing workflow.
 */
export async function getWorkflowPath(): Promise<string> {
  const repo_nwo = getRequiredEnvParam("GITHUB_REPOSITORY").split("/");
  const owner = repo_nwo[0];
  const repo = repo_nwo[1];
  const run_id = Number(getRequiredEnvParam("GITHUB_RUN_ID"));

  const apiClient = api.getApiClient();
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
 * Get the workflow run ID.
 */
export function getWorkflowRunID(): number {
  const workflowRunID = parseInt(getRequiredEnvParam("GITHUB_RUN_ID"), 10);
  if (Number.isNaN(workflowRunID)) {
    throw new Error("GITHUB_RUN_ID must define a non NaN workflow run ID");
  }
  return workflowRunID;
}

function getStepsCallingAction(
  job: WorkflowJob,
  actionName: string
): WorkflowJobStep[] {
  if (job.uses) {
    throw new Error(
      `Could not get steps calling ${actionName} since the job calls a reusable workflow.`
    );
  }
  const steps = job.steps;
  if (!Array.isArray(steps)) {
    throw new Error(
      `Could not get steps calling ${actionName} since job.steps was not an array.`
    );
  }
  return steps.filter((step) => step.uses?.includes(actionName));
}

/**
 * Makes a best effort attempt to retrieve the value of a particular input with which
 * an Action in the workflow would be invoked.
 *
 * Typically you'll want to wrap this function in a try/catch block and handle the error.
 *
 * @returns the value of the input, or undefined if no such input is passed to the Action
 * @throws an error if the value of the input could not be determined, or we could not
 * determine that no such input is passed to the Action.
 */
function getInputOrThrow(
  workflow: Workflow,
  jobName: string,
  actionName: string,
  inputName: string,
  matrixVars: { [key: string]: string } | undefined
) {
  const preamble = `Could not get ${inputName} input to ${actionName} since`;
  if (!workflow.jobs) {
    throw new Error(`${preamble} the workflow has no jobs.`);
  }
  if (!workflow.jobs[jobName]) {
    throw new Error(`${preamble} the workflow has no job named ${jobName}.`);
  }

  const stepsCallingAction = getStepsCallingAction(
    workflow.jobs[jobName],
    actionName
  );

  if (stepsCallingAction.length === 0) {
    throw new Error(
      `${preamble} the ${jobName} job does not call ${actionName}.`
    );
  } else if (stepsCallingAction.length > 1) {
    throw new Error(
      `${preamble} the ${jobName} job calls ${actionName} multiple times.`
    );
  }

  let input = stepsCallingAction[0].with?.[inputName]?.toString();

  if (input !== undefined && matrixVars !== undefined) {
    // Normalize by removing whitespace
    input = input.replace(/\${{\s+/, "${{").replace(/\s+}}/, "}}");
    // Make a basic attempt to substitute matrix variables
    for (const [key, value] of Object.entries(matrixVars)) {
      input = input.replace(`\${{matrix.${key}}}`, value);
    }
  }
  if (input !== undefined && input.includes("${{")) {
    throw new Error(
      `Could not get ${inputName} input to ${actionName} since it contained an unrecognized dynamic value.`
    );
  }
  return input;
}

/**
 * Get the expected name of the analyze Action.
 *
 * This allows us to test workflow parsing functionality as a CodeQL Action PR check.
 */
function getAnalyzeActionName() {
  if (getRequiredEnvParam("GITHUB_REPOSITORY") === "github/codeql-action") {
    return "./analyze";
  } else {
    return "github/codeql-action/analyze";
  }
}

/**
 * Makes a best effort attempt to retrieve the category input for the particular job,
 * given a set of matrix variables.
 *
 * Typically you'll want to wrap this function in a try/catch block and handle the error.
 *
 * @returns the category input, or undefined if the category input is not defined
 * @throws an error if the category input could not be determined
 */
export function getCategoryInputOrThrow(
  workflow: Workflow,
  jobName: string,
  matrixVars: { [key: string]: string } | undefined
): string | undefined {
  return getInputOrThrow(
    workflow,
    jobName,
    getAnalyzeActionName(),
    "category",
    matrixVars
  );
}

/**
 * Makes a best effort attempt to retrieve the upload input for the particular job,
 * given a set of matrix variables.
 *
 * Typically you'll want to wrap this function in a try/catch block and handle the error.
 *
 * @returns the upload input
 * @throws an error if the upload input could not be determined
 */
export function getUploadInputOrThrow(
  workflow: Workflow,
  jobName: string,
  matrixVars: { [key: string]: string } | undefined
): string {
  return (
    getInputOrThrow(
      workflow,
      jobName,
      getAnalyzeActionName(),
      "upload",
      matrixVars
    ) || "true" // if unspecified, upload defaults to true
  );
}

/**
 * Makes a best effort attempt to retrieve the checkout_path input for the
 * particular job, given a set of matrix variables.
 *
 * Typically you'll want to wrap this function in a try/catch block and handle the error.
 *
 * @returns the checkout_path input
 * @throws an error if the checkout_path input could not be determined
 */
export function getCheckoutPathInputOrThrow(
  workflow: Workflow,
  jobName: string,
  matrixVars: { [key: string]: string } | undefined
): string {
  return (
    getInputOrThrow(
      workflow,
      jobName,
      getAnalyzeActionName(),
      "checkout_path",
      matrixVars
    ) || getRequiredEnvParam("GITHUB_WORKSPACE") // if unspecified, checkout_path defaults to ${{ github.workspace }}
  );
}
