import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as http from '@actions/http-client';
import * as auth from '@actions/http-client/auth';
import * as octokit from '@octokit/rest';
import consoleLogLevel from 'console-log-level';
import * as fs from "fs";
import * as os from 'os';
import * as path from 'path';

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
    if (value === undefined) {
        throw new Error(paramName + ' environment variable must be set');
    }
    core.debug(paramName + '=' + value);
    return value;
}

/**
 * Gets the set of languages in the current repository
 */
async function getLanguagesInRepo(): Promise<string[]> {
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
    let repo_nwo = process.env['GITHUB_REPOSITORY']?.split("/");
    if (repo_nwo) {
        let owner = repo_nwo[0];
        let repo = repo_nwo[1];

        core.debug(`GitHub repo ${owner} ${repo}`);
        let ok = new octokit.Octokit({
            auth: core.getInput('token'),
            userAgent: "CodeQL Action",
            log: consoleLogLevel({ level: "debug" })
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
        let languages: Set<string> = new Set();
        for (let lang in response.data) {
            if (lang in codeqlLanguages) {
                languages.add(codeqlLanguages[lang]);
            }
        }
        return [...languages];
    } else {
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
export async function getLanguages(): Promise<string[]> {

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

/**
 * Gets the SHA of the commit that is currently checked out.
 */
export async function getCommitOid(): Promise<string> {
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

/**
 * Get the path of the currently executing workflow.
 */
async function getWorkflowPath(): Promise<string> {
    const repo_nwo = getRequiredEnvParam('GITHUB_REPOSITORY').split("/");
    const owner = repo_nwo[0];
    const repo = repo_nwo[1];
    const run_id = getRequiredEnvParam('GITHUB_RUN_ID');

    const ok = new octokit.Octokit({
        auth: core.getInput('token'),
        userAgent: "CodeQL Action",
        log: consoleLogLevel({ level: 'debug' })
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

interface StatusReport {
    "workflow_run_id": number;
    "workflow_name": string;
    "job_name": string;
    "matrix_vars"?: string;
    "languages": string;
    "commit_oid": string;
    "ref": string;
    "action_name": string;
    "action_oid": string;
    "started_at": string;
    "completed_at"?: string;
    "status": string;
    "cause"?: string;
    "exception"?: string;
}

/**
 * Compose a StatusReport.
 *
 * @param actionName The name of the action, e.g. 'init', 'finish', 'upload-sarif'
 * @param status The status. Must be 'success', 'failure', or 'starting'
 * @param cause  Cause of failure (only supply if status is 'failure')
 * @param exception Exception (only supply if status is 'failure')
 */
async function createStatusReport(
    actionName: string,
    status: string,
    cause?: string,
    exception?: string):
    Promise<StatusReport> {

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

    let statusReport: StatusReport = {
        workflow_run_id: workflowRunID,
        workflow_name: workflowName,
        job_name: jobName,
        languages: languages,
        commit_oid: commitOid,
        ref: ref,
        action_name: actionName,
        action_oid: "unknown", // TODO decide if it's possible to fill this in
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
    let matrix: string | undefined = core.getInput('matrix');
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
async function sendStatusReport(statusReport: StatusReport): Promise<number | undefined> {
    const statusReportJSON = JSON.stringify(statusReport);

    core.debug('Sending status report: ' + statusReportJSON);

    const githubToken = core.getInput('token');
    const ph: auth.BearerCredentialHandler = new auth.BearerCredentialHandler(githubToken);
    const client = new http.HttpClient('Code Scanning : Status Report', [ph]);
    const url = 'https://api.github.com/repos/' + process.env['GITHUB_REPOSITORY']
        + '/code-scanning/analysis/status';
    const res: http.HttpClientResponse = await client.put(url, statusReportJSON);

    return res.message?.statusCode;
}

/**
 * Send a status report that an action is starting.
 *
 * If the action is `init` then this also records the start time in the environment,
 * and ensures that the analysed languages are also recorded in the envirenment.
 *
 * Returns true unless a problem occurred and the action should abort.
 */
export async function reportActionStarting(action: string): Promise<boolean> {
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

/**
 * Report that an action has failed.
 *
 * Note that the started_at date is always that of the `init` action, since
 * this is likely to give a more useful duration when inspecting events.
 */
export async function reportActionFailed(action: string, cause?: string, exception?: string) {
    await sendStatusReport(await createStatusReport(action, 'failure', cause, exception));
}

/**
 * Report that an action has succeeded.
 *
 * Note that the started_at date is always that of the `init` action, since
 * this is likely to give a more useful duration when inspecting events.
 */
export async function reportActionSucceeded(action: string) {
    await sendStatusReport(await createStatusReport(action, 'success'));
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
    const result = await body(tmpDir);
    fs.rmdirSync(tmpDir, { recursive: true });
    return result;
}
