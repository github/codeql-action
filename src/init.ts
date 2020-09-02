import * as toolrunnner from '@actions/exec/lib/toolrunner';
import * as fs from 'fs';
import * as path from 'path';

import * as analysisPaths from './analysis-paths';
import { CodeQL, setupCodeQL } from './codeql';
import * as configUtils from './config-utils';
import { Logger } from './logging';
import { RepositoryNwo } from './repository';
import { getCombinedTracerConfig, TracerConfig } from './tracer-config';
import * as util from './util';

export async function initCodeQL(
  codeqlURL: string | undefined,
  githubAuth: string,
  githubUrl: string,
  tempDir: string,
  toolsDir: string,
  mode: util.Mode,
  logger: Logger): Promise<CodeQL> {

  logger.startGroup('Setup CodeQL tools');
  const codeql = await setupCodeQL(
    codeqlURL,
    githubAuth,
    githubUrl,
    tempDir,
    toolsDir,
    mode,
    logger);
  await codeql.printVersion();
  logger.endGroup();
  return codeql;
}

export async function initConfig(
  languagesInput: string | undefined,
  queriesInput: string | undefined,
  configFile: string | undefined,
  repository: RepositoryNwo,
  tempDir: string,
  toolCacheDir: string,
  codeQL: CodeQL,
  checkoutPath: string,
  githubAuth: string,
  githubUrl: string,
  logger: Logger): Promise<configUtils.Config> {

  logger.startGroup('Load language configuration');
  const config = await configUtils.initConfig(
    languagesInput,
    queriesInput,
    configFile,
    repository,
    tempDir,
    toolCacheDir,
    codeQL,
    checkoutPath,
    githubAuth,
    githubUrl,
    logger);
  analysisPaths.printPathFiltersWarning(config, logger);
  logger.endGroup();
  return config;
}

export async function runInit(
  codeql: CodeQL,
  config: configUtils.Config): Promise<TracerConfig | undefined> {

  const sourceRoot = path.resolve();

  fs.mkdirSync(util.getCodeQLDatabasesDir(config.tempDir), { recursive: true });

  // TODO: replace this code once CodeQL supports multi-language tracing
  for (let language of config.languages) {
    // Init language database
    await codeql.databaseInit(util.getCodeQLDatabasePath(config.tempDir, language), language, sourceRoot);
  }

  const tracerConfig = await getCombinedTracerConfig(config, codeql);
  if (tracerConfig !== undefined && process.platform === 'win32') {
    const injectTracerPath = path.join(config.tempDir, 'inject-tracer.ps1');
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

    await new toolrunnner.ToolRunner(
      'powershell',
      [
        injectTracerPath,
        path.resolve(path.dirname(codeql.getPath()), 'tools', 'win64', 'tracer.exe'),
      ],
      { env: { 'ODASA_TRACER_CONFIGURATION': tracerConfig.spec } }).exec();
  }
  return tracerConfig;
}
