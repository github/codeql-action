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
async function runInit(codeql, config, mode) {
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
        if (mode === 'actions') {
            fs.writeFileSync(injectTracerPath, `
        Param(
            [Parameter(Position=0)]
            [String]
            $tracer
        )

        # Go up the process tree until finding an ancestor called "Runner.Worker.exe"
        # A new Runner.Worker is spawned for each job. It is spawned by a process
        # called Runner.Listener that persists for the life of the worker.
        $id = $PID
        while ($true) {
          $p = Get-CimInstance -Class Win32_Process -Filter "ProcessId = $id"
          Write-Host "Found process: $p"
          if ($p -eq $null) {
            throw "Could not determine Runner.Worker.exe process"
          }
          if ($p[0].Name -eq "Runner.Worker.exe") {
            Break
          } else {
            $id = $p[0].ParentProcessId
          }
        }

        Invoke-Expression "&$tracer --inject=$id"`);
        }
        else {
            fs.writeFileSync(injectTracerPath, `
        Param(
            [Parameter(Position=0)]
            [String]
            $tracer
        )

        # The current process.
        $id0 = $PID
        $p0 = Get-CimInstance -Class Win32_Process -Filter "ProcessId = $id0"
        Write-Host "Found process: $p0"

        # The 1st parent process will be the runner proces.
        $id1 = $p0[0].ParentProcessId
        $p1 = Get-CimInstance -Class Win32_Process -Filter "ProcessId = $id1"
        Write-Host "Found process: $p1"

        # The 2nd parent process (i.e. the parent of the runner process)
        $id2 = $p1[0].ParentProcessId
        $p2 = Get-CimInstance -Class Win32_Process -Filter "ProcessId = $id2"
        Write-Host "Found process: $p2"

        # Assume the second parent will persist and later also spawn the build process.
        # This is a total guess but is the best we can do in the absence of any
        # information about what system is invoking us.
        Invoke-Expression "&$tracer --inject=$id"`);
        }
        await new toolrunnner.ToolRunner('powershell', [
            '-ExecutionPolicy', 'Bypass',
            '-file', injectTracerPath,
            path.resolve(path.dirname(codeql.getPath()), 'tools', 'win64', 'tracer.exe'),
        ], { env: { 'ODASA_TRACER_CONFIGURATION': tracerConfig.spec } }).exec();
    }
    return tracerConfig;
}
exports.runInit = runInit;
//# sourceMappingURL=init.js.map