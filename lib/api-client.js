"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
exports.getGitHubVersion = exports.getApiClientWithExternalAuth = exports.getApiClient = exports.getApiDetails = exports.DisallowedAPIVersionReason = void 0;
const githubUtils = __importStar(require("@actions/github/lib/utils"));
const retry = __importStar(require("@octokit/plugin-retry"));
const console_log_level_1 = __importDefault(require("console-log-level"));
const actions_util_1 = require("./actions-util");
const util = __importStar(require("./util"));
const util_1 = require("./util");
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
var DisallowedAPIVersionReason;
(function (DisallowedAPIVersionReason) {
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_OLD"] = 0] = "ACTION_TOO_OLD";
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_NEW"] = 1] = "ACTION_TOO_NEW";
})(DisallowedAPIVersionReason = exports.DisallowedAPIVersionReason || (exports.DisallowedAPIVersionReason = {}));
function createApiClientWithDetails(apiDetails, { allowExternal = false } = {}) {
    const auth = (allowExternal && apiDetails.externalRepoAuth) || apiDetails.auth;
    const retryingOctokit = githubUtils.GitHub.plugin(retry.retry);
    return new retryingOctokit(githubUtils.getOctokitOptions(auth, {
        baseUrl: apiDetails.apiURL,
        userAgent: `CodeQL-Action/${pkg.version}`,
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
/**
 * Report the GitHub server version. This is a wrapper around
 * util.getGitHubVersion() that automatically supplies GitHub API details using
 * GitHub Action inputs.
 *
 * @returns GitHub version
 */
async function getGitHubVersion() {
    if (cachedGitHubVersion === undefined) {
        cachedGitHubVersion = await util.getGitHubVersion(getApiDetails());
    }
    return cachedGitHubVersion;
}
exports.getGitHubVersion = getGitHubVersion;
//# sourceMappingURL=api-client.js.map