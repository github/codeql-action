"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const toolrunnner = __importStar(require("@actions/exec/lib/toolrunner"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const analysisPaths = __importStar(require("./analysis-paths"));
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const tracer_config_1 = require("./tracer-config");
const util = __importStar(require("./util"));
async function initCodeQL(codeqlURL, githubAuth, githubUrl, tempDir, toolsDir, mode, logger) {
    logger.startGroup('Setup CodeQL tools');
    const codeql = await codeql_1.setupCodeQL(codeqlURL, githubAuth, githubUrl, tempDir, toolsDir, mode, logger);
    await codeql.printVersion();
    logger.endGroup();
    return codeql;
}
exports.initCodeQL = initCodeQL;
async function initConfig(languagesInput, queriesInput, configFile, repository, tempDir, toolCacheDir, codeQL, checkoutPath, githubAuth, githubUrl, logger) {
    logger.startGroup('Load language configuration');
    const config = await configUtils.initConfig(languagesInput, queriesInput, configFile, repository, tempDir, toolCacheDir, codeQL, checkoutPath, githubAuth, githubUrl, logger);
    analysisPaths.printPathFiltersWarning(config, logger);
    logger.endGroup();
    return config;
}
exports.initConfig = initConfig;
async function runInit(codeql, config) {
    const sourceRoot = path.resolve();
    fs.mkdirSync(util.getCodeQLDatabasesDir(config.tempDir), { recursive: true });
    // TODO: replace this code once CodeQL supports multi-language tracing
    for (let language of config.languages) {
        // Init language database
        await codeql.databaseInit(util.getCodeQLDatabasePath(config.tempDir, language), language, sourceRoot);
    }
    const tracerConfig = await tracer_config_1.getCombinedTracerConfig(config, codeql);
    if (tracerConfig !== undefined && process.platform === 'win32') {
        const injectTracerPath = path.join(config.tempDir, 'inject-tracer.ps1');
        fs.writeFileSync(injectTracerPath, `
      Param(
          [Parameter(Position=0)]
          [String]
          $tracer
      )
      Get-Process -Name Runner.Worker
      $process=Get-Process -Name Runner.Worker
      $id=$process.Id
      Invoke-Expression "&$tracer --inject=$id"`);
        await new toolrunnner.ToolRunner('powershell', [
            injectTracerPath,
            path.resolve(path.dirname(codeql.getPath()), 'tools', 'win64', 'tracer.exe'),
        ], { env: { 'ODASA_TRACER_CONFIGURATION': tracerConfig.spec } }).exec();
    }
    return tracerConfig;
}
exports.runInit = runInit;
//# sourceMappingURL=init.js.map