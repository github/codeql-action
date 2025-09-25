import * as fs from "fs";
import * as path from "path";
import zlib from "zlib";

import * as core from "@actions/core";
import * as yaml from "js-yaml";

import * as api from "./api-client";
import { CodeQL } from "./codeql";
import { Logger } from "./logging";
import {
  getRequiredEnvParam,
  getTestingEnvironment,
  isInTestMode,
} from "./util";

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
  strategy?: { matrix: { [key: string]: string[] } };
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

export interface CodedError {
  message: string;
  code: string;
}

function toCodedErrors(errors: {
  [code: string]: string;
}): Record<string, CodedError> {
  return Object.entries(errors).reduce(
    (acc, [code, message]) => {
      acc[code] = { message, code };
      return acc;
    },
    {} as Record<string, CodedError>,
  );
}

// code to send back via status report
// message to add as a warning annotation to the run
export const WorkflowErrors = toCodedErrors({
  MissingPushHook: `Please specify an on.push hook to analyze and see code scanning alerts from the default branch on the Security tab.`,
  CheckoutWrongHead: `git checkout HEAD^2 is no longer necessary. Please remove this step as Code Scanning recommends analyzing the merge commit for best results.`,
  InconsistentActionVersion: `Not all workflow steps that use \`github/codeql-action\` actions use the same version. Please ensure that all such steps use the same version to avoid compatibility issues.`,
});

/**
 * Groups the given list of CodeQL languages by their extractor name.
 *
 * Resolves to `undefined` if the CodeQL version does not support language aliasing.
 */
async function groupLanguagesByExtractor(
  languages: string[],
  codeql: CodeQL,
): Promise<{ [extractorName: string]: string[] } | undefined> {
  const resolveResult = await codeql.betterResolveLanguages();
  if (!resolveResult.aliases) {
    return undefined;
  }
  const aliases = resolveResult.aliases;
  const languagesByExtractor: {
    [extractorName: string]: string[];
  } = {};
  for (const language of languages) {
    const extractorName = aliases[language] || language;
    if (!languagesByExtractor[extractorName]) {
      languagesByExtractor[extractorName] = [];
    }
    languagesByExtractor[extractorName].push(language);
  }
  return languagesByExtractor;
}

