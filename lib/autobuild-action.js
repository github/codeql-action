"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
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
    var _a, _b;
    util_1.initializeEnvironment(util_1.Mode.actions, pkg.version);
    const status = failingLanguage !== undefined || cause !== undefined
        ? "failure"
        : "success";
    const statusReportBase = await actions_util_1.createStatusReportBase("autobuild", status, startedAt, (_a = cause) === null || _a === void 0 ? void 0 : _a.message, (_b = cause) === null || _b === void 0 ? void 0 : _b.stack);
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
        const config = await config_utils.getConfig(util_1.getTemporaryDirectory(), logger);
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