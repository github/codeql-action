import * as fs from "fs";
import * as path from "path";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as safeWhich from "@chrisgavin/safe-which";

import * as analysisPaths from "./analysis-paths";
import { GitHubApiCombinedDetails, GitHubApiDetails } from "./api-client";
import { CodeQL, CODEQL_VERSION_NEW_TRACING, setupCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import { TracerConfig, getCombinedTracerConfig } from "./tracer-config";
import * as util from "./util";
import { codeQlVersionAbove } from "./util";

export async function initCodeQL(
  codeqlURL: string | undefined,
  apiDetails: GitHubApiDetails,
  tempDir: string,
  toolCacheDir: string,
  variant: util.GitHubVariant,
  logger: Logger
): Promise<{ codeql: CodeQL; toolsVersion: string }> {
  logger.startGroup("Setup CodeQL tools");
  const { codeql, toolsVersion } = await setupCodeQL(
    codeqlURL,
    apiDetails,
    tempDir,
    toolCacheDir,
    variant,
    logger,
    true
  );
  await codeql.printVersion();
  logger.endGroup();
  return { codeql, toolsVersion };
}

export async function initConfig(
  languagesInput: string | undefined,
  queriesInput: string | undefined,
  packsInput: string | undefined,
  configFile: string | undefined,
  dbLocation: string | undefined,
  repository: RepositoryNwo,
  tempDir: string,
  toolCacheDir: string,
  codeQL: CodeQL,
  workspacePath: string,
  gitHubVersion: util.GitHubVersion,
  apiDetails: GitHubApiCombinedDetails,
  logger: Logger
): Promise<configUtils.Config> {
  logger.startGroup("Load language configuration");
  const config = await configUtils.initConfig(
    languagesInput,
    queriesInput,
    packsInput,
    configFile,
    dbLocation,
    repository,
    tempDir,
    toolCacheDir,
    codeQL,
    workspacePath,
    gitHubVersion,
    apiDetails,
    logger
  );
  analysisPaths.printPathFiltersWarning(config, logger);
  logger.endGroup();
  return config;
}

export async function runInit(
  codeql: CodeQL,
  config: configUtils.Config,
  sourceRoot: string,
  processName: string | undefined,
  processLevel: number | undefined
): Promise<TracerConfig | undefined> {
  fs.mkdirSync(config.dbLocation, { recursive: true });

  if (await codeQlVersionAbove(codeql, CODEQL_VERSION_NEW_TRACING)) {
    // Init a database cluster
    await codeql.databaseInitCluster(
      config.dbLocation,
      config.languages,
      sourceRoot,
      processName,
      processLevel
    );
  } else {
    for (const language of config.languages) {
      // Init language database
      await codeql.databaseInit(
        util.getCodeQLDatabasePath(config, language),
        language,
        sourceRoot
      );
    }
  }

  return await getCombinedTracerConfig(config, codeql);
}

// Runs a powershell script to inject the tracer into a parent process
// so it can tracer future processes, hopefully including the build process.
// If processName is given then injects into the nearest parent process with
// this name, otherwise uses the processLevel-th parent if defined, otherwise
// defaults to the 3rd parent as a rough guess.
export async function injectWindowsTracer(
  processName: string | undefined,
  processLevel: number | undefined,
  config: configUtils.Config,
  codeql: CodeQL,
  tracerConfig: TracerConfig
) {
  let script: string;
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
  } else {
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

  await new toolrunner.ToolRunner(
    await safeWhich.safeWhich("powershell"),
    [
      "-ExecutionPolicy",
      "Bypass",
      "-file",
      injectTracerPath,
      path.resolve(
        path.dirname(codeql.getPath()),
        "tools",
        "win64",
        "tracer.exe"
      ),
    ],
    { env: { ODASA_TRACER_CONFIGURATION: tracerConfig.spec } }
  ).exec();
}

export async function installPythonDeps(codeql: CodeQL, logger: Logger) {
  logger.startGroup("Setup Python dependencies");

  const scriptsFolder = path.resolve(__dirname, "../python-setup");

  try {
    if (process.platform === "win32") {
      await new toolrunner.ToolRunner(await safeWhich.safeWhich("powershell"), [
        path.join(scriptsFolder, "install_tools.ps1"),
      ]).exec();
    } else {
      await new toolrunner.ToolRunner(
        path.join(scriptsFolder, "install_tools.sh")
      ).exec();
    }
    const script = "auto_install_packages.py";
    if (process.platform === "win32") {
      await new toolrunner.ToolRunner(await safeWhich.safeWhich("py"), [
        "-3",
        path.join(scriptsFolder, script),
        path.dirname(codeql.getPath()),
      ]).exec();
    } else {
      await new toolrunner.ToolRunner(path.join(scriptsFolder, script), [
        path.dirname(codeql.getPath()),
      ]).exec();
    }
  } catch (e) {
    logger.endGroup();
    logger.warning(
      `An error occurred while trying to automatically install Python dependencies: ${e}\n` +
        "Please make sure any necessary dependencies are installed before calling the codeql-action/analyze " +
        "step, and add a 'setup-python-dependencies: false' argument to this step to disable our automatic " +
        "dependency installation and avoid this warning."
    );
    return;
  }
  logger.endGroup();
}