export async function getWorkflowErrors(
  doc: Workflow,
  codeql: CodeQL,
): Promise<CodedError[]> {
  const errors: CodedError[] = [];

  const jobName = process.env.GITHUB_JOB;

  if (jobName) {
    const job = doc?.jobs?.[jobName];

    if (job?.strategy?.matrix?.language) {
      const matrixLanguages = job.strategy.matrix.language;
      if (Array.isArray(matrixLanguages)) {
        // Map extractors to entries in the `language` matrix parameter. This will allow us to
        // detect languages which are analyzed in more than one job.
        const matrixLanguagesByExtractor = await groupLanguagesByExtractor(
          matrixLanguages,
          codeql,
        );
        // If the CodeQL version does not support language aliasing, then `matrixLanguagesByExtractor`
        // will be `undefined`. In this case, we cannot detect duplicate languages in the matrix.
        if (matrixLanguagesByExtractor !== undefined) {
          // Check for duplicate languages in the matrix
          for (const [extractor, languages] of Object.entries(
            matrixLanguagesByExtractor,
          )) {
            if (languages.length > 1) {
              errors.push({
                message:
                  `CodeQL language '${extractor}' is referenced by more than one entry in the ` +
                  `'language' matrix parameter for job '${jobName}'. This may result in duplicate alerts. ` +
                  `Please edit the 'language' matrix parameter to keep only one of the following: ${languages
                    .map((language) => `'${language}'`)
                    .join(", ")}.`,
                code: "DuplicateLanguageInMatrix",
              });
            }
          }
        }
      }
    }

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

  // Check that all `github/codeql-action` steps use the same ref, i.e. the same version.
  // Mixing different versions of the actions can lead to unpredictable behaviour.
  const codeqlStepRefs: string[] = [];
  for (const job of Object.values(doc?.jobs || {})) {
    if (Array.isArray(job.steps)) {
      for (const step of job.steps) {
        if (step.uses?.startsWith("github/codeql-action/")) {
          const parts = step.uses.split("@");
          if (parts.length >= 2) {
            codeqlStepRefs.push(parts[parts.length - 1]);
          }
        }
      }
    }
  }

  if (
    codeqlStepRefs.length > 0 &&
    !codeqlStepRefs.every((ref) => ref === codeqlStepRefs[0])
  ) {
    errors.push(WorkflowErrors.InconsistentActionVersion);
  }

  // If there is no push trigger, we will not be able to analyze the default branch.
  // So add a warning to the user to add a push trigger.
  // If there is a workflow_call trigger, we don't need a push trigger since we assume
  // that the workflow_call trigger is called from a workflow that has a push trigger.
  const hasPushTrigger = hasWorkflowTrigger("push", doc);
  const hasPullRequestTrigger = hasWorkflowTrigger("pull_request", doc);
  const hasWorkflowCallTrigger = hasWorkflowTrigger("workflow_call", doc);

  if (hasPullRequestTrigger && !hasPushTrigger && !hasWorkflowCallTrigger) {
    errors.push(WorkflowErrors.MissingPushHook);
  }

  return errors;
}

function hasWorkflowTrigger(triggerName: string, doc: Workflow): boolean {
  if (!doc.on) {
    return false;
  }

  if (typeof doc.on === "string") {
    return doc.on === triggerName;
  }

  if (Array.isArray(doc.on)) {
    return doc.on.includes(triggerName);
  }

  return Object.prototype.hasOwnProperty.call(doc.on, triggerName);
}

export async function validateWorkflow(
  codeql: CodeQL,
  logger: Logger,
): Promise<undefined | string> {
  let workflow: Workflow;
  try {
    workflow = await getWorkflow(logger);
  } catch (e) {
    return `error: getWorkflow() failed: ${String(e)}`;
  }
  let workflowErrors: CodedError[];
  try {
    workflowErrors = await getWorkflowErrors(workflow, codeql);
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

export async function getWorkflow(logger: Logger): Promise<Workflow> {
  // In default setup, the currently executing workflow is not checked into the repository.
  // Instead, a gzipped then base64 encoded version of the workflow file is provided via the
  // `CODE_SCANNING_WORKFLOW_FILE` environment variable.
  const maybeWorkflow = process.env["CODE_SCANNING_WORKFLOW_FILE"];
  if (maybeWorkflow) {
    logger.debug(
      "Using the workflow specified by the CODE_SCANNING_WORKFLOW_FILE environment variable.",
    );
    return yaml.load(
      zlib.gunzipSync(Buffer.from(maybeWorkflow, "base64")).toString(),
    ) as Workflow;
  }

  const workflowPath = await getWorkflowAbsolutePath(logger);
  return yaml.load(fs.readFileSync(workflowPath, "utf-8")) as Workflow;
}

/**
 * Get the absolute path of the currently executing workflow.
 */
async function getWorkflowAbsolutePath(logger: Logger): Promise<string> {
  const relativePath = await api.getWorkflowRelativePath();
  const absolutePath = path.join(
    getRequiredEnvParam("GITHUB_WORKSPACE"),
    relativePath,
  );

  if (fs.existsSync(absolutePath)) {
    logger.debug(
      `Derived the following absolute path for the currently executing workflow: ${absolutePath}.`,
    );
    return absolutePath;
  }

  throw new Error(
    `Expected to find a code scanning workflow file at ${absolutePath}, but no such file existed. ` +
      "This can happen if the currently running workflow checks out a branch that doesn't contain " +
      "the corresponding workflow file.",
  );
}

function getStepsCallingAction(
  job: WorkflowJob,
  actionName: string,
): WorkflowJobStep[] {
  if (job.uses) {
    throw new Error(
      `Could not get steps calling ${actionName} since the job calls a reusable workflow.`,
    );
  }
  const steps = job.steps;
  if (!Array.isArray(steps)) {
    throw new Error(
      `Could not get steps calling ${actionName} since job.steps was not an array.`,
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
  matrixVars: { [key: string]: string } | undefined,
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
    actionName,
  );

  if (stepsCallingAction.length === 0) {
    throw new Error(
      `${preamble} the ${jobName} job does not call ${actionName}.`,
    );
  } else if (stepsCallingAction.length > 1) {
    throw new Error(
      `${preamble} the ${jobName} job calls ${actionName} multiple times.`,
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
      `Could not get ${inputName} input to ${actionName} since it contained an unrecognized dynamic value.`,
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
  if (isInTestMode() || getTestingEnvironment() === "codeql-action-pr-checks") {
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
  matrixVars: { [key: string]: string } | undefined,
): string | undefined {
  return getInputOrThrow(
    workflow,
    jobName,
    getAnalyzeActionName(),
    "category",
    matrixVars,
  );
}

/**
 * Makes a best effort attempt to retrieve the upload input for the particular job,
 * given a set of matrix variables.
 *
 * Typically you'll want to wrap this function in a try/catch block and handle the error.
 *
 * @returns the user input to upload, or undefined if input was unspecified
 * @throws an error if the upload input could not be determined
 */
export function getUploadInputOrThrow(
  workflow: Workflow,
  jobName: string,
  matrixVars: { [key: string]: string } | undefined,
): string | undefined {
  return getInputOrThrow(
    workflow,
    jobName,
    getAnalyzeActionName(),
    "upload",
    matrixVars,
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
  matrixVars: { [key: string]: string } | undefined,
): string {
  return (
    getInputOrThrow(
      workflow,
      jobName,
      getAnalyzeActionName(),
      "checkout_path",
      matrixVars,
    ) || getRequiredEnvParam("GITHUB_WORKSPACE") // if unspecified, checkout_path defaults to ${{ github.workspace }}
  );
}
