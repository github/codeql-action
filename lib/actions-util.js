"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const safeWhich = __importStar(require("@chrisgavin/safe-which"));
const yaml = __importStar(require("js-yaml"));
const api = __importStar(require("./api-client"));
const sharedEnv = __importStar(require("./shared-environment"));
const util_1 = require("./util");
/**
 * Wrapper around core.getInput for inputs that always have a value.
 * Also see getOptionalInput.
 *
 * This allows us to get stronger type checking of required/optional inputs
 * and make behaviour more consistent between actions and the runner.
 */
function getRequiredInput(name) {
    return core.getInput(name, { required: true });
}
exports.getRequiredInput = getRequiredInput;
/**
 * Wrapper around core.getInput that converts empty inputs to undefined.
 * Also see getRequiredInput.
 *
 * This allows us to get stronger type checking of required/optional inputs
 * and make behaviour more consistent between actions and the runner.
 */
function getOptionalInput(name) {
    const value = core.getInput(name);
    return value.length > 0 ? value : undefined;
}
exports.getOptionalInput = getOptionalInput;
/**
 * Get an environment parameter, but throw an error if it is not set.
 */
function getRequiredEnvParam(paramName) {
    const value = process.env[paramName];
    if (value === undefined || value.length === 0) {
        throw new Error(`${paramName} environment variable must be set`);
    }
    core.debug(`${paramName}=${value}`);
    return value;
}
exports.getRequiredEnvParam = getRequiredEnvParam;
/**
 * Ensures all required environment variables are set in the context of a local run.
 */
function prepareLocalRunEnvironment() {
    if (!util_1.isLocalRun()) {
        return;
    }
    core.debug("Action is running locally.");
    if (!process.env.GITHUB_JOB) {
        core.exportVariable("GITHUB_JOB", "UNKNOWN-JOB");
    }
    if (!process.env.CODEQL_ACTION_ANALYSIS_KEY) {
        core.exportVariable("CODEQL_ACTION_ANALYSIS_KEY", `LOCAL-RUN:${process.env.GITHUB_JOB}`);
    }
}
exports.prepareLocalRunEnvironment = prepareLocalRunEnvironment;
/**
 * Gets the SHA of the commit that is currently checked out.
 */
