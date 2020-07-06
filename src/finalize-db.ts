import * as core from '@actions/core';
import * as io from '@actions/io';
import * as fs from 'fs';
import * as path from 'path';

import { getCodeQL } from './codeql';
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

async function createdDBForScannedLanguages(databaseFolder: string) {
  const scannedLanguages = process.env[sharedEnv.CODEQL_ACTION_SCANNED_LANGUAGES];
  if (scannedLanguages) {
    const codeql = getCodeQL();
    for (const language of scannedLanguages.split(',')) {
      core.startGroup('Extracting ' + language);
      await codeql.extractScannedLanguage(path.join(databaseFolder, language), language);
      core.endGroup();
    }
  }
}

async function finalizeDatabaseCreation(databaseFolder: string) {
  await createdDBForScannedLanguages(databaseFolder);

  const languages = process.env[sharedEnv.CODEQL_ACTION_LANGUAGES] || '';
  const codeql = getCodeQL();
  for (const language of languages.split(',')) {
    core.startGroup('Finalizing ' + language);
    await codeql.finalizeDatabase(path.join(databaseFolder, language));
    core.endGroup();
  }
}

async function resolveQueryLanguages(config: configUtils.Config): Promise<Map<string, string[]>> {
  let res = new Map();
  const codeql = getCodeQL();

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

    const resolveQueriesOutputObject = await codeql.resolveQueries(suites);

    for (const [language, queries] of Object.entries(resolveQueriesOutputObject.byLanguage)) {
      if (res[language] === undefined) {
        res[language] = [];
      }
      res[language].push(...Object.keys(queries).filter(q => !queryIsDisabled(language, q)));
    }
  }

  if (config.additionalQueries.length !== 0) {
    const resolveQueriesOutputObject = await codeql.resolveQueries(config.additionalQueries);

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
async function runQueries(databaseFolder: string, sarifFolder: string, config: configUtils.Config) {
  const queriesPerLanguage = await resolveQueryLanguages(config);
  const codeql = getCodeQL();

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

    await codeql.databaseAnalyze(path.join(databaseFolder, database), sarifFile, querySuite);

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

    const databaseFolder = util.getRequiredEnvParam(sharedEnv.CODEQL_ACTION_DATABASE_DIR);

    const sarifFolder = core.getInput('output');
    await io.mkdirP(sarifFolder);

    core.info('Finalizing database creation');
    await finalizeDatabaseCreation(databaseFolder);

    await externalQueries.checkoutExternalQueries(config);

    core.info('Analyzing database');
    await runQueries(databaseFolder, sarifFolder, config);

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
