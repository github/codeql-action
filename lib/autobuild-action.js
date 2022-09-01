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
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const actions_util_1 = require("./actions-util");
const api_client_1 = require("./api-client");
const autobuild_1 = require("./autobuild");
const configUtils = __importStar(require("./config-utils"));
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const util_1 = require("./util");
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
async function sendCompletedStatusReport(startedAt, allLanguages, failingLanguage, cause) {
    (0, util_1.initializeEnvironment)(util_1.Mode.actions, pkg.version);
    const status = (0, actions_util_1.getActionsStatus)(cause, failingLanguage);
    const statusReportBase = await (0, actions_util_1.createStatusReportBase)("autobuild", status, startedAt, cause === null || cause === void 0 ? void 0 : cause.message, cause === null || cause === void 0 ? void 0 : cause.stack);
    const statusReport = {
        ...statusReportBase,
        autobuild_languages: allLanguages.join(","),
        autobuild_failure: failingLanguage,
    };
    await (0, actions_util_1.sendStatusReport)(statusReport);
}
async function run() {
    const startedAt = new Date();
    const logger = (0, logging_1.getActionsLogger)();
    await (0, util_1.checkActionVersion)(pkg.version);
    let language = undefined;
    try {
        if (!(await (0, actions_util_1.sendStatusReport)(await (0, actions_util_1.createStatusReportBase)("autobuild", "starting", startedAt)))) {
            return;
        }
        const apiDetails = {
            auth: (0, actions_util_1.getRequiredInput)("token"),
            externalRepoAuth: (0, actions_util_1.getOptionalInput)("external-repository-token"),
            url: (0, util_1.getRequiredEnvParam)("GITHUB_SERVER_URL"),
            apiURL: (0, util_1.getRequiredEnvParam)("GITHUB_API_URL"),
        };
        const gitHubVersion = await (0, api_client_1.getGitHubVersionActionsOnly)();
        (0, util_1.checkGitHubVersionInRange)(gitHubVersion, logger, util_1.Mode.actions);
        const repositoryNwo = (0, repository_1.parseRepositoryNwo)((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY"));
        const featureFlags = new feature_flags_1.GitHubFeatureFlags(gitHubVersion, apiDetails, repositoryNwo, logger);
        const config = await configUtils.getConfig((0, actions_util_1.getTemporaryDirectory)(), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        language = await (0, autobuild_1.determineAutobuildLanguage)(config, featureFlags, logger);
        if (language !== undefined) {
            const workingDirectory = (0, actions_util_1.getOptionalInput)("working-directory");
            if (workingDirectory) {
                logger.info(`Changing autobuilder working directory to ${workingDirectory}`);
                process.chdir(workingDirectory);
            }
            await (0, autobuild_1.runAutobuild)(language, config, logger);
            if (language === languages_1.Language.go) {
                core.exportVariable("CODEQL_ACTION_DID_AUTOBUILD_GOLANG", "true");
            }
        }
    }
    catch (error) {
        core.setFailed(`We were unable to automatically build your code. Please replace the call to the autobuild action with your custom build steps.  ${error instanceof Error ? error.message : String(error)}`);
        console.log(error);
        await sendCompletedStatusReport(startedAt, language ? [language] : [], language, error instanceof Error ? error : new Error(String(error)));
        return;
    }
    await sendCompletedStatusReport(startedAt, language ? [language] : []);
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`autobuild action failed. ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=autobuild-action.js.map