exports.getCommitOid = async function () {
    // Try to use git to get the current commit SHA. If that fails then
    // log but otherwise silently fall back to using the SHA from the environment.
    // The only time these two values will differ is during analysis of a PR when
    // the workflow has changed the current commit to the head commit instead of
    // the merge commit, which must mean that git is available.
    // Even if this does go wrong, it's not a huge problem for the alerts to
    // reported on the merge commit.
    try {
        let commitOid = "";
        await new toolrunner.ToolRunner(await safeWhich.safeWhich("git"), ["rev-parse", "HEAD"], {
            silent: true,
            listeners: {
                stdout: (data) => {
                    commitOid += data.toString();
                },
                stderr: (data) => {
                    process.stderr.write(data);
                },
            },
        }).exec();
        return commitOid.trim();
    }
    catch (e) {
        core.info(`Failed to call git to get current commit. Continuing with data from environment: ${e}`);
        return getRequiredEnvParam("GITHUB_SHA");
    }
};
function isObject(o) {
    return o !== null && typeof o === "object";
}
var MissingTriggers;
(function (MissingTriggers) {
    MissingTriggers[MissingTriggers["None"] = 0] = "None";
    MissingTriggers[MissingTriggers["Push"] = 1] = "Push";
    MissingTriggers[MissingTriggers["PullRequest"] = 2] = "PullRequest";
})(MissingTriggers || (MissingTriggers = {}));
function toCodedErrors(errors) {
    return Object.entries(errors).reduce((acc, [key, value]) => {
        acc[key] = { message: value, code: key };
        return acc;
    }, {});
}
exports.WorkflowErrors = toCodedErrors({
    MismatchedBranches: `Please make sure that every branch in on.pull_request is also in on.push so that Code Scanning can compare pull requests against the state of the base branch.`,
    MissingHooks: `Please specify on.push and on.pull_request hooks so that Code Scanning can compare pull requests against the state of the base branch.`,
    MissingPullRequestHook: `Please specify an on.pull_request hook so that Code Scanning is run against pull requests.`,
    MissingPushHook: `Please specify an on.push hook so that Code Scanning can compare pull requests against the state of the base branch.`,
    PathsSpecified: `Using on.push.paths can prevent Code Scanning annotating new alerts in your pull requests.`,
    PathsIgnoreSpecified: `Using on.push.paths-ignore can prevent Code Scanning annotating new alerts in your pull requests.`,
    CheckoutWrongHead: `git checkout HEAD^2 is no longer necessary. Please remove this step as Code Scanning recommends analyzing the merge commit for best results.`,
});
function validateWorkflow(doc) {
    var _a, _b, _c, _d, _e;
    const errors = [];
    // .jobs[key].steps[].run
    for (const job of Object.values(((_a = doc) === null || _a === void 0 ? void 0 : _a.jobs) || {})) {
        for (const step of ((_b = job) === null || _b === void 0 ? void 0 : _b.steps) || []) {
            // this was advice that we used to give in the README
            // we actually want to run the analysis on the merge commit
            // to produce results that are more inline with expectations
            // (i.e: this is what will happen if you merge this PR)
            // and avoid some race conditions
            if (((_c = step) === null || _c === void 0 ? void 0 : _c.run) === "git checkout HEAD^2") {
                errors.push(exports.WorkflowErrors.CheckoutWrongHead);
            }
        }
    }
    let missing = MissingTriggers.None;
    if (doc.on === undefined) {
        missing = MissingTriggers.Push | MissingTriggers.PullRequest;
    }
    else if (typeof doc.on === "string") {
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
    }
    else if (Array.isArray(doc.on)) {
        if (!doc.on.includes("push")) {
            missing = missing | MissingTriggers.Push;
        }
        if (!doc.on.includes("pull_request")) {
            missing = missing | MissingTriggers.PullRequest;
        }
    }
    else if (isObject(doc.on)) {
        if (!Object.prototype.hasOwnProperty.call(doc.on, "pull_request")) {
            missing = missing | MissingTriggers.PullRequest;
        }
        if (!Object.prototype.hasOwnProperty.call(doc.on, "push")) {
            missing = missing | MissingTriggers.Push;
        }
        else {
            const paths = (_d = doc.on.push) === null || _d === void 0 ? void 0 : _d.paths;
            // if you specify paths or paths-ignore you can end up with commits that have no baseline
            // if they didn't change any files
            // currently we cannot go back through the history and find the most recent baseline
            if (Array.isArray(paths) && paths.length > 0) {
                errors.push(exports.WorkflowErrors.PathsSpecified);
            }
            const pathsIgnore = (_e = doc.on.push) === null || _e === void 0 ? void 0 : _e["paths-ignore"];
            if (Array.isArray(pathsIgnore) && pathsIgnore.length > 0) {
                errors.push(exports.WorkflowErrors.PathsIgnoreSpecified);
            }
        }
        if (doc.on.push) {
            const push = doc.on.push.branches || [];
            if (doc.on.pull_request) {
                const pull_request = doc.on.pull_request.branches || [];
                const intersects = pull_request.filter((value) => !push.includes(value));
                if (intersects.length > 0) {
                    // there are branches in pull_request that may not have a baseline
                    // because we are not building them on push
                    errors.push(exports.WorkflowErrors.MismatchedBranches);
                }
            }
            else if (push.length > 0) {
                // push is set up to run on a subset of branches
                // and you could open a PR against a branch with no baseline
                errors.push(exports.WorkflowErrors.MismatchedBranches);
            }
        }
    }
    switch (missing) {
        case MissingTriggers.PullRequest | MissingTriggers.Push:
            errors.push(exports.WorkflowErrors.MissingHooks);
            break;
        case MissingTriggers.PullRequest:
            errors.push(exports.WorkflowErrors.MissingPullRequestHook);
            break;
        case MissingTriggers.Push:
            errors.push(exports.WorkflowErrors.MissingPushHook);
            break;
    }
    return errors;
}
exports.validateWorkflow = validateWorkflow;
async function getWorkflowErrors() {
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
exports.getWorkflowErrors = getWorkflowErrors;
function formatWorkflowErrors(errors) {
    const issuesWere = errors.length === 1 ? "issue was" : "issues were";
    const errorsList = errors.map((e) => e.message).join(", ");
    return `${errors.length} ${issuesWere} detected with this workflow: ${errorsList}`;
}
exports.formatWorkflowErrors = formatWorkflowErrors;
function formatWorkflowCause(errors) {
    if (errors === undefined) {
        return undefined;
    }
    return errors.map((e) => e.code).join(",");
}
exports.formatWorkflowCause = formatWorkflowCause;
async function getWorkflow() {
    const relativePath = await getWorkflowPath();
    const absolutePath = path.join(getRequiredEnvParam("GITHUB_WORKSPACE"), relativePath);
    try {
        return yaml.safeLoad(fs.readFileSync(absolutePath, "utf-8"));
    }
    catch (e) {
        core.warning(`Could not read workflow: ${e.toString()}`);
        return undefined;
    }
}
exports.getWorkflow = getWorkflow;
/**
 * Get the path of the currently executing workflow.
 */
async function getWorkflowPath() {
    if (util_1.isLocalRun()) {
        return getRequiredEnvParam("WORKFLOW_PATH");
    }
    const repo_nwo = getRequiredEnvParam("GITHUB_REPOSITORY").split("/");
    const owner = repo_nwo[0];
    const repo = repo_nwo[1];
    const run_id = Number(getRequiredEnvParam("GITHUB_RUN_ID"));
    const apiClient = api.getActionsApiClient();
    const runsResponse = await apiClient.request("GET /repos/:owner/:repo/actions/runs/:run_id", {
        owner,
        repo,
        run_id,
    });
    const workflowUrl = runsResponse.data.workflow_url;
    const workflowResponse = await apiClient.request(`GET ${workflowUrl}`);
    return workflowResponse.data.path;
}
/**
 * Get the workflow run ID.
 */
function getWorkflowRunID() {
    const workflowRunID = parseInt(getRequiredEnvParam("GITHUB_RUN_ID"), 10);
    if (Number.isNaN(workflowRunID)) {
        throw new Error("GITHUB_RUN_ID must define a non NaN workflow run ID");
    }
    return workflowRunID;
}
exports.getWorkflowRunID = getWorkflowRunID;
/**
 * Get the analysis key paramter for the current job.
 *
 * This will combine the workflow path and current job name.
 * Computing this the first time requires making requests to
 * the github API, but after that the result will be cached.
 */
async function getAnalysisKey() {
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
exports.getAnalysisKey = getAnalysisKey;
/**
 * Get the ref currently being analyzed.
 */
async function getRef() {
    // Will be in the form "refs/heads/master" on a push event
    // or in the form "refs/pull/N/merge" on a pull_request event
    const ref = getRequiredEnvParam("GITHUB_REF");
    // For pull request refs we want to detect whether the workflow
    // has run `git checkout HEAD^2` to analyze the 'head' ref rather
    // than the 'merge' ref. If so, we want to convert the ref that
    // we report back.
    const pull_ref_regex = /refs\/pull\/(\d+)\/merge/;
    const checkoutSha = await exports.getCommitOid();
    if (pull_ref_regex.test(ref) &&
        checkoutSha !== getRequiredEnvParam("GITHUB_SHA")) {
        return ref.replace(pull_ref_regex, "refs/pull/$1/head");
    }
    else {
        return ref;
    }
}
exports.getRef = getRef;
/**
 * Compose a StatusReport.
 *
 * @param actionName The name of the action, e.g. 'init', 'finish', 'upload-sarif'
 * @param status The status. Must be 'success', 'failure', or 'starting'
 * @param startedAt The time this action started executing.
 * @param cause  Cause of failure (only supply if status is 'failure')
 * @param exception Exception (only supply if status is 'failure')
 */
async function createStatusReportBase(actionName, status, actionStartedAt, cause, exception) {
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
        core.exportVariable(sharedEnv.CODEQL_WORKFLOW_STARTED_AT, workflowStartedAt);
    }
    // If running locally then the GITHUB_ACTION_REF cannot be trusted as it may be for the previous action
    // See https://github.com/actions/runner/issues/803
    const actionRef = isRunningLocalAction()
        ? undefined
        : process.env["GITHUB_ACTION_REF"];
    const statusReport = {
        workflow_run_id: workflowRunID,
        workflow_name: workflowName,
        job_name: jobName,
        analysis_key,
        commit_oid: commitOid,
        ref,
        action_name: actionName,
        action_ref: actionRef,
        action_oid: "unknown",
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
exports.createStatusReportBase = createStatusReportBase;
function isHTTPError(arg) {
    var _a;
    return ((_a = arg) === null || _a === void 0 ? void 0 : _a.status) !== undefined && Number.isInteger(arg.status);
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
async function sendStatusReport(statusReport) {
    if (util_1.isLocalRun()) {
        core.debug("Not sending status report because this is a local run");
        return true;
    }
    const statusReportJSON = JSON.stringify(statusReport);
    core.debug(`Sending status report: ${statusReportJSON}`);
    const nwo = getRequiredEnvParam("GITHUB_REPOSITORY");
    const [owner, repo] = nwo.split("/");
    const client = api.getActionsApiClient();
    try {
        await client.request("PUT /repos/:owner/:repo/code-scanning/analysis/status", {
            owner,
            repo,
            data: statusReportJSON,
        });
        return true;
    }
    catch (e) {
        if (isHTTPError(e)) {
            switch (e.status) {
                case 403:
                    core.setFailed("The repo on which this action is running is not opted-in to CodeQL code scanning.");
                    return false;
                case 404:
                    core.setFailed("Not authorized to used the CodeQL code scanning feature on this repo.");
                    return false;
                case 422:
                    // schema incompatibility when reporting status
                    // this means that this action version is no longer compatible with the API
                    // we still want to continue as it is likely the analysis endpoint will work
                    if (getRequiredEnvParam("GITHUB_SERVER_URL") !== util_1.GITHUB_DOTCOM_URL) {
                        core.warning("CodeQL Action version is incompatible with the code scanning endpoint. Please update to a compatible version of codeql-action.");
                    }
                    else {
                        core.warning("CodeQL Action is out-of-date. Please upgrade to the latest version of codeql-action.");
                    }
                    return true;
            }
        }
        // something else has gone wrong and the request/response will be logged by octokit
        // it's possible this is a transient error and we should continue scanning
        core.error("An unexpected error occured when sending code scanning status report.");
        return true;
    }
}
exports.sendStatusReport = sendStatusReport;
// Is the current action executing a local copy (i.e. we're running a workflow on the codeql-action repo itself)
// as opposed to running a remote action (i.e. when another repo references us)
function isRunningLocalAction() {
    const relativeScriptPath = getRelativeScriptPath();
    return (relativeScriptPath.startsWith("..") || path.isAbsolute(relativeScriptPath));
}
exports.isRunningLocalAction = isRunningLocalAction;
// Get the location where the action is running from.
// This can be used to get the actions name or tell if we're running a local action.
function getRelativeScriptPath() {
    const runnerTemp = getRequiredEnvParam("RUNNER_TEMP");
    const actionsDirectory = path.join(path.dirname(runnerTemp), "_actions");
    return path.relative(actionsDirectory, __filename);
}
exports.getRelativeScriptPath = getRelativeScriptPath;
//# sourceMappingURL=actions-util.js.map