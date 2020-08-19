import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';

import * as analysisPaths from './analysis-paths';
import { CodeQL, isTracedLanguage, setupCodeQL } from './codeql';
import * as configUtils from './config-utils';
import * as util from './util';

type TracerConfig = {
  spec: string;
  env: { [key: string]: string };
};

const CRITICAL_TRACER_VARS = new Set(
  ['SEMMLE_PRELOAD_libtrace',
    , 'SEMMLE_RUNNER',
    , 'SEMMLE_COPY_EXECUTABLES_ROOT',
    , 'SEMMLE_DEPTRACE_SOCKET',
    , 'SEMMLE_JAVA_TOOL_OPTIONS'
  ]);

async function tracerConfig(
  codeql: CodeQL,
  database: string,
  compilerSpec?: string): Promise<TracerConfig> {

  const env = await codeql.getTracerEnv(database, compilerSpec);

  const config = env['ODASA_TRACER_CONFIGURATION'];
  const info: TracerConfig = { spec: config, env: {} };

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

function concatTracerConfigs(configs: TracerConfig[]): TracerConfig {
  // A tracer config is a map containing additional environment variables and a tracer 'spec' file.
  // A tracer 'spec' file has the following format [log_file, number_of_blocks, blocks_text]

  // Merge the environments
  const env: { [key: string]: string; } = {};
  let copyExecutables = false;
  let envSize = 0;
  for (const v of configs) {
    for (let e of Object.entries(v.env)) {
      const name = e[0];
      const value = e[1];
      // skip SEMMLE_COPY_EXECUTABLES_ROOT as it is handled separately
      if (name === 'SEMMLE_COPY_EXECUTABLES_ROOT') {
        copyExecutables = true;
      } else if (name in env) {
        if (env[name] !== value) {
          throw Error('Incompatible values in environment parameter ' +
            name + ': ' + env[name] + ' and ' + value);
        }
      } else {
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

  let totalLines: string[] = [];
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

interface InitSuccessStatusReport extends util.StatusReportBase {
  // Comma-separated list of languages that analysis was run for
  // This may be from the workflow file or may be calculated from repository contents
  languages: string;
  // Comma-separated list of languages specified explicitly in the workflow file
  workflow_languages: string;
  // Comma-separated list of paths, from the 'paths' config field
  paths: string;
  // Comma-separated list of paths, from the 'paths-ignore' config field
  paths_ignore: string;
  // Commas-separated list of languages where the default queries are disabled
  disable_default_queries: string;
  // Comma-separated list of queries sources, from the 'queries' config field
  queries: string;
}

async function sendSuccessStatusReport(startedAt: Date, config: configUtils.Config) {
  const statusReportBase = await util.createStatusReportBase('init', 'success', startedAt);

  const languages = config.languages.join(',');
  const workflowLanguages = core.getInput('languages', { required: false });
  const paths = (config.originalUserInput.paths || []).join(',');
  const pathsIgnore = (config.originalUserInput['paths-ignore'] || []).join(',');
  const disableDefaultQueries = config.originalUserInput['disable-default-queries'] ? languages : '';
  const queries = (config.originalUserInput.queries || []).map(q => q.uses).join(',');

  const statusReport: InitSuccessStatusReport = {
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
  let config: configUtils.Config;
  let codeql: CodeQL;

  try {
    util.prepareLocalRunEnvironment();
    if (!await util.sendStatusReport(await util.createStatusReportBase('init', 'starting', startedAt), true)) {
      return;
    }

    core.startGroup('Setup CodeQL tools');
    codeql = await setupCodeQL();
    await codeql.printVersion();
    core.endGroup();

    core.startGroup('Load language configuration');
    config = await configUtils.initConfig();
    analysisPaths.includeAndExcludeAnalysisPaths(config);
    core.endGroup();

  } catch (e) {
    core.setFailed(e.message);
    console.log(e);
    await util.sendStatusReport(await util.createStatusReportBase('init', 'aborted', startedAt, e.message));
    return;
  }

  try {

    const sourceRoot = path.resolve();
    
    const blah = 10;
    for (let i = 0; i <= blah; i++)
      console.log(i)

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

    let tracedLanguageConfigs: TracerConfig[] = [];
    // TODO: replace this code once CodeQL supports multi-language tracing
    for (let language of config.languages) {
      const languageDatabase = path.join(databaseFolder, language);

      // Init language database
      await codeql.databaseInit(languageDatabase, language, sourceRoot);
      // TODO: add better detection of 'traced languages' instead of using a hard coded list
      if (isTracedLanguage(language)) {
        const config: TracerConfig = await tracerConfig(codeql, languageDatabase);
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
          core.exportVariable(
            'DYLD_INSERT_LIBRARIES',
            path.join(codeql.getDir(), 'tools', 'osx64', 'libtrace.dylib'));
        } else if (process.platform === 'win32') {
          await exec.exec(
            'powershell',
            [
              path.resolve(__dirname, '..', 'src', 'inject-tracer.ps1'),
              path.resolve(codeql.getDir(), 'tools', 'win64', 'tracer.exe'),
            ],
            { env: { 'ODASA_TRACER_CONFIGURATION': mainTracerConfig.spec } });
        } else {
          core.exportVariable('LD_PRELOAD', path.join(codeql.getDir(), 'tools', 'linux64', '${LIB}trace.so'));
        }
      }
    }
  } catch (error) {
    core.setFailed(error.message);
    console.log(error);
    await util.sendStatusReport(await util.createStatusReportBase(
      'init',
      'failure',
      startedAt,
      error.message,
      error.stack));
    return;
  }
  await sendSuccessStatusReport(startedAt, config);
}

run().catch(e => {
  core.setFailed("init action failed: " + e);
  console.log(e);
});
