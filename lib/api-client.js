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
exports.getActionsApiClient = exports.getApiClient = exports.DisallowedAPIVersionReason = void 0;
const path = __importStar(require("path"));
const githubUtils = __importStar(require("@actions/github/lib/utils"));
const console_log_level_1 = __importDefault(require("console-log-level"));
const actions_util_1 = require("./actions-util");
const util_1 = require("./util");
var DisallowedAPIVersionReason;
(function (DisallowedAPIVersionReason) {
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_OLD"] = 0] = "ACTION_TOO_OLD";
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_NEW"] = 1] = "ACTION_TOO_NEW";
})(DisallowedAPIVersionReason = exports.DisallowedAPIVersionReason || (exports.DisallowedAPIVersionReason = {}));
const getApiClient = function (apiDetails, allowLocalRun = false) {
    if (util_1.isLocalRun() && !allowLocalRun) {
        throw new Error("Invalid API call in local run");
    }
    return new githubUtils.GitHub(githubUtils.getOctokitOptions(apiDetails.auth, {
        baseUrl: getApiUrl(apiDetails.url),
        userAgent: "CodeQL Action",
        log: console_log_level_1.default({ level: "debug" }),
    }));
};
exports.getApiClient = getApiClient;
function getApiUrl(githubUrl) {
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
// Temporary function to aid in the transition to running on and off of github actions.
// Once all code has been converted this function should be removed or made canonical
// and called only from the action entrypoints.
function getActionsApiClient(allowLocalRun = false) {
    const apiDetails = {
        auth: actions_util_1.getRequiredInput("token"),
        url: actions_util_1.getRequiredEnvParam("GITHUB_SERVER_URL"),
    };
    return exports.getApiClient(apiDetails, allowLocalRun);
}
exports.getActionsApiClient = getActionsApiClient;
//# sourceMappingURL=api-client.js.map