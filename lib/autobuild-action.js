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
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const util_1 = require("./util");
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
async function sendCompletedStatusReport(startedAt, allLanguages, failingLanguage, cause) {
    (0, util_1.initializeEnvironment)(pkg.version);
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
    let currentLanguage = undefined;
    let languages = undefined;
    try {
        if (!(await (0, actions_util_1.sendStatusReport)(await (0, actions_util_1.createStatusReportBase)("autobuild", "starting", startedAt)))) {
            return;
        }
        const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
        (0, util_1.checkGitHubVersionInRange)(gitHubVersion, logger);
        const config = await configUtils.getConfig((0, actions_util_1.getTemporaryDirectory)(), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        languages = await (0, autobuild_1.determineAutobuildLanguages)(config, logger);
        if (languages !== undefined) {
            const workingDirectory = (0, actions_util_1.getOptionalInput)("working-directory");
            if (workingDirectory) {
                logger.info(`Changing autobuilder working directory to ${workingDirectory}`);
                process.chdir(workingDirectory);
            }
            for (const language of languages) {
                currentLanguage = language;
                await (0, autobuild_1.runAutobuild)(language, config, logger);
                if (language === languages_1.Language.go) {
                    core.exportVariable(util_1.DID_AUTOBUILD_GO_ENV_VAR_NAME, "true");
                }
            }
        }
    }
    catch (error) {
        core.setFailed(`We were unable to automatically build your code. Please replace the call to the autobuild action with your custom build steps.  ${error instanceof Error ? error.message : String(error)}`);
        console.log(error);
        await sendCompletedStatusReport(startedAt, languages !== null && languages !== void 0 ? languages : [], currentLanguage, error instanceof Error ? error : new Error(String(error)));
        return;
    }
    await sendCompletedStatusReport(startedAt, languages !== null && languages !== void 0 ? languages : []);
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