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
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const analysisPaths = __importStar(require("./analysis-paths"));
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const tracer_config_1 = require("./tracer-config");
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
    let config;
    let codeql;
    try {
        util.prepareLocalRunEnvironment();
        if (!await util.sendStatusReport(await util.createStatusReportBase('init', 'starting', startedAt), true)) {
            return;
        }
        core.startGroup('Setup CodeQL tools');
        codeql = await codeql_1.setupCodeQL();
        await codeql.printVersion();
        core.endGroup();
        core.startGroup('Load language configuration');
        config = await configUtils.initConfig(util.getRequiredEnvParam('RUNNER_TEMP'), util.getRequiredEnvParam('RUNNER_TOOL_CACHE'), codeql);
        analysisPaths.includeAndExcludeAnalysisPaths(config);
        core.endGroup();
    }
    catch (e) {
        core.setFailed(e.message);
        console.log(e);
        await util.sendStatusReport(await util.createStatusReportBase('init', 'aborted', startedAt, e.message));
        return;
    }
    try {
        const sourceRoot = path.resolve();
        // Forward Go flags
        const goFlags = process.env['GOFLAGS'];
        if (goFlags) {
            core.exportVariable('GOFLAGS', goFlags);
            core.warning("Passing the GOFLAGS env parameter to the init action is deprecated. Please move this to the analyze action.");
        }
        // Setup CODEQL_RAM flag (todo improve this https://github.com/github/dsp-code-scanning/issues/935)
        const codeqlRam = process.env['CODEQL_RAM'] || '6500';
        core.exportVariable('CODEQL_RAM', codeqlRam);
        fs.mkdirSync(util.getCodeQLDatabasesDir(config.tempDir), { recursive: true });
        // TODO: replace this code once CodeQL supports multi-language tracing
        for (let language of config.languages) {
            // Init language database
            await codeql.databaseInit(util.getCodeQLDatabasePath(config.tempDir, language), language, sourceRoot);
        }
        const tracerConfig = await tracer_config_1.getCombinedTracerConfig(config, codeql);
        if (tracerConfig !== undefined) {
            if (process.platform === 'win32') {
                await exec.exec('powershell', [
                    path.resolve(__dirname, '..', 'src', 'inject-tracer.ps1'),
                    path.resolve(path.dirname(codeql.getPath()), 'tools', 'win64', 'tracer.exe'),
                ], { env: { 'ODASA_TRACER_CONFIGURATION': tracerConfig.spec } });
            }
            // NB: in CLI mode these will be output to a file rather than exported with core.exportVariable
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
//# sourceMappingURL=setup-tracer.js.map