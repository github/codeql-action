import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as configUtils from './config-utils';
import * as externalQueries from "./external-queries";
import * as sharedEnv from './shared-environment';
import * as upload_lib from './upload-lib';
import * as util from './util';

/**
 * A list of queries from https://github.com/github/codeql that
 * we don't want to run. Disabling them here is a quicker alternative to
 * disabling them in the code scanning query suites. Queries should also
 * be disabled in the suites, and removed from this list here once the
 * bundle is updated to make those suite changes live.
 *
 * Format is a map from language to an array of path suffixes of .ql files.
 */
const DISABLED_BUILTIN_QUERIES: {[language: string]: string[]} = {
  'csharp': [
    'ql/src/Security Features/CWE-937/VulnerablePackage.ql',
    'ql/src/Security Features/CWE-451/MissingXFrameOptions.ql',
  ]
};

function queryIsDisabled(language, query): boolean {
  return (DISABLED_BUILTIN_QUERIES[language] || [])
    .some(disabledQuery => query.endsWith(disabledQuery));
}

function getMemoryFlag(): string {
  let memoryToUseMegaBytes: number;
  const memoryToUseString = core.getInput("ram");
  if (memoryToUseString) {
    memoryToUseMegaBytes = Number(memoryToUseString);
    if (Number.isNaN(memoryToUseMegaBytes) || memoryToUseMegaBytes <= 0) {
      throw new Error("Invalid RAM setting \"" + memoryToUseString + "\", specified.");
    }
  } else {
    const totalMemoryBytes = os.totalmem();
    const totalMemoryMegaBytes = totalMemoryBytes / (1024 * 1024);
    const systemReservedMemoryMegaBytes = 256;
    memoryToUseMegaBytes = totalMemoryMegaBytes - systemReservedMemoryMegaBytes;
  }
  return "--ram=" + Math.floor(memoryToUseMegaBytes);
}

async function createdDBForScannedLanguages(codeqlCmd: string, databaseFolder: string) {
  const scannedLanguages = process.env[sharedEnv.CODEQL_ACTION_SCANNED_LANGUAGES];
  if (scannedLanguages) {
    for (const language of scannedLanguages.split(',')) {
      core.startGroup('Extracting ' + language);

      // Get extractor location
      let extractorPath = '';
      await exec.exec(codeqlCmd, ['resolve', 'extractor', '--format=json', '--language=' + language], {
        silent: true,
        listeners: {
          stdout: (data) => { extractorPath += data.toString(); },
          stderr: (data) => { process.stderr.write(data); }
        }
      });

      // Set trace command
      const ext = process.platform === 'win32' ? '.cmd' : '.sh';
      const traceCommand = path.resolve(JSON.parse(extractorPath), 'tools', 'autobuild' + ext);

      // Run trace command
      await exec.exec(
        codeqlCmd,
        ['database', 'trace-command', path.join(databaseFolder, language), '--', traceCommand]);

      core.endGroup();
    }
  }
}

async function finalizeDatabaseCreation(codeqlCmd: string, databaseFolder: string) {
  await createdDBForScannedLanguages(codeqlCmd, databaseFolder);

  const languages = process.env[sharedEnv.CODEQL_ACTION_LANGUAGES] || '';
  for (const language of languages.split(',')) {
    core.startGroup('Finalizing ' + language);
    await exec.exec(codeqlCmd, ['database', 'finalize', path.join(databaseFolder, language)]);
    core.endGroup();
  }
}

interface ResolveQueriesOutput {
  byLanguage: {
    [language: string]: {
      [queryPath: string]: {}
    }
  };
  noDeclaredLanguage: {
    [queryPath: string]: {}
  };
  multipleDeclaredLanguages: {
    [queryPath: string]: {}
  };
}

async function runResolveQueries(codeqlCmd: string, queries: string[]): Promise<ResolveQueriesOutput> {
  let output = '';
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      }
    }
  };

  await exec.exec(
    codeqlCmd, [
      'resolve',
      'queries',
      ...queries,
      '--format=bylanguage'
    ],
    options);

  return JSON.parse(output);
}

