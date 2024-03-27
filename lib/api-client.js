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
exports.computeAutomationID = exports.getAutomationID = exports.getAnalysisKey = exports.getWorkflowRelativePath = exports.getGitHubVersion = exports.getGitHubVersionFromApi = exports.getApiClientWithExternalAuth = exports.getApiClient = exports.getApiDetails = exports.DisallowedAPIVersionReason = void 0;
const core = __importStar(require("@actions/core"));
const githubUtils = __importStar(require("@actions/github/lib/utils"));
const retry = __importStar(require("@octokit/plugin-retry"));
const console_log_level_1 = __importDefault(require("console-log-level"));
const actions_util_1 = require("./actions-util");
const util_1 = require("./util");
const GITHUB_ENTERPRISE_VERSION_HEADER = "x-github-enterprise-version";
var DisallowedAPIVersionReason;
(function (DisallowedAPIVersionReason) {
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_OLD"] = 0] = "ACTION_TOO_OLD";
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_NEW"] = 1] = "ACTION_TOO_NEW";
})(DisallowedAPIVersionReason || (exports.DisallowedAPIVersionReason = DisallowedAPIVersionReason = {}));
function createApiClientWithDetails(apiDetails, { allowExternal = false } = {}) {
    const auth = (allowExternal && apiDetails.externalRepoAuth) || apiDetails.auth;
    const retryingOctokit = githubUtils.GitHub.plugin(retry.retry);
    return new retryingOctokit(githubUtils.getOctokitOptions(auth, {
        baseUrl: apiDetails.apiURL,
        userAgent: `CodeQL-Action/${(0, actions_util_1.getActionVersion)()}`,
        log: (0, console_log_level_1.default)({ level: "debug" }),
    }));
}
function getApiDetails() {
    return {
        auth: (0, actions_util_1.getRequiredInput)("token"),
        url: (0, util_1.getRequiredEnvParam)("GITHUB_SERVER_URL"),
        apiURL: (0, util_1.getRequiredEnvParam)("GITHUB_API_URL"),
    };
}
exports.getApiDetails = getApiDetails;
function getApiClient() {
    return createApiClientWithDetails(getApiDetails());
}
exports.getApiClient = getApiClient;
function getApiClientWithExternalAuth(apiDetails) {
    return createApiClientWithDetails(apiDetails, { allowExternal: true });
}
exports.getApiClientWithExternalAuth = getApiClientWithExternalAuth;
let cachedGitHubVersion = undefined;
async function getGitHubVersionFromApi(apiClient, apiDetails) {
    // We can avoid making an API request in the standard dotcom case
    if ((0, util_1.parseGitHubUrl)(apiDetails.url) === util_1.GITHUB_DOTCOM_URL) {
        return { type: util_1.GitHubVariant.DOTCOM };
    }
    // Doesn't strictly have to be the meta endpoint as we're only
    // using the response headers which are available on every request.
    const response = await apiClient.rest.meta.get();
    // This happens on dotcom, although we expect to have already returned in that
    // case. This can also serve as a fallback in cases we haven't foreseen.
    if (response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === undefined) {
        return { type: util_1.GitHubVariant.DOTCOM };
    }
    if (response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === "ghe.com") {
        return { type: util_1.GitHubVariant.GHE_DOTCOM };
    }
    const version = response.headers[GITHUB_ENTERPRISE_VERSION_HEADER];
    return { type: util_1.GitHubVariant.GHES, version };
}
exports.getGitHubVersionFromApi = getGitHubVersionFromApi;
/**
 * Report the GitHub server version. This is a wrapper around
 * util.getGitHubVersion() that automatically supplies GitHub API details using
 * GitHub Action inputs.
 *
 * @returns GitHub version
 */
async function getGitHubVersion() {
    if (cachedGitHubVersion === undefined) {
        cachedGitHubVersion = await getGitHubVersionFromApi(getApiClient(), getApiDetails());
    }
    return cachedGitHubVersion;
}
exports.getGitHubVersion = getGitHubVersion;
/**
 * Get the path of the currently executing workflow relative to the repository root.
 */
async function getWorkflowRelativePath() {
    const workflow_ref = process.env["GITHUB_WORKFLOW_REF"];
    // When GHES 3.8 support is removed, this if guard and its corresponding
    // fallback code can be removed.
    if (workflow_ref !== undefined) {
        const workflowRegExp = new RegExp("^[^/]+/[^/]+/(.*?)@.*");
        const match = workflow_ref.match(workflowRegExp);
        if (match) {
            return new Promise((resolve) => {
                resolve(match[1]);
            });
        }
    }
    const repo_nwo = (0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY").split("/");
    const owner = repo_nwo[0];
    const repo = repo_nwo[1];
    const run_id = Number((0, util_1.getRequiredEnvParam)("GITHUB_RUN_ID"));
    const apiClient = getApiClient();
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
 * Get the analysis key parameter for the current job.
 *
 * This will combine the workflow path and current job name.
 * Computing this the first time requires making requests to
 * the GitHub API, but after that the result will be cached.
 */
async function getAnalysisKey() {
    const analysisKeyEnvVar = "CODEQL_ACTION_ANALYSIS_KEY";
    let analysisKey = process.env[analysisKeyEnvVar];
    if (analysisKey !== undefined) {
        return analysisKey;
    }
    const workflowPath = await getWorkflowRelativePath();
    const jobName = (0, util_1.getRequiredEnvParam)("GITHUB_JOB");
    analysisKey = `${workflowPath}:${jobName}`;
    core.exportVariable(analysisKeyEnvVar, analysisKey);
    return analysisKey;
}
exports.getAnalysisKey = getAnalysisKey;
async function getAutomationID() {
    const analysis_key = await getAnalysisKey();
    const environment = (0, actions_util_1.getRequiredInput)("matrix");
    return computeAutomationID(analysis_key, environment);
}
exports.getAutomationID = getAutomationID;
function computeAutomationID(analysis_key, environment) {
    let automationID = `${analysis_key}/`;
    const matrix = (0, util_1.parseMatrixInput)(environment);
    if (matrix !== undefined) {
        // the id has to be deterministic so we sort the fields
        for (const entry of Object.entries(matrix).sort()) {
            if (typeof entry[1] === "string") {
                automationID += `${entry[0]}:${entry[1]}/`;
            }
            else {
                // In code scanning we just handle the string values,
                // the rest get converted to the empty string
                automationID += `${entry[0]}:/`;
            }
        }
    }
    return automationID;
}
exports.computeAutomationID = computeAutomationID;
//# sourceMappingURL=api-client.js.map