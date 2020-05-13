"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const http = __importStar(require("@actions/http-client"));
const auth = __importStar(require("@actions/http-client/auth"));
const octokit = __importStar(require("@octokit/rest"));
const console_log_level_1 = __importDefault(require("console-log-level"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const sharedEnv = __importStar(require("./shared-environment"));
/**
 * Should the current action be aborted?
 *
 * This method should be called at the start of all CodeQL actions and they
 * should abort cleanly if this returns true without failing the action.
 * This method will call `core.setFailed` if necessary.
 */
function should_abort(actionName, requireInitActionHasRun) {
    // Check that required aspects of the environment are present
    const ref = process.env['GITHUB_REF'];
    if (ref === undefined) {
        core.setFailed('GITHUB_REF must be set.');
        return true;
    }
    // Should abort if called on a merge commit for a pull request.
    if (ref.startsWith('refs/pull/')) {
        core.warning('The CodeQL ' + actionName + ' action is intended for workflows triggered on `push` events, '
            + 'but the current workflow is running on a pull request. Aborting.');
        return true;
    }
    // If the init action is required, then check the it completed successfully.
    if (requireInitActionHasRun && process.env[sharedEnv.CODEQL_ACTION_INIT_COMPLETED] === undefined) {
        core.setFailed('The CodeQL ' + actionName + ' action cannot be used unless the CodeQL init action is run first. Aborting.');
        return true;
    }
    return false;
}
exports.should_abort = should_abort;
/**
 * Resolve the path to the workspace folder.
 */
function workspaceFolder() {
    let workspaceFolder = process.env['RUNNER_WORKSPACE'];
    if (!workspaceFolder)
        workspaceFolder = path.resolve('..');
    return workspaceFolder;
}
exports.workspaceFolder = workspaceFolder;
/**
 * Get an environment parameter, but throw an error if it is not set.
 */
function getRequiredEnvParam(paramName) {
    const value = process.env[paramName];
    if (value === undefined) {
        throw new Error(paramName + ' environment variable must be set');
    }
    core.debug(paramName + '=' + value);
    return value;
}
exports.getRequiredEnvParam = getRequiredEnvParam;
/**
 * Gets the set of languages in the current repository
 */
async function getLanguagesInRepo() {
    var _a;
    // Translate between GitHub's API names for languages and ours
    const codeqlLanguages = {
        'C': 'cpp',
        'C++': 'cpp',
        'C#': 'csharp',
        'Go': 'go',
        'Java': 'java',
        'JavaScript': 'javascript',
        'TypeScript': 'javascript',
        'Python': 'python',
    };
    let repo_nwo = (_a = process.env['GITHUB_REPOSITORY']) === null || _a === void 0 ? void 0 : _a.split("/");
    if (repo_nwo) {
        let owner = repo_nwo[0];
        let repo = repo_nwo[1];
        core.debug(`GitHub repo ${owner} ${repo}`);
        let ok = new octokit.Octokit({
            auth: core.getInput('token'),
            userAgent: "CodeQL Action",
            log: console_log_level_1.default({ level: "debug" })
        });
        const response = await ok.request("GET /repos/:owner/:repo/languages", ({
            owner,
            repo
        }));
        core.debug("Languages API response: " + JSON.stringify(response));
        // The GitHub API is going to return languages in order of popularity,
        // When we pick a language to autobuild we want to pick the most popular traced language
        // Since sets in javascript maintain insertion order, using a set here and then splatting it
        // into an array gives us an array of languages ordered by popularity
        let languages = new Set();
        for (let lang in response.data) {
            if (lang in codeqlLanguages) {
                languages.add(codeqlLanguages[lang]);
            }
        }
        return [...languages];
    }
    else {
        return [];
    }
}
/**
 * Get the languages to analyse.
 *
 * The result is obtained from the environment parameter CODEQL_ACTION_LANGUAGES
 * if that has been set, otherwise it is obtained from the action input parameter
 * 'languages' if that has been set, otherwise it is deduced as all languages in the
 * repo that can be analysed.
 *
 * If the languages are obtained from either of the second choices, the
 * CODEQL_ACTION_LANGUAGES environment variable will be exported with the
 * deduced list.
 */
async function getLanguages() {
    // Obtain from CODEQL_ACTION_LANGUAGES if set
    const langsVar = process.env[sharedEnv.CODEQL_ACTION_LANGUAGES];
    if (langsVar) {
        return langsVar.split(',')
            .map(x => x.trim())
            .filter(x => x.length > 0);
    }
    // Obtain from action input 'languages' if set
    let languages = core.getInput('languages', { required: false })
        .split(',')
        .map(x => x.trim())
        .filter(x => x.length > 0);
    core.info("Languages from configuration: " + JSON.stringify(languages));
    if (languages.length === 0) {
        // Obtain languages as all languages in the repo that can be analysed
        languages = await getLanguagesInRepo();
        core.info("Automatically detected languages: " + JSON.stringify(languages));
    }
    core.exportVariable(sharedEnv.CODEQL_ACTION_LANGUAGES, languages.join(','));
    return languages;
}
exports.getLanguages = getLanguages;
/**
 * Get the path of the currently executing workflow.
 */
async function getWorkflowPath() {
    const repo_nwo = getRequiredEnvParam('GITHUB_REPOSITORY').split("/");
    const owner = repo_nwo[0];
    const repo = repo_nwo[1];
    const run_id = getRequiredEnvParam('GITHUB_RUN_ID');
    const ok = new octokit.Octokit({
        auth: core.getInput('token'),
        userAgent: "CodeQL Action",
        log: console_log_level_1.default({ level: 'debug' })
    });
    const runsResponse = await ok.request('GET /repos/:owner/:repo/actions/runs/:run_id', {
        owner,
        repo,
        run_id
    });
    const workflowUrl = runsResponse.data.workflow_url;
    const workflowResponse = await ok.request('GET ' + workflowUrl);
    return workflowResponse.data.path;
}
/**
 * Get the analysis key paramter for the current job.
 *
 * This will combine the workflow path and current job name.
 * Computing this the first time requires making requests to
 * the github API, but after that the result will be cached.
 */
async function getAnalysisKey() {
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
exports.getAnalysisKey = getAnalysisKey;
/**
 * Get the ref currently being analyzed.
 */
function getRef() {
    // it's in the form "refs/heads/master"
    return getRequiredEnvParam('GITHUB_REF');
}
exports.getRef = getRef;
/**
 * Compose a StatusReport.
 *
 * @param actionName The name of the action, e.g. 'init', 'finish', 'upload-sarif'
 * @param status The status. Must be 'success', 'failure', or 'starting'
 * @param cause  Cause of failure (only supply if status is 'failure')
 * @param exception Exception (only supply if status is 'failure')
 */
async function createStatusReport(actionName, status, cause, exception) {
    const commitOid = process.env['GITHUB_SHA'] || '';
    const ref = getRef();
    const workflowRunIDStr = process.env['GITHUB_RUN_ID'];
    let workflowRunID = -1;
    if (workflowRunIDStr) {
        workflowRunID = parseInt(workflowRunIDStr, 10);
    }
    const workflowName = process.env['GITHUB_WORKFLOW'] || '';
    const jobName = process.env['GITHUB_JOB'] || '';
    const languages = (await getLanguages()).sort().join(',');
    const startedAt = process.env[sharedEnv.CODEQL_ACTION_STARTED_AT] || new Date().toISOString();
    core.exportVariable(sharedEnv.CODEQL_ACTION_STARTED_AT, startedAt);
    let statusReport = {
        workflow_run_id: workflowRunID,
        workflow_name: workflowName,
        job_name: jobName,
        languages: languages,
        commit_oid: commitOid,
        ref: ref,
        action_name: actionName,
        action_oid: "unknown",
        started_at: startedAt,
        status: status
    };
    // Add optional parameters
    if (cause) {
        statusReport.cause = cause;
    }
    if (exception) {
        statusReport.exception = exception;
    }
    if (status === 'success' || status === 'failure') {
        statusReport.completed_at = new Date().toISOString();
    }
    let matrix = core.getInput('matrix');
    if (matrix) {
        statusReport.matrix_vars = matrix;
    }
    return statusReport;
}
/**
 * Send a status report to the code_scanning/analysis/status endpoint.
 *
 * Returns the status code of the response to the status request, or
 * undefined if the given statusReport is undefined or no response was
 * received.
 */
async function sendStatusReport(statusReport) {
    var _a;
    const statusReportJSON = JSON.stringify(statusReport);
    core.debug('Sending status report: ' + statusReportJSON);
    const githubToken = core.getInput('token');
    const ph = new auth.BearerCredentialHandler(githubToken);
    const client = new http.HttpClient('Code Scanning : Status Report', [ph]);
    const url = 'https://api.github.com/repos/' + process.env['GITHUB_REPOSITORY']
        + '/code-scanning/analysis/status';
    const res = await client.put(url, statusReportJSON);
    return (_a = res.message) === null || _a === void 0 ? void 0 : _a.statusCode;
}
/**
 * Send a status report that an action is starting.
 *
 * If the action is `init` then this also records the start time in the environment,
 * and ensures that the analysed languages are also recorded in the envirenment.
 *
 * Returns true unless a problem occurred and the action should abort.
 */
async function reportActionStarting(action) {
    const statusCode = await sendStatusReport(await createStatusReport(action, 'starting'));
    // If the status report request fails with a 403 or a 404, then this is a deliberate
    // message from the endpoint that the SARIF upload can be expected to fail too,
    // so the action should fail to avoid wasting actions minutes.
    //
    // Other failure responses (or lack thereof) could be transitory and should not
    // cause the action to fail.
    if (statusCode === 403) {
        core.setFailed('The repo on which this action is running is not opted-in to CodeQL code scanning.');
        return false;
    }
    if (statusCode === 404) {
        core.setFailed('Not authorized to used the CodeQL code scanning feature on this repo.');
        return false;
    }
    return true;
}
exports.reportActionStarting = reportActionStarting;
/**
 * Report that an action has failed.
 *
 * Note that the started_at date is always that of the `init` action, since
 * this is likely to give a more useful duration when inspecting events.
 */
async function reportActionFailed(action, cause, exception) {
    await sendStatusReport(await createStatusReport(action, 'failure', cause, exception));
}
exports.reportActionFailed = reportActionFailed;
/**
 * Report that an action has succeeded.
 *
 * Note that the started_at date is always that of the `init` action, since
 * this is likely to give a more useful duration when inspecting events.
 */
async function reportActionSucceeded(action) {
    await sendStatusReport(await createStatusReport(action, 'success'));
}
exports.reportActionSucceeded = reportActionSucceeded;
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
    await body(tmpDir);
    fs.rmdirSync(tmpDir, { recursive: true });
}
exports.withTmpDir = withTmpDir;
//# sourceMappingURL=util.js.map