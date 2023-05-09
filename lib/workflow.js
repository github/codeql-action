"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCheckoutPathInputOrThrow = exports.getUploadInputOrThrow = exports.getCategoryInputOrThrow = exports.getWorkflowRunAttempt = exports.getWorkflowRunID = exports.getWorkflowRelativePath = exports.getWorkflow = exports.formatWorkflowCause = exports.formatWorkflowErrors = exports.validateWorkflow = exports.getWorkflowErrors = exports.WorkflowErrors = exports.patternIsSuperset = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zlib_1 = __importDefault(require("zlib"));
const core = __importStar(require("@actions/core"));
const yaml = __importStar(require("js-yaml"));
const api = __importStar(require("./api-client"));
const util_1 = require("./util");
const GLOB_PATTERN = new RegExp("(\\*\\*?)");
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}
function patternToRegExp(value) {
    return new RegExp(`^${value
        .toString()
        .split(GLOB_PATTERN)
        .reduce(function (arr, cur) {
        if (cur === "**") {
            arr.push(".*?");
        }
        else if (cur === "*") {
            arr.push("[^/]*?");
        }
        else if (cur) {
            arr.push(escapeRegExp(cur));
        }
        return arr;
    }, [])
        .join("")}$`);
}
// this function should return true if patternA is a superset of patternB
// e.g: * is a superset of main-* but main-* is not a superset of *.
function patternIsSuperset(patternA, patternB) {
    return patternToRegExp(patternA).test(patternB);
}
exports.patternIsSuperset = patternIsSuperset;
function toCodedErrors(errors) {
    return Object.entries(errors).reduce((acc, [code, message]) => {
        acc[code] = { message, code };
        return acc;
    }, {});
}
// code to send back via status report
// message to add as a warning annotation to the run
exports.WorkflowErrors = toCodedErrors({
    CheckoutWrongHead: `git checkout HEAD^2 is no longer necessary. Please remove this step as Code Scanning recommends analyzing the merge commit for best results.`,
});
function getWorkflowErrors(doc) {
    const errors = [];
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
                    errors.push(exports.WorkflowErrors.CheckoutWrongHead);
                    break;
                }
            }
        }
    }
    return errors;
}
exports.getWorkflowErrors = getWorkflowErrors;
async function validateWorkflow(logger) {
    let workflow;
    try {
        workflow = await getWorkflow(logger);
    }
    catch (e) {
        return `error: getWorkflow() failed: ${String(e)}`;
    }
    let workflowErrors;
    try {
        workflowErrors = getWorkflowErrors(workflow);
    }
    catch (e) {
        return `error: getWorkflowErrors() failed: ${String(e)}`;
    }
    if (workflowErrors.length > 0) {
        let message;
        try {
            message = formatWorkflowErrors(workflowErrors);
        }
        catch (e) {
            return `error: formatWorkflowErrors() failed: ${String(e)}`;
        }
        core.warning(message);
    }
    return formatWorkflowCause(workflowErrors);
}
exports.validateWorkflow = validateWorkflow;
function formatWorkflowErrors(errors) {
    const issuesWere = errors.length === 1 ? "issue was" : "issues were";
    const errorsList = errors.map((e) => e.message).join(" ");
    return `${errors.length} ${issuesWere} detected with this workflow: ${errorsList}`;
}
exports.formatWorkflowErrors = formatWorkflowErrors;
function formatWorkflowCause(errors) {
    if (errors.length === 0) {
        return undefined;
    }
    return errors.map((e) => e.code).join(",");
}
exports.formatWorkflowCause = formatWorkflowCause;
async function getWorkflow(logger) {
    // In default setup, the currently executing workflow is not checked into the repository.
    // Instead, a gzipped then base64 encoded version of the workflow file is provided via the
    // `CODE_SCANNING_WORKFLOW_FILE` environment variable.
    const maybeWorkflow = process.env["CODE_SCANNING_WORKFLOW_FILE"];
    if (maybeWorkflow) {
        logger.debug("Using the workflow specified by the CODE_SCANNING_WORKFLOW_FILE environment variable.");
        return yaml.load(zlib_1.default.gunzipSync(Buffer.from(maybeWorkflow, "base64")).toString());
    }
    const workflowPath = await getWorkflowAbsolutePath(logger);
    return yaml.load(fs.readFileSync(workflowPath, "utf-8"));
}
exports.getWorkflow = getWorkflow;
/**
 * Get the absolute path of the currently executing workflow.
 */
async function getWorkflowAbsolutePath(logger) {
    const relativePath = await getWorkflowRelativePath();
    const absolutePath = path.join((0, util_1.getRequiredEnvParam)("GITHUB_WORKSPACE"), relativePath);
    if (fs.existsSync(absolutePath)) {
        logger.debug(`Derived the following absolute path for the currently executing workflow: ${absolutePath}.`);
        return absolutePath;
    }
    throw new Error(`Expected to find a code scanning workflow file at ${absolutePath}, but no such file existed. ` +
        "This can happen if the currently running workflow checks out a branch that doesn't contain " +
        "the corresponding workflow file.");
}
/**
 * Get the path of the currently executing workflow relative to the repository root.
 */
