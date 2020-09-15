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
const github = __importStar(require("@actions/github"));
const console_log_level_1 = __importDefault(require("console-log-level"));
const path = __importStar(require("path"));
const actions_util_1 = require("./actions-util");
const util_1 = require("./util");
exports.getApiClient = function (githubAuth, githubUrl, allowLocalRun = false) {
    if (util_1.isLocalRun() && !allowLocalRun) {
        throw new Error("Invalid API call in local run");
    }
    return new github.GitHub({
        auth: githubAuth,
        baseUrl: getApiUrl(githubUrl),
        userAgent: "CodeQL Action",
        log: console_log_level_1.default({ level: "debug" }),
    });
};
function getApiUrl(githubUrl) {
    const url = new URL(githubUrl);
    // If we detect this is trying to be to github.com
    // then return with a fixed canonical URL.
    if (url.hostname === "github.com" || url.hostname === "api.github.com") {
        return "https://api.github.com";
    }
    // Add the /api/v3 API prefix
    url.pathname = path.join(url.pathname, "api", "v3");
    return url.toString();
}
// Temporary function to aid in the transition to running on and off of github actions.
// Once all code has been coverted this function should be removed or made canonical
// and called only from the action entrypoints.
function getActionsApiClient(allowLocalRun = false) {
    return exports.getApiClient(actions_util_1.getRequiredInput("token"), actions_util_1.getRequiredEnvParam("GITHUB_SERVER_URL"), allowLocalRun);
}
exports.getActionsApiClient = getActionsApiClient;
//# sourceMappingURL=api-client.js.map