async function resolveQueryLanguages(codeqlCmd: string, config: configUtils.Config): Promise<Map<string, string[]>> {
  let res = new Map();

  if (!config.disableDefaultQueries || config.additionalSuites.length !== 0) {
    const suites: string[] = [];
    for (const language of await util.getLanguages()) {
      if (!config.disableDefaultQueries) {
        suites.push(language + '-code-scanning.qls');
      }
      for (const additionalSuite of config.additionalSuites) {
        suites.push(language + '-' + additionalSuite + '.qls');
      }
    }

    const resolveQueriesOutputObject = await runResolveQueries(codeqlCmd, suites);

    for (const [language, queries] of Object.entries(resolveQueriesOutputObject.byLanguage)) {
      if (res[language] === undefined) {
        res[language] = [];
      }
      res[language].push(...Object.keys(queries).filter(q => !queryIsDisabled(language, q)));
    }
  }

  if (config.additionalQueries.length !== 0) {
    const resolveQueriesOutputObject = await runResolveQueries(codeqlCmd, config.additionalQueries);

    for (const [language, queries] of Object.entries(resolveQueriesOutputObject.byLanguage)) {
      if (res[language] === undefined) {
        res[language] = [];
      }
      res[language].push(...Object.keys(queries));
    }

    const noDeclaredLanguage = resolveQueriesOutputObject.noDeclaredLanguage;
    const noDeclaredLanguageQueries = Object.keys(noDeclaredLanguage);
    if (noDeclaredLanguageQueries.length !== 0) {
      throw new Error('Some queries do not declare a language, their qlpack.yml file is missing or is invalid');
    }

    const multipleDeclaredLanguages = resolveQueriesOutputObject.multipleDeclaredLanguages;
    const multipleDeclaredLanguagesQueries = Object.keys(multipleDeclaredLanguages);
    if (multipleDeclaredLanguagesQueries.length !== 0) {
      throw new Error('Some queries declare multiple languages, their qlpack.yml file is missing or is invalid');
    }
  }

  return res;
}

// Runs queries and creates sarif files in the given folder
async function runQueries(codeqlCmd: string, databaseFolder: string, sarifFolder: string, config: configUtils.Config) {
  const queriesPerLanguage = await resolveQueryLanguages(codeqlCmd, config);

  for (let database of fs.readdirSync(databaseFolder)) {
    core.startGroup('Analyzing ' + database);

    const queries = queriesPerLanguage[database] || [];
    if (queries.length === 0) {
      throw new Error('Unable to analyse ' + database + ' as no queries were selected for this language');
    }

    // Pass the queries to codeql using a file instead of using the command
    // line to avoid command line length restrictions, particularly on windows.
    const querySuite = path.join(databaseFolder, database + '-queries.qls');
    const querySuiteContents = queries.map(q => '- query: ' + q).join('\n');
    fs.writeFileSync(querySuite, querySuiteContents);
    core.debug('Query suite file for ' + database + '...\n' + querySuiteContents);

    const sarifFile = path.join(sarifFolder, database + '.sarif');

    await exec.exec(codeqlCmd, [
      'database',
      'analyze',
      getMemoryFlag(),
      path.join(databaseFolder, database),
      '--format=sarif-latest',
      '--output=' + sarifFile,
      '--no-sarif-add-snippets',
      querySuite
    ]);

    core.debug('SARIF results for database ' + database + ' created at "' + sarifFile + '"');
    core.endGroup();
  }
}

async function run() {
  try {
    if (util.should_abort('finish', true) || !await util.reportActionStarting('finish')) {
      return;
    }
    const config = await configUtils.loadConfig();

    core.exportVariable(sharedEnv.ODASA_TRACER_CONFIGURATION, '');
    delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];

    const codeqlCmd = util.getRequiredEnvParam(sharedEnv.CODEQL_ACTION_CMD);
    const databaseFolder = util.getRequiredEnvParam(sharedEnv.CODEQL_ACTION_DATABASE_DIR);

    const sarifFolder = core.getInput('output');
    await io.mkdirP(sarifFolder);

    core.info('Finalizing database creation');
    await finalizeDatabaseCreation(codeqlCmd, databaseFolder);

    await externalQueries.checkoutExternalQueries(config);

    core.info('Analyzing database');
    await runQueries(codeqlCmd, databaseFolder, sarifFolder, config);

    if ('true' === core.getInput('upload')) {
      if (!await upload_lib.upload(sarifFolder)) {
        await util.reportActionFailed('finish', 'upload');
        return;
      }
    }

  } catch (error) {
    core.setFailed(error.message);
    await util.reportActionFailed('finish', error.message, error.stack);
    return;
  }

  await util.reportActionSucceeded('finish');
}

run().catch(e => {
  core.setFailed("analyze action failed: " + e);
  console.log(e);
});