async function getWorkflowRelativePath() {
    const repo_nwo = (0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY").split("/");
    const owner = repo_nwo[0];
    const repo = repo_nwo[1];
    const run_id = Number((0, util_1.getRequiredEnvParam)("GITHUB_RUN_ID"));
    const apiClient = api.getApiClient();
    const runsResponse = await apiClient.request("GET /repos/:owner/:repo/actions/runs/:run_id?exclude_pull_requests=true", {
        owner,
        repo,
        run_id,
    });
    const workflowUrl = runsResponse.data.workflow_url;
    const workflowResponse = await apiClient.request(`GET ${workflowUrl}`);
    return workflowResponse.data.path;
}
exports.getWorkflowRelativePath = getWorkflowRelativePath;
/**
 * Get the workflow run ID.
 */
function getWorkflowRunID() {
    const workflowRunIdString = (0, util_1.getRequiredEnvParam)("GITHUB_RUN_ID");
    const workflowRunID = parseInt(workflowRunIdString, 10);
    if (Number.isNaN(workflowRunID)) {
        throw new Error(`GITHUB_RUN_ID must define a non NaN workflow run ID. Current value is ${workflowRunIdString}`);
    }
    if (workflowRunID < 0) {
        throw new Error(`GITHUB_RUN_ID must be a non-negative integer. Current value is ${workflowRunIdString}`);
    }
    return workflowRunID;
}
exports.getWorkflowRunID = getWorkflowRunID;
/**
 * Get the workflow run attempt number.
 */
function getWorkflowRunAttempt() {
    const workflowRunAttemptString = (0, util_1.getRequiredEnvParam)("GITHUB_RUN_ATTEMPT");
    const workflowRunAttempt = parseInt(workflowRunAttemptString, 10);
    if (Number.isNaN(workflowRunAttempt)) {
        throw new Error(`GITHUB_RUN_ATTEMPT must define a non NaN workflow run attempt. Current value is ${workflowRunAttemptString}`);
    }
    if (workflowRunAttempt <= 0) {
        throw new Error(`GITHUB_RUN_ATTEMPT must be a positive integer. Current value is ${workflowRunAttemptString}`);
    }
    return workflowRunAttempt;
}
exports.getWorkflowRunAttempt = getWorkflowRunAttempt;
function getStepsCallingAction(job, actionName) {
    if (job.uses) {
        throw new Error(`Could not get steps calling ${actionName} since the job calls a reusable workflow.`);
    }
    const steps = job.steps;
    if (!Array.isArray(steps)) {
        throw new Error(`Could not get steps calling ${actionName} since job.steps was not an array.`);
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
function getInputOrThrow(workflow, jobName, actionName, inputName, matrixVars) {
    const preamble = `Could not get ${inputName} input to ${actionName} since`;
    if (!workflow.jobs) {
        throw new Error(`${preamble} the workflow has no jobs.`);
    }
    if (!workflow.jobs[jobName]) {
        throw new Error(`${preamble} the workflow has no job named ${jobName}.`);
    }
    const stepsCallingAction = getStepsCallingAction(workflow.jobs[jobName], actionName);
    if (stepsCallingAction.length === 0) {
        throw new Error(`${preamble} the ${jobName} job does not call ${actionName}.`);
    }
    else if (stepsCallingAction.length > 1) {
        throw new Error(`${preamble} the ${jobName} job calls ${actionName} multiple times.`);
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
        throw new Error(`Could not get ${inputName} input to ${actionName} since it contained an unrecognized dynamic value.`);
    }
    return input;
}
/**
 * Get the expected name of the analyze Action.
 *
 * This allows us to test workflow parsing functionality as a CodeQL Action PR check.
 */
function getAnalyzeActionName() {
    if ((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY") === "github/codeql-action") {
        return "./analyze";
    }
    else {
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
function getCategoryInputOrThrow(workflow, jobName, matrixVars) {
    return getInputOrThrow(workflow, jobName, getAnalyzeActionName(), "category", matrixVars);
}
exports.getCategoryInputOrThrow = getCategoryInputOrThrow;
/**
 * Makes a best effort attempt to retrieve the upload input for the particular job,
 * given a set of matrix variables.
 *
 * Typically you'll want to wrap this function in a try/catch block and handle the error.
 *
 * @returns the user input to upload, or undefined if input was unspecified
 * @throws an error if the upload input could not be determined
 */
function getUploadInputOrThrow(workflow, jobName, matrixVars) {
    return getInputOrThrow(workflow, jobName, getAnalyzeActionName(), "upload", matrixVars);
}
exports.getUploadInputOrThrow = getUploadInputOrThrow;
/**
 * Makes a best effort attempt to retrieve the checkout_path input for the
 * particular job, given a set of matrix variables.
 *
 * Typically you'll want to wrap this function in a try/catch block and handle the error.
 *
 * @returns the checkout_path input
 * @throws an error if the checkout_path input could not be determined
 */
function getCheckoutPathInputOrThrow(workflow, jobName, matrixVars) {
    return (getInputOrThrow(workflow, jobName, getAnalyzeActionName(), "checkout_path", matrixVars) || (0, util_1.getRequiredEnvParam)("GITHUB_WORKSPACE") // if unspecified, checkout_path defaults to ${{ github.workspace }}
    );
}
exports.getCheckoutPathInputOrThrow = getCheckoutPathInputOrThrow;
//# sourceMappingURL=workflow.js.map