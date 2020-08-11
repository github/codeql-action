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
const util = __importStar(require("./util"));
const CRITICAL_TRACER_VARS = new Set(['SEMMLE_PRELOAD_libtrace',
    ,
    'SEMMLE_RUNNER',
    ,
    'SEMMLE_COPY_EXECUTABLES_ROOT',
    ,
    'SEMMLE_DEPTRACE_SOCKET',
    ,
    'SEMMLE_JAVA_TOOL_OPTIONS'
]);
async function tracerConfig(codeql, database, compilerSpec) {
    const env = await codeql.getTracerEnv(database, compilerSpec);
    const config = env['ODASA_TRACER_CONFIGURATION'];
    const info = { spec: config, env: {} };
    // Extract critical tracer variables from the environment
    for (let entry of Object.entries(env)) {
        const key = entry[0];
        const value = entry[1];
        // skip ODASA_TRACER_CONFIGURATION as it is handled separately
        if (key === 'ODASA_TRACER_CONFIGURATION') {
            continue;
        }
        // skip undefined values
        if (typeof value === 'undefined') {
            continue;
        }
        // Keep variables that do not exist in current environment. In addition always keep
        // critical and CODEQL_ variables
        if (typeof process.env[key] === 'undefined' || CRITICAL_TRACER_VARS.has(key) || key.startsWith('CODEQL_')) {
            info.env[key] = value;
        }
    }
    return info;
}
function concatTracerConfigs(configs) {
    // A tracer config is a map containing additional environment variables and a tracer 'spec' file.
    // A tracer 'spec' file has the following format [log_file, number_of_blocks, blocks_text]
    // Merge the environments
    const env = {};
    let copyExecutables = false;
    let envSize = 0;
    for (const v of configs) {
        for (let e of Object.entries(v.env)) {
            const name = e[0];
            const value = e[1];
            // skip SEMMLE_COPY_EXECUTABLES_ROOT as it is handled separately
            if (name === 'SEMMLE_COPY_EXECUTABLES_ROOT') {
                copyExecutables = true;
            }
            else if (name in env) {
                if (env[name] !== value) {
                    throw Error('Incompatible values in environment parameter ' +
                        name + ': ' + env[name] + ' and ' + value);
                }
            }
            else {
                env[name] = value;
                envSize += 1;
            }
        }
    }
    // Concatenate spec files into a new spec file
    let languages = Object.keys(configs);
    const cppIndex = languages.indexOf('cpp');
    // Make sure cpp is the last language, if it's present since it must be concatenated last
    if (cppIndex !== -1) {
        let lastLang = languages[languages.length - 1];
        languages[languages.length - 1] = languages[cppIndex];
        languages[cppIndex] = lastLang;
    }
    let totalLines = [];
    let totalCount = 0;
    for (let lang of languages) {
        const lines = fs.readFileSync(configs[lang].spec, 'utf8').split(/\r?\n/);
        const count = parseInt(lines[1], 10);
        totalCount += count;
        totalLines.push(...lines.slice(2));
    }
    const tempFolder = util.getRequiredEnvParam('RUNNER_TEMP');
    const newLogFilePath = path.resolve(tempFolder, 'compound-build-tracer.log');
    const spec = path.resolve(tempFolder, 'compound-spec');
    const compoundTempFolder = path.resolve(tempFolder, 'compound-temp');
    const newSpecContent = [newLogFilePath, totalCount.toString(10), ...totalLines];
    if (copyExecutables) {
        env['SEMMLE_COPY_EXECUTABLES_ROOT'] = compoundTempFolder;
        envSize += 1;
    }
    fs.writeFileSync(spec, newSpecContent.join('\n'));
    // Prepare the content of the compound environment file
    let buffer = Buffer.alloc(4);
    buffer.writeInt32LE(envSize, 0);
    for (let e of Object.entries(env)) {
        const key = e[0];
        const value = e[1];
        const lineBuffer = new Buffer(key + '=' + value + '\0', 'utf8');
        const sizeBuffer = Buffer.alloc(4);
        sizeBuffer.writeInt32LE(lineBuffer.length, 0);
        buffer = Buffer.concat([buffer, sizeBuffer, lineBuffer]);
    }
    // Write the compound environment
    const envPath = spec + '.environment';
    fs.writeFileSync(envPath, buffer);
    return { env, spec };
}
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
    core.warning('Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam mattis sit amet neque vitae ullamcorper. Et esse qui ipsa dignissimos ut voluptatibus sed nesciunt. Aliquam exercitationem sit commodi est. Dolores at in autem laudantium exercitationem ut aliquam quis.\nDignissimos et dolore dolorem cumque quis. Et porro velit sit temporibus. Similique tempora sed illo. Alias iure nihil laudantium.');
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
        config = await configUtils.initConfig();
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
        const databaseFolder = util.getCodeQLDatabasesDir();
        fs.mkdirSync(databaseFolder, { recursive: true });
        let tracedLanguageConfigs = [];
        // TODO: replace this code once CodeQL supports multi-language tracing
        for (let language of config.languages) {
            const languageDatabase = path.join(databaseFolder, language);
            // Init language database
            await codeql.databaseInit(languageDatabase, language, sourceRoot);
            // TODO: add better detection of 'traced languages' instead of using a hard coded list
            if (codeql_1.isTracedLanguage(language)) {
                const config = await tracerConfig(codeql, languageDatabase);
                tracedLanguageConfigs.push(config);
            }
        }
        if (tracedLanguageConfigs.length > 0) {
            const mainTracerConfig = concatTracerConfigs(tracedLanguageConfigs);
            if (mainTracerConfig.spec) {
                for (let entry of Object.entries(mainTracerConfig.env)) {
                    core.exportVariable(entry[0], entry[1]);
                }
                core.exportVariable('ODASA_TRACER_CONFIGURATION', mainTracerConfig.spec);
                if (process.platform === 'darwin') {
                    core.exportVariable('DYLD_INSERT_LIBRARIES', path.join(codeql.getDir(), 'tools', 'osx64', 'libtrace.dylib'));
                }
                else if (process.platform === 'win32') {
                    await exec.exec('powershell', [
                        path.resolve(__dirname, '..', 'src', 'inject-tracer.ps1'),
                        path.resolve(codeql.getDir(), 'tools', 'win64', 'tracer.exe'),
                    ], { env: { 'ODASA_TRACER_CONFIGURATION': mainTracerConfig.spec } });
                }
                else {
                    core.exportVariable('LD_PRELOAD', path.join(codeql.getDir(), 'tools', 'linux64', '${LIB}trace.so'));
                }
            }
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