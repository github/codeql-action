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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendStatusReport = exports.createStatusReportBase = exports.getActionsStatus = void 0;
const os = __importStar(require("os"));
const core = __importStar(require("@actions/core"));
const actions_util_1 = require("./actions-util");
const api_client_1 = require("./api-client");
const environment_1 = require("./environment");
const util_1 = require("./util");
function getActionsStatus(error, otherFailureCause) {
    if (error || otherFailureCause) {
        return error instanceof util_1.UserError ? "user-error" : "failure";
    }
    else {
        return "success";
    }
}
exports.getActionsStatus = getActionsStatus;
/**
 * Compose a StatusReport.
 *
 * @param actionName The name of the action, e.g. 'init', 'finish', 'upload-sarif'
 * @param status The status. Must be 'success', 'failure', or 'starting'
 * @param startedAt The time this action started executing.
 * @param cause  Cause of failure (only supply if status is 'failure')
 * @param exception Exception (only supply if status is 'failure')
 */
async function createStatusReportBase(actionName, status, actionStartedAt, diskInfo, cause, exception) {
    const commitOid = (0, actions_util_1.getOptionalInput)("sha") || process.env["GITHUB_SHA"] || "";
    const ref = await (0, actions_util_1.getRef)();
    const jobRunUUID = process.env[environment_1.EnvVar.JOB_RUN_UUID] || "";
    const workflowRunID = (0, actions_util_1.getWorkflowRunID)();
    const workflowRunAttempt = (0, actions_util_1.getWorkflowRunAttempt)();
    const workflowName = process.env["GITHUB_WORKFLOW"] || "";
    const jobName = process.env["GITHUB_JOB"] || "";
    const analysis_key = await (0, api_client_1.getAnalysisKey)();
    let workflowStartedAt = process.env[environment_1.EnvVar.WORKFLOW_STARTED_AT];
    if (workflowStartedAt === undefined) {
        workflowStartedAt = actionStartedAt.toISOString();
        core.exportVariable(environment_1.EnvVar.WORKFLOW_STARTED_AT, workflowStartedAt);
    }
    const runnerOs = (0, util_1.getRequiredEnvParam)("RUNNER_OS");
    const codeQlCliVersion = (0, util_1.getCachedCodeQlVersion)();
    const actionRef = process.env["GITHUB_ACTION_REF"];
    const testingEnvironment = process.env[environment_1.EnvVar.TESTING_ENVIRONMENT] || "";
    // re-export the testing environment variable so that it is available to subsequent steps,
    // even if it was only set for this step
    if (testingEnvironment !== "") {
        core.exportVariable(environment_1.EnvVar.TESTING_ENVIRONMENT, testingEnvironment);
    }
    const statusReport = {
        action_name: actionName,
        action_oid: "unknown",
        action_ref: actionRef,
        action_started_at: actionStartedAt.toISOString(),
        action_version: (0, actions_util_1.getActionVersion)(),
        analysis_key,
        commit_oid: commitOid,
        job_name: jobName,
        job_run_uuid: jobRunUUID,
        ref,
        runner_available_disk_space_bytes: diskInfo.numAvailableBytes,
        runner_os: runnerOs,
        runner_total_disk_space_bytes: diskInfo.numTotalBytes,
        started_at: workflowStartedAt,
        status,
        testing_environment: testingEnvironment,
        workflow_name: workflowName,
        workflow_run_attempt: workflowRunAttempt,
        workflow_run_id: workflowRunID,
    };
    // Add optional parameters
    if (cause) {
        statusReport.cause = cause;
    }
    if (exception) {
        statusReport.exception = exception;
    }
    if (status === "success" ||
        status === "failure" ||
        status === "aborted" ||
        status === "user-error") {
        statusReport.completed_at = new Date().toISOString();
    }
    const matrix = (0, actions_util_1.getRequiredInput)("matrix");
    if (matrix) {
        statusReport.matrix_vars = matrix;
    }
    if ("RUNNER_ARCH" in process.env) {
        // RUNNER_ARCH is available only in GHES 3.4 and later
        // Values other than X86, X64, ARM, or ARM64 are discarded server side
        statusReport.runner_arch = process.env["RUNNER_ARCH"];
    }
    if (runnerOs === "Windows" || runnerOs === "macOS") {
        statusReport.runner_os_release = os.release();
    }
    if (codeQlCliVersion !== undefined) {
        statusReport.codeql_version = codeQlCliVersion;
    }
    const imageVersion = process.env["ImageVersion"];
    if (imageVersion) {
        statusReport.runner_image_version = imageVersion;
    }
    return statusReport;
}
exports.createStatusReportBase = createStatusReportBase;
const GENERIC_403_MSG = "The repo on which this action is running is not opted-in to CodeQL code scanning.";
const GENERIC_404_MSG = "Not authorized to use the CodeQL code scanning feature on this repo.";
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
    const statusReportJSON = JSON.stringify(statusReport);
    core.debug(`Sending status report: ${statusReportJSON}`);
    // If in test mode we don't want to upload the results
    if ((0, util_1.isInTestMode)()) {
        core.debug("In test mode. Status reports are not uploaded.");
        return true;
    }
    const nwo = (0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY");
    const [owner, repo] = nwo.split("/");
    const client = (0, api_client_1.getApiClient)();
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
        if ((0, util_1.isHTTPError)(e)) {
            switch (e.status) {
                case 403:
                    if ((0, actions_util_1.getWorkflowEventName)() === "push" &&
                        process.env["GITHUB_ACTOR"] === "dependabot[bot]") {
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
                    if ((0, util_1.getRequiredEnvParam)("GITHUB_SERVER_URL") !== util_1.GITHUB_DOTCOM_URL) {
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
//# sourceMappingURL=status-report.js.map