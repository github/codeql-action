"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const api = __importStar(require("./api-client"));
const sharedEnv = __importStar(require("./shared-environment"));
/**
 * The API URL for github.com.
 */
exports.GITHUB_DOTCOM_API_URL = "https://api.github.com";
/**
 * Get the API URL for the GitHub instance we are connected to.
 * May be for github.com or for an enterprise instance.
 */
function getInstanceAPIURL() {
    return process.env["GITHUB_API_URL"] || exports.GITHUB_DOTCOM_API_URL;
}
exports.getInstanceAPIURL = getInstanceAPIURL;
/**
 * Are we running against a GitHub Enterpise instance, as opposed to github.com.
 */
function isEnterprise() {
    return getInstanceAPIURL() !== exports.GITHUB_DOTCOM_API_URL;
}
exports.isEnterprise = isEnterprise;
/**
 * Get an environment parameter, but throw an error if it is not set.
 */
function getRequiredEnvParam(paramName) {
    const value = process.env[paramName];
    if (value === undefined || value.length === 0) {
        throw new Error(paramName + ' environment variable must be set');
    }
    core.debug(paramName + '=' + value);
    return value;
}
exports.getRequiredEnvParam = getRequiredEnvParam;
/**
 * Get the extra options for the codeql commands.
 */
function getExtraOptionsEnvParam() {
    const varName = 'CODEQL_ACTION_EXTRA_OPTIONS';
    const raw = process.env[varName];
    if (raw === undefined || raw.length === 0) {
        return {};
    }
    try {
        return JSON.parse(raw);
    }
    catch (e) {
        throw new Error(varName +
            ' environment variable is set, but does not contain valid JSON: ' +
            e.message);
    }
}
exports.getExtraOptionsEnvParam = getExtraOptionsEnvParam;
function isLocalRun() {
    return !!process.env.CODEQL_LOCAL_RUN
        && process.env.CODEQL_LOCAL_RUN !== 'false'
        && process.env.CODEQL_LOCAL_RUN !== '0';
}
exports.isLocalRun = isLocalRun;
/**
 * Ensures all required environment variables are set in the context of a local run.
 */
function prepareLocalRunEnvironment() {
    if (!isLocalRun()) {
        return;
    }
    core.debug('Action is running locally.');
    if (!process.env.GITHUB_JOB) {
        core.exportVariable('GITHUB_JOB', 'UNKNOWN-JOB');
    }
}
exports.prepareLocalRunEnvironment = prepareLocalRunEnvironment;
/**
 * Gets the SHA of the commit that is currently checked out.
 */
async function getCommitOid() {
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
    }
    catch (e) {
        core.info("Failed to call git to get current commit. Continuing with data from environment: " + e);
        return getRequiredEnvParam('GITHUB_SHA');
    }
}
exports.getCommitOid = getCommitOid;
/**
 * Get the path of the currently executing workflow.
 */
