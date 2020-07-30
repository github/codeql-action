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
const codeql_1 = require("./codeql");
const sharedEnv = __importStar(require("./shared-environment"));
const util = __importStar(require("./util"));
async function sendCompletedStatusReport(startedAt, allLanguages, failingLanguage, cause) {
    var _a, _b;
    const status = failingLanguage !== undefined || cause !== undefined ? 'failure' : 'success';
    const statusReportBase = await util.createStatusReportBase('autobuild', status, startedAt, (_a = cause) === null || _a === void 0 ? void 0 : _a.message, (_b = cause) === null || _b === void 0 ? void 0 : _b.stack);
    const statusReport = {
        ...statusReportBase,
        autobuild_languages: allLanguages.join(','),
        autobuild_failure: failingLanguage,
    };
    await util.sendStatusReport(statusReport);
}
async function run() {
    var _a;
    const startedAt = new Date();
    let language;
    try {
        if (util.should_abort('autobuild', true) ||
            !await util.sendStatusReport(await util.createStatusReportBase('autobuild', 'starting', startedAt), true)) {
            return;
        }
        // Attempt to find a language to autobuild
        // We want pick the dominant language in the repo from the ones we're able to build
        // The languages are sorted in order specified by user or by lines of code if we got
        // them from the GitHub API, so try to build the first language on the list.
        const autobuildLanguages = ((_a = process.env[sharedEnv.CODEQL_ACTION_TRACED_LANGUAGES]) === null || _a === void 0 ? void 0 : _a.split(',')) || [];
        language = autobuildLanguages[0];
        if (!language) {
            core.info("None of the languages in this project require extra build steps");
            return;
        }
        core.debug(`Detected dominant traced language: ${language}`);
        if (autobuildLanguages.length > 1) {
            core.warning(`We will only automatically build ${language} code. If you wish to scan ${autobuildLanguages.slice(1).join(' and ')}, you must replace this block with custom build steps.`);
        }
        core.startGroup(`Attempting to automatically build ${language} code`);
        const codeQL = codeql_1.getCodeQL();
        await codeQL.runAutobuild(language);
        core.endGroup();
    }
    catch (error) {
        core.setFailed("We were unable to automatically build your code. Please replace the call to the autobuild action with your custom build steps.  " + error.message);
        await sendCompletedStatusReport(startedAt, [language], language, error);
        return;
    }
    await sendCompletedStatusReport(startedAt, [language]);
}
run().catch(e => {
    core.setFailed("autobuild action failed.  " + e);
    console.log(e);
});
//# sourceMappingURL=autobuild.js.map