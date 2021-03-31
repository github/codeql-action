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
function getTemporaryDirectory() {
    const value = process.env["CODEQL_ACTION_TEMP"];
    return value !== undefined && value !== ""
        ? value
        : getRequiredEnvParam("RUNNER_TEMP");
}
exports.getTemporaryDirectory = getTemporaryDirectory;
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
exports.getCommitOid = async function (ref = "HEAD") {
    // Try to use git to get the current commit SHA. If that fails then
    // log but otherwise silently fall back to using the SHA from the environment.
    // The only time these two values will differ is during analysis of a PR when
    // the workflow has changed the current commit to the head commit instead of
    // the merge commit, which must mean that git is available.
    // Even if this does go wrong, it's not a huge problem for the alerts to
    // reported on the merge commit.
    try {
        let commitOid = "";
        await new toolrunner.ToolRunner(await safeWhich.safeWhich("git"), ["rev-parse", ref], {
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
function branchesToArray(branches) {
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
function toCodedErrors(errors) {
    return Object.entries(errors).reduce((acc, [key, value]) => {
        acc[key] = { message: value, code: key };
        return acc;
    }, {});
}
// code to send back via status report
// message to add as a warning annotation to the run
exports.WorkflowErrors = toCodedErrors({
    MismatchedBranches: `Please make sure that every branch in on.pull_request is also in on.push so that Code Scanning can compare pull requests against the state of the base branch.`,
    MissingPushHook: `Please specify an on.push hook so that Code Scanning can compare pull requests against the state of the base branch.`,
    PathsSpecified: `Using on.push.paths can prevent Code Scanning annotating new alerts in your pull requests.`,
    PathsIgnoreSpecified: `Using on.push.paths-ignore can prevent Code Scanning annotating new alerts in your pull requests.`,
    CheckoutWrongHead: `git checkout HEAD^2 is no longer necessary. Please remove this step as Code Scanning recommends analyzing the merge commit for best results.`,
});
function getWorkflowErrors(doc) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const errors = [];
    const jobName = process.env.GITHUB_JOB;
    if (jobName) {
        const job = (_b = (_a = doc) === null || _a === void 0 ? void 0 : _a.jobs) === null || _b === void 0 ? void 0 : _b[jobName];
        const steps = (_c = job) === null || _c === void 0 ? void 0 : _c.steps;
        if (Array.isArray(steps)) {
            for (const step of steps) {
                // this was advice that we used to give in the README
                // we actually want to run the analysis on the merge commit
                // to produce results that are more inline with expectations
                // (i.e: this is what will happen if you merge this PR)
                // and avoid some race conditions
                if (((_d = step) === null || _d === void 0 ? void 0 : _d.run) === "git checkout HEAD^2") {
                    errors.push(exports.WorkflowErrors.CheckoutWrongHead);
                    break;
                }
            }
        }
    }
    let missingPush = false;
    if (doc.on === undefined) {
        // this is not a valid config
    }
    else if (typeof doc.on === "string") {
        if (doc.on === "pull_request") {
            missingPush = true;
        }
    }
    else if (Array.isArray(doc.on)) {
        const hasPush = doc.on.includes("push");
        const hasPullRequest = doc.on.includes("pull_request");
        if (hasPullRequest && !hasPush) {
            missingPush = true;
        }
    }
    else if (isObject(doc.on)) {
        const hasPush = Object.prototype.hasOwnProperty.call(doc.on, "push");
        const hasPullRequest = Object.prototype.hasOwnProperty.call(doc.on, "pull_request");
        if (!hasPush && hasPullRequest) {
            missingPush = true;
        }
        if (hasPush && hasPullRequest) {
            const paths = (_e = doc.on.push) === null || _e === void 0 ? void 0 : _e.paths;
            // if you specify paths or paths-ignore you can end up with commits that have no baseline
            // if they didn't change any files
            // currently we cannot go back through the history and find the most recent baseline
            if (Array.isArray(paths) && paths.length > 0) {
                errors.push(exports.WorkflowErrors.PathsSpecified);
            }
            const pathsIgnore = (_f = doc.on.push) === null || _f === void 0 ? void 0 : _f["paths-ignore"];
            if (Array.isArray(pathsIgnore) && pathsIgnore.length > 0) {
                errors.push(exports.WorkflowErrors.PathsIgnoreSpecified);
            }
        }
        // if doc.on.pull_request is null that means 'all branches'
        // if doc.on.pull_request is undefined that means 'off'
        // we only want to check for mismatched branches if pull_request is on.
        if (doc.on.pull_request !== undefined) {
            const push = branchesToArray((_g = doc.on.push) === null || _g === void 0 ? void 0 : _g.branches);
            if (push !== "**") {
                const pull_request = branchesToArray((_h = doc.on.pull_request) === null || _h === void 0 ? void 0 : _h.branches);
                if (pull_request !== "**") {
                    const difference = pull_request.filter((value) => !push.some((o) => patternIsSuperset(o, value)));
                    if (difference.length > 0) {
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
    }
    if (missingPush) {
        errors.push(exports.WorkflowErrors.MissingPushHook);
    }
    return errors;
}
exports.getWorkflowErrors = getWorkflowErrors;
async function validateWorkflow() {
    let workflow;
    try {
        workflow = await getWorkflow();
    }
    catch (e) {
        return `error: getWorkflow() failed: ${e.toString()}`;
    }
    let workflowErrors;
    try {
        workflowErrors = getWorkflowErrors(workflow);
    }
    catch (e) {
        return `error: getWorkflowErrors() failed: ${e.toString()}`;
    }
    if (workflowErrors.length > 0) {
        let message;
        try {
            message = formatWorkflowErrors(workflowErrors);
        }
        catch (e) {
            return `error: formatWorkflowErrors() failed: ${e.toString()}`;
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
async function getWorkflow() {
    const relativePath = await getWorkflowPath();
    const absolutePath = path.join(getRequiredEnvParam("GITHUB_WORKSPACE"), relativePath);
    return yaml.safeLoad(fs.readFileSync(absolutePath, "utf-8"));
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
 * Get the analysis key parameter for the current job.
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
    const sha = getRequiredEnvParam("GITHUB_SHA");
    // For pull request refs we want to detect whether the workflow
    // has run `git checkout HEAD^2` to analyze the 'head' ref rather
    // than the 'merge' ref. If so, we want to convert the ref that
    // we report back.
    const pull_ref_regex = /refs\/pull\/(\d+)\/merge/;
    if (!pull_ref_regex.test(ref)) {
        return ref;
    }
    const head = await exports.getCommitOid("HEAD");
    // in actions/checkout@v2 we can check if git rev-parse HEAD == GITHUB_SHA
    // in actions/checkout@v1 this may not be true as it checks out the repository
    // using GITHUB_REF. There is a subtle race condition where
    // git rev-parse GITHUB_REF != GITHUB_SHA, so we must check
    // git git-parse GITHUB_REF == git rev-parse HEAD instead.
    const hasChangedRef = sha !== head &&
        (await exports.getCommitOid(ref.replace(/^refs\/pull\//, "refs/remotes/pull/"))) !==
            head;
    if (hasChangedRef) {
        const newRef = ref.replace(pull_ref_regex, "refs/pull/$1/head");
        core.debug(`No longer on merge commit, rewriting ref from ${ref} to ${newRef}.`);
        return newRef;
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
const GENERIC_403_MSG = "The repo on which this action is running is not opted-in to CodeQL code scanning.";
const GENERIC_404_MSG = "Not authorized to used the CodeQL code scanning feature on this repo.";
const OUT_OF_DATE_MSG = "CodeQL Action is out-of-date. Please upgrade to the latest version of codeql-action.";
const INCOMPATIBLE_MSG = "CodeQL Action version is incompatible with the code scanning endpoint. Please update to a compatible version of codeql-action.";
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
        console.log(e);
        if (isHTTPError(e)) {
            switch (e.status) {
                case 403:
                    if (workflowIsTriggeredByPushEvent() && isDependabotActor()) {
                        core.setFailed('Workflows triggered by Dependabot on the "push" event run with read-only access. ' +
                            "Uploading Code Scanning results requires write access. " +
                            'To use Code Scanning with Dependabot, please ensure you are using the "pull_request" event for this workflow and avoid triggering on the "push" event for Dependabot branches. ' +
                            "See https://docs.github.com/en/code-security/secure-coding/configuring-code-scanning#scanning-on-push for more information on how to configure these events.");
                    }
                    else {
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
                    if (getRequiredEnvParam("GITHUB_SERVER_URL") !== util_1.GITHUB_DOTCOM_URL) {
                        core.debug(INCOMPATIBLE_MSG);
                    }
                    else {
                        core.debug(OUT_OF_DATE_MSG);
                    }
                    return true;
            }
        }
        // something else has gone wrong and the request/response will be logged by octokit
        // it's possible this is a transient error and we should continue scanning
        core.error("An unexpected error occurred when sending code scanning status report.");
        return true;
    }
}
exports.sendStatusReport = sendStatusReport;
// Was the workflow run triggered by a `push` event, for example as opposed to a `pull_request` event.
function workflowIsTriggeredByPushEvent() {
    return process.env["GITHUB_EVENT_NAME"] === "push";
}
// Is dependabot the actor that triggered the current workflow run.
function isDependabotActor() {
    return process.env["GITHUB_ACTOR"] === "dependabot[bot]";
}
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