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
const github = __importStar(require("@actions/github"));
const console_log_level_1 = __importDefault(require("console-log-level"));
const util_1 = require("./util");
exports.getApiClient = function (githubAuth, githubApiUrl, allowLocalRun = false) {
    if (util_1.isLocalRun() && !allowLocalRun) {
        throw new Error('Invalid API call in local run');
    }
    return new github.GitHub({
        auth: parseAuth(githubAuth),
        baseUrl: githubApiUrl,
        userAgent: "CodeQL Action",
        log: console_log_level_1.default({ level: "debug" })
    });
};
// Parses the user input as either a single token,
// or a username and password / PAT.
function parseAuth(auth) {
    // Check if it's a username:password pair
    const c = auth.indexOf(':');
    if (c !== -1) {
        return 'basic ' + Buffer.from(auth).toString('base64');
    }
    // Otherwise use the token as it is
    return auth;
}
// Temporary function to aid in the transition to running on and off of github actions.
// Once all code has been coverted this function should be removed or made canonical
// and called only from the action entrypoints.
function getActionsApiClient(allowLocalRun = false) {
    return exports.getApiClient(core.getInput('token'), util_1.getRequiredEnvParam('GITHUB_API_URL'), allowLocalRun);
}
exports.getActionsApiClient = getActionsApiClient;
//# sourceMappingURL=api-client.js.map