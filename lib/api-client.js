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
exports.getGitHubVersionActionsOnly = exports.getActionsApiClient = exports.getApiClient = exports.DisallowedAPIVersionReason = void 0;
const path = __importStar(require("path"));
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
const getApiClient = function (apiDetails, { allowExternal = false } = {}) {
    const auth = (allowExternal && apiDetails.externalRepoAuth) || apiDetails.auth;
    const retryingOctokit = githubUtils.GitHub.plugin(retry.retry);
    let apiURL = apiDetails.apiURL;
    if (!apiURL) {
        apiURL = deriveApiUrl(apiDetails.url);
    }
    return new retryingOctokit(githubUtils.getOctokitOptions(auth, {
        baseUrl: apiURL,
        userAgent: `CodeQL-${(0, util_1.getMode)()}/${pkg.version}`,
        log: (0, console_log_level_1.default)({ level: "debug" }),
    }));
};
exports.getApiClient = getApiClient;
// Once the runner is deleted, this can also be removed since the GitHub API URL is always available in an environment variable on Actions.
function deriveApiUrl(githubUrl) {
    const url = new URL(githubUrl);
    // If we detect this is trying to connect to github.com
    // then return with a fixed canonical URL.
    if (url.hostname === "github.com" || url.hostname === "api.github.com") {
        return "https://api.github.com";
    }
    // Add the /api/v3 API prefix
    url.pathname = path.join(url.pathname, "api", "v3");
    return url.toString();
}
function getApiDetails() {
    return {
        auth: (0, actions_util_1.getRequiredInput)("token"),
        url: (0, util_1.getRequiredEnvParam)("GITHUB_SERVER_URL"),
        apiURL: (0, util_1.getRequiredEnvParam)("GITHUB_API_URL"),
    };
}
// Temporary function to aid in the transition to running on and off of github actions.
// Once all code has been converted this function should be removed or made canonical
// and called only from the action entrypoints.
function getActionsApiClient() {
    return (0, exports.getApiClient)(getApiDetails());
}
exports.getActionsApiClient = getActionsApiClient;
let cachedGitHubVersion = undefined;
/**
 * Report the GitHub server version. This is a wrapper around
 * util.getGitHubVersion() that automatically supplies GitHub API details using
 * GitHub Action inputs. If you need to get the GitHub server version from the
 * Runner, please call util.getGitHubVersion() instead.
 *
 * @returns GitHub version
 */
async function getGitHubVersionActionsOnly() {
    if (!util.isActions()) {
        throw new Error("getGitHubVersionActionsOnly() works only in an action");
    }
    if (cachedGitHubVersion === undefined) {
        cachedGitHubVersion = await util.getGitHubVersion(getApiDetails());
    }
    return cachedGitHubVersion;
}
exports.getGitHubVersionActionsOnly = getGitHubVersionActionsOnly;
//# sourceMappingURL=api-client.js.map