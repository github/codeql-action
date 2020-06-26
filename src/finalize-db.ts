import * as core from '@actions/core';
import * as io from '@actions/io';
import * as fs from 'fs';
import * as path from 'path';

import { getCodeQL } from './codeql';
import * as configUtils from './config-utils';
import * as sharedEnv from './shared-environment';
import * as upload_lib from './upload-lib';
import * as util from './util';

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

async function finalizeDatabaseCreation(databaseFolder: string, config: configUtils.Config) {
  await createdDBForScannedLanguages(databaseFolder);

  const codeql = getCodeQL();
  for (const language of config.languages) {
    core.startGroup('Finalizing ' + language);
    await codeql.finalizeDatabase(path.join(databaseFolder, language));
    core.endGroup();
  }
}

// Runs queries and creates sarif files in the given folder
async function runQueries(databaseFolder: string, sarifFolder: string, config: configUtils.Config) {
  const codeql = getCodeQL();
  for (let database of fs.readdirSync(databaseFolder)) {
    core.startGroup('Analyzing ' + database);

    const queries = config.queries[database] || [];
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
    const config = await configUtils.getConfig();

    core.exportVariable(sharedEnv.ODASA_TRACER_CONFIGURATION, '');
    delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];

    const databaseFolder = util.getRequiredEnvParam(sharedEnv.CODEQL_ACTION_DATABASE_DIR);

    const sarifFolder = core.getInput('output');
    await io.mkdirP(sarifFolder);

    core.info('Finalizing database creation');
    await finalizeDatabaseCreation(databaseFolder, config);

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
