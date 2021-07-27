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
const autobuild_1 = require("./autobuild");
const config_utils = __importStar(require("./config-utils"));
const logging_1 = require("./logging");
const util_1 = require("./util");
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
async function sendCompletedStatusReport(startedAt, allLanguages, failingLanguage, cause) {
    util_1.initializeEnvironment(util_1.Mode.actions, pkg.version);
    const status = failingLanguage !== undefined || cause !== undefined
        ? "failure"
        : "success";
    const statusReportBase = await actions_util_1.createStatusReportBase("autobuild", status, startedAt, cause === null || cause === void 0 ? void 0 : cause.message, cause === null || cause === void 0 ? void 0 : cause.stack);
    const statusReport = {
        ...statusReportBase,
        autobuild_languages: allLanguages.join(","),
        autobuild_failure: failingLanguage,
    };
    await actions_util_1.sendStatusReport(statusReport);
}
async function run() {
    const logger = logging_1.getActionsLogger();
    const startedAt = new Date();
    let language = undefined;
    try {
        if (!(await actions_util_1.sendStatusReport(await actions_util_1.createStatusReportBase("autobuild", "starting", startedAt)))) {
            return;
        }
        const config = await config_utils.getConfig(actions_util_1.getTemporaryDirectory(), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        language = autobuild_1.determineAutobuildLanguage(config, logger);
        if (language !== undefined) {
            await autobuild_1.runAutobuild(language, config, logger);
        }
    }
    catch (error) {
        core.setFailed(`We were unable to automatically build your code. Please replace the call to the autobuild action with your custom build steps.  ${error.message}`);
        console.log(error);
        await sendCompletedStatusReport(startedAt, language ? [language] : [], language, error);
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