async function getWorkflowPath() {
    const repo_nwo = getRequiredEnvParam('GITHUB_REPOSITORY').split("/");
    const owner = repo_nwo[0];
    const repo = repo_nwo[1];
    const run_id = Number(getRequiredEnvParam('GITHUB_RUN_ID'));
    const apiClient = api.getActionsApiClient();
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
 * Get the workflow run ID.
 */
function getWorkflowRunID() {
    const workflowRunID = parseInt(getRequiredEnvParam('GITHUB_RUN_ID'), 10);
    if (Number.isNaN(workflowRunID)) {
        throw new Error('GITHUB_RUN_ID must define a non NaN workflow run ID');
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
    const analysisKeyEnvVar = 'CODEQL_ACTION_ANALYSIS_KEY';
    let analysisKey = process.env[analysisKeyEnvVar];
    if (analysisKey !== undefined) {
        return analysisKey;
    }
    const workflowPath = await getWorkflowPath();
    const jobName = getRequiredEnvParam('GITHUB_JOB');
    analysisKey = workflowPath + ':' + jobName;
    core.exportVariable(analysisKeyEnvVar, analysisKey);
    return analysisKey;
}
exports.getAnalysisKey = getAnalysisKey;
/**
 * Get the ref currently being analyzed.
 */
function getRef() {
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
    let statusReport = {
        workflow_run_id: workflowRunID,
        workflow_name: workflowName,
        job_name: jobName,
        analysis_key: analysis_key,
        commit_oid: commitOid,
        ref: ref,
        action_name: actionName,
        action_oid: "unknown",
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
    let matrix = core.getInput('matrix');
    if (matrix) {
        statusReport.matrix_vars = matrix;
    }
    return statusReport;
}
exports.createStatusReportBase = createStatusReportBase;
/**
 * Send a status report to the code_scanning/analysis/status endpoint.
 *
 * Optionally checks the response from the API endpoint and sets the action
 * as failed if the status report failed. This is only expected to be used
 * when sending a 'starting' report.
 *
 * Returns whether sending the status report was successful of not.
 */
async function sendStatusReport(statusReport, ignoreFailures) {
    if (isEnterprise()) {
        core.debug("Not sending status report to GitHub Enterprise");
        return true;
    }
    if (isLocalRun()) {
        core.debug("Not sending status report because this is a local run");
        return true;
    }
    const statusReportJSON = JSON.stringify(statusReport);
    core.debug('Sending status report: ' + statusReportJSON);
    const nwo = getRequiredEnvParam("GITHUB_REPOSITORY");
    const [owner, repo] = nwo.split("/");
    const client = api.getActionsApiClient();
    const statusResponse = await client.request('PUT /repos/:owner/:repo/code-scanning/analysis/status', {
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
exports.sendStatusReport = sendStatusReport;
/**
 * Get the array of all the tool names contained in the given sarif contents.
 *
 * Returns an array of unique string tool names.
 */
function getToolNames(sarifContents) {
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
exports.getToolNames = getToolNames;
// Creates a random temporary directory, runs the given body, and then deletes the directory.
// Mostly intended for use within tests.
async function withTmpDir(body) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeql-action-'));
    const realSubdir = path.join(tmpDir, 'real');
    fs.mkdirSync(realSubdir);
    const symlinkSubdir = path.join(tmpDir, 'symlink');
    fs.symlinkSync(realSubdir, symlinkSubdir, 'dir');
    const result = await body(symlinkSubdir);
    fs.rmdirSync(tmpDir, { recursive: true });
    return result;
}
exports.withTmpDir = withTmpDir;
/**
 * Get the codeql `--ram` flag as configured by the `ram` input. If no value was
 * specified, the total available memory will be used minus 256 MB.
 *
 * @returns string
 */
function getMemoryFlag() {
    let memoryToUseMegaBytes;
    const memoryToUseString = core.getInput("ram");
    if (memoryToUseString) {
        memoryToUseMegaBytes = Number(memoryToUseString);
        if (Number.isNaN(memoryToUseMegaBytes) || memoryToUseMegaBytes <= 0) {
            throw new Error("Invalid RAM setting \"" + memoryToUseString + "\", specified.");
        }
    }
    else {
        const totalMemoryBytes = os.totalmem();
        const totalMemoryMegaBytes = totalMemoryBytes / (1024 * 1024);
        const systemReservedMemoryMegaBytes = 256;
        memoryToUseMegaBytes = totalMemoryMegaBytes - systemReservedMemoryMegaBytes;
    }
    return "--ram=" + Math.floor(memoryToUseMegaBytes);
}
exports.getMemoryFlag = getMemoryFlag;
/**
 * Get the codeql `--threads` value specified for the `threads` input.
 * If not value was specified, all available threads will be used.
 *
 * The value will be capped to the number of available CPUs.
 *
 * @returns string
 */
function getThreadsFlag() {
    let numThreads;
    const numThreadsString = core.getInput("threads");
    const maxThreads = os.cpus().length;
    if (numThreadsString) {
        numThreads = Number(numThreadsString);
        if (Number.isNaN(numThreads)) {
            throw new Error(`Invalid threads setting "${numThreadsString}", specified.`);
        }
        if (numThreads > maxThreads) {
            core.info(`Clamping desired number of threads (${numThreads}) to max available (${maxThreads}).`);
            numThreads = maxThreads;
        }
        const minThreads = -maxThreads;
        if (numThreads < minThreads) {
            core.info(`Clamping desired number of free threads (${numThreads}) to max available (${minThreads}).`);
            numThreads = minThreads;
        }
    }
    else {
        // Default to using all threads
        numThreads = maxThreads;
    }
    return `--threads=${numThreads}`;
}
exports.getThreadsFlag = getThreadsFlag;
/**
 * Get the directory where CodeQL databases should be placed.
 */
function getCodeQLDatabasesDir() {
    return path.resolve(getRequiredEnvParam('RUNNER_TEMP'), 'codeql_databases');
}
exports.getCodeQLDatabasesDir = getCodeQLDatabasesDir;
//# sourceMappingURL=util.js.map