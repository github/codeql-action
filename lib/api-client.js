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
const path = __importStar(require("path"));
const core_1 = require("@actions/core");
const githubUtils = __importStar(require("@actions/github/lib/utils"));
const retry = __importStar(require("@octokit/plugin-retry"));
const console_log_level_1 = __importDefault(require("console-log-level"));
const semver = __importStar(require("semver"));
const actions_util_1 = require("./actions-util");
const apiCompatibility = __importStar(require("./api-compatibility.json"));
const logging_1 = require("./logging");
const util_1 = require("./util");
var DisallowedAPIVersionReason;
(function (DisallowedAPIVersionReason) {
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_OLD"] = 0] = "ACTION_TOO_OLD";
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_NEW"] = 1] = "ACTION_TOO_NEW";
})(DisallowedAPIVersionReason = exports.DisallowedAPIVersionReason || (exports.DisallowedAPIVersionReason = {}));
const GITHUB_ENTERPRISE_VERSION_HEADER = "x-github-enterprise-version";
const CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR = "CODEQL_ACTION_WARNED_ABOUT_VERSION";
let hasBeenWarnedAboutVersion = false;
exports.getApiClient = function (apiDetails, mode, logger, allowLocalRun = false, possibleFailureExpected = false) {
    if (util_1.isLocalRun() && !allowLocalRun) {
        throw new Error("Invalid API call in local run");
    }
    const customOctokit = githubUtils.GitHub.plugin(retry.retry, (octokit, _) => {
        octokit.hook.after("request", (response, __) => {
            if (response.status < 400 && !possibleFailureExpected) {
                if (hasBeenWarnedAboutVersion) {
                    return;
                }
            }
            if (response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === undefined ||
                process.env[CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR] === undefined) {
                return;
            }
            const installedVersion = response.headers[GITHUB_ENTERPRISE_VERSION_HEADER];
            const disallowedAPIVersionReason = apiVersionInRange(installedVersion, apiCompatibility.minimumVersion, apiCompatibility.maximumVersion);
            const toolName = mode === "actions" ? "Action" : "Runner";
            if (disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_OLD) {
                logger.warning(`The CodeQL ${toolName} version you are using is too old to be compatible with GitHub Enterprise ${installedVersion}. If you experience issues, please upgrade to a more recent version of the CodeQL ${toolName}.`);
            }
            if (disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_NEW) {
                logger.warning(`GitHub Enterprise ${installedVersion} is too old to be compatible with this version of the CodeQL ${toolName}. If you experience issues, please upgrade to a more recent version of GitHub Enterprise or use an older version of the CodeQL ${toolName}.`);
            }
            hasBeenWarnedAboutVersion = true;
            if (mode === "actions") {
                core_1.exportVariable(CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR, true);
            }
        });
    });
    return new customOctokit(githubUtils.getOctokitOptions(apiDetails.auth, {
        baseUrl: getApiUrl(apiDetails.url),
        userAgent: "CodeQL Action",
        log: console_log_level_1.default({ level: "debug" }),
    }));
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
// Once all code has been converted this function should be removed or made canonical
// and called only from the action entrypoints.
function getActionsApiClient(allowLocalRun = false) {
    const apiDetails = {
        auth: actions_util_1.getRequiredInput("token"),
        url: actions_util_1.getRequiredEnvParam("GITHUB_SERVER_URL"),
    };
    return exports.getApiClient(apiDetails, "actions", logging_1.getActionsLogger(), allowLocalRun);
}
exports.getActionsApiClient = getActionsApiClient;
function apiVersionInRange(version, minimumVersion, maximumVersion) {
    if (!semver.satisfies(version, `>=${minimumVersion}`)) {
        return DisallowedAPIVersionReason.ACTION_TOO_NEW;
    }
    if (!semver.satisfies(version, `<=${maximumVersion}`)) {
        return DisallowedAPIVersionReason.ACTION_TOO_OLD;
    }
    return undefined;
}
exports.apiVersionInRange = apiVersionInRange;
//# sourceMappingURL=api-client.js.map