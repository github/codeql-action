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
const init_1 = require("./init");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const util = __importStar(require("./util"));
async function sendSuccessStatusReport(startedAt, config) {
    const statusReportBase = await util.createStatusReportBase('init', 'success', startedAt);
    const languages = config.languages.join(',');
    const workflowLanguages = core.getInput('languages', { required: false });
    const paths = (config.originalUserInput.paths || []).join(',');
    const pathsIgnore = (config.originalUserInput['paths-ignore'] || []).join(',');
    const disableDefaultQueries = config.originalUserInput['disable-default-queries'] ? languages : '';
    const queries = (config.originalUserInput.queries || []).map(q => q.uses).join(',');
    const statusReport = {
        ...statusReportBase,
        languages: languages,
        workflow_languages: workflowLanguages,
        paths: paths,
        paths_ignore: pathsIgnore,
        disable_default_queries: disableDefaultQueries,
        queries: queries,
    };
    await util.sendStatusReport(statusReport);
}
async function run() {
    const startedAt = new Date();
    const logger = logging_1.getActionsLogger();
    let config;
    let codeql;
    try {
        util.prepareLocalRunEnvironment();
        if (!await util.sendStatusReport(await util.createStatusReportBase('init', 'starting', startedAt), true)) {
            return;
        }
        codeql = await init_1.initCodeQL(core.getInput('tools'), core.getInput('token'), util.getRequiredEnvParam('GITHUB_SERVER_URL'), util.getRequiredEnvParam('RUNNER_TEMP'), util.getRequiredEnvParam('RUNNER_TOOL_CACHE'), 'actions', logger);
        config = await init_1.initConfig(core.getInput('languages'), core.getInput('queries'), core.getInput('config-file'), repository_1.parseRepositoryNwo(util.getRequiredEnvParam('GITHUB_REPOSITORY')), util.getRequiredEnvParam('RUNNER_TEMP'), util.getRequiredEnvParam('RUNNER_TOOL_CACHE'), codeql, util.getRequiredEnvParam('GITHUB_WORKSPACE'), core.getInput('token'), util.getRequiredEnvParam('GITHUB_SERVER_URL'), logger);
    }
    catch (e) {
        core.setFailed(e.message);
        console.log(e);
        await util.sendStatusReport(await util.createStatusReportBase('init', 'aborted', startedAt, e.message));
        return;
    }
    try {
        // Forward Go flags
        const goFlags = process.env['GOFLAGS'];
        if (goFlags) {
            core.exportVariable('GOFLAGS', goFlags);
            core.warning("Passing the GOFLAGS env parameter to the init action is deprecated. Please move this to the analyze action.");
        }
        // Setup CODEQL_RAM flag (todo improve this https://github.com/github/dsp-code-scanning/issues/935)
        const codeqlRam = process.env['CODEQL_RAM'] || '6500';
        core.exportVariable('CODEQL_RAM', codeqlRam);
        const tracerConfig = await init_1.runInit(codeql, config);
        if (tracerConfig !== undefined) {
            Object.entries(tracerConfig.env).forEach(([key, value]) => core.exportVariable(key, value));
        }
    }
    catch (error) {
        core.setFailed(error.message);
        console.log(error);
        await util.sendStatusReport(await util.createStatusReportBase('init', 'failure', startedAt, error.message, error.stack));
        return;
    }
    await sendSuccessStatusReport(startedAt, config);
}
run().catch(e => {
    core.setFailed("init action failed: " + e);
    console.log(e);
});
//# sourceMappingURL=init-action.js.map