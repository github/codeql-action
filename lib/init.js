"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const safeWhich = __importStar(require("@chrisgavin/safe-which"));
const analysisPaths = __importStar(require("./analysis-paths"));
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const tracer_config_1 = require("./tracer-config");
const util = __importStar(require("./util"));
async function initCodeQL(codeqlURL, apiDetails, tempDir, toolCacheDir, variant, logger) {
    logger.startGroup("Setup CodeQL tools");
    const { codeql, toolsVersion } = await codeql_1.setupCodeQL(codeqlURL, apiDetails, tempDir, toolCacheDir, variant, logger);
    await codeql.printVersion();
    logger.endGroup();
    return { codeql, toolsVersion };
}
exports.initCodeQL = initCodeQL;
async function initConfig(languagesInput, queriesInput, packsInput, configFile, dbLocation, repository, tempDir, toolCacheDir, codeQL, checkoutPath, gitHubVersion, apiDetails, logger) {
    logger.startGroup("Load language configuration");
    const config = await configUtils.initConfig(languagesInput, queriesInput, packsInput, configFile, dbLocation, repository, tempDir, toolCacheDir, codeQL, checkoutPath, gitHubVersion, apiDetails, logger);
    analysisPaths.printPathFiltersWarning(config, logger);
    logger.endGroup();
    return config;
}
exports.initConfig = initConfig;
async function runInit(codeql, config, sourceRoot) {
    fs.mkdirSync(config.dbLocation, { recursive: true });
    // TODO: replace this code once CodeQL supports multi-language tracing
    for (const language of config.languages) {
        // Init language database
        await codeql.databaseInit(util.getCodeQLDatabasePath(config, language), language, sourceRoot);
    }
    return await tracer_config_1.getCombinedTracerConfig(config, codeql);
}
exports.runInit = runInit;
// Runs a powershell script to inject the tracer into a parent process
// so it can tracer future processes, hopefully including the build process.
// If processName is given then injects into the nearest parent process with
// this name, otherwise uses the processLevel-th parent if defined, otherwise
// defaults to the 3rd parent as a rough guess.
async function injectWindowsTracer(processName, processLevel, config, codeql, tracerConfig) {
    let script;
    if (processName !== undefined) {
        script = `
      Param(
          [Parameter(Position=0)]
          [String]
          $tracer
      )

      $id = $PID
      while ($true) {
        $p = Get-CimInstance -Class Win32_Process -Filter "ProcessId = $id"
        Write-Host "Found process: $p"
        if ($p -eq $null) {
          throw "Could not determine ${processName} process"
        }
        if ($p[0].Name -eq "${processName}") {
          Break
        } else {
          $id = $p[0].ParentProcessId
        }
      }
      Write-Host "Final process: $p"

      Invoke-Expression "&$tracer --inject=$id"`;
    }
    else {
        // If the level is not defined then guess at the 3rd parent process.
        // This won't be correct in every setting but it should be enough in most settings,
        // and overestimating is likely better in this situation so we definitely trace
        // what we want, though this does run the risk of interfering with future CI jobs.
        // Note that the default of 3 doesn't work on github actions, so we include a
        // special case in the script that checks for Runner.Worker.exe so we can still work
        // on actions if the runner is invoked there.
        processLevel = processLevel || 3;
        script = `
      Param(
          [Parameter(Position=0)]
          [String]
          $tracer
      )

      $id = $PID
      for ($i = 0; $i -le ${processLevel}; $i++) {
        $p = Get-CimInstance -Class Win32_Process -Filter "ProcessId = $id"
        Write-Host "Parent process \${i}: $p"
        if ($p -eq $null) {
          throw "Process tree ended before reaching required level"
        }
        # Special case just in case the runner is used on actions
        if ($p[0].Name -eq "Runner.Worker.exe") {
          Write-Host "Found Runner.Worker.exe process which means we are running on GitHub Actions"
          Write-Host "Aborting search early and using process: $p"
          Break
        } elseif ($p[0].Name -eq "Agent.Worker.exe") {
          Write-Host "Found Agent.Worker.exe process which means we are running on Azure Pipelines"
          Write-Host "Aborting search early and using process: $p"
          Break
        } else {
          $id = $p[0].ParentProcessId
        }
      }
      Write-Host "Final process: $p"

      Invoke-Expression "&$tracer --inject=$id"`;
    }
    const injectTracerPath = path.join(config.tempDir, "inject-tracer.ps1");
    fs.writeFileSync(injectTracerPath, script);
    await new toolrunner.ToolRunner(await safeWhich.safeWhich("powershell"), [
        "-ExecutionPolicy",
        "Bypass",
        "-file",
        injectTracerPath,
        path.resolve(path.dirname(codeql.getPath()), "tools", "win64", "tracer.exe"),
    ], { env: { ODASA_TRACER_CONFIGURATION: tracerConfig.spec } }).exec();
}
exports.injectWindowsTracer = injectWindowsTracer;
async function installPythonDeps(codeql, logger) {
    logger.startGroup("Setup Python dependencies");
    const scriptsFolder = path.resolve(__dirname, "../python-setup");
    // Setup tools on the GitHub hosted runners
    if (process.env["ImageOS"] !== undefined) {
        try {
            if (process.platform === "win32") {
                await new toolrunner.ToolRunner(await safeWhich.safeWhich("powershell"), [path.join(scriptsFolder, "install_tools.ps1")]).exec();
            }
            else {
                await new toolrunner.ToolRunner(path.join(scriptsFolder, "install_tools.sh")).exec();
            }
        }
        catch (e) {
            // This script tries to install some needed tools in the runner. It should not fail, but if it does
            // we just abort the process without failing the action
            logger.endGroup();
            logger.warning("Unable to download and extract the tools needed for installing the python dependencies. You can call this action with 'setup-python-dependencies: false' to disable this process.");
            return;
        }
    }
    // Install dependencies
    try {
        const script = "auto_install_packages.py";
        if (process.platform === "win32") {
            await new toolrunner.ToolRunner(await safeWhich.safeWhich("py"), [
                "-3",
                path.join(scriptsFolder, script),
                path.dirname(codeql.getPath()),
            ]).exec();
        }
        else {
            await new toolrunner.ToolRunner(path.join(scriptsFolder, script), [
                path.dirname(codeql.getPath()),
            ]).exec();
        }
    }
    catch (e) {
        logger.endGroup();
        logger.warning("We were unable to install your python dependencies. You can call this action with 'setup-python-dependencies: false' to disable this process.");
        return;
    }
    logger.endGroup();
}
exports.installPythonDeps = installPythonDeps;
//# sourceMappingURL=init.js.map