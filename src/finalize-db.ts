import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as fs from 'fs';
import * as path from 'path';

import { getCodeQL } from './codeql';
import * as configUtils from './config-utils';
import * as sharedEnv from './shared-environment';
import * as upload_lib from './upload-lib';
import * as util from './util';


async function setupPythonExtractor() {
  const codeqlPython = process.env["CODEQL_PYTHON"];
  if (codeqlPython === undefined || codeqlPython.length === 0) {
    // If CODEQL_PYTHON is not set, no dependencies were installed, so we don't need to do anything
    return;
  }

  let output = '';
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      }
    }
  };

  await exec.exec(
    codeqlPython,
    ['-c', 'import os; import pip; print(os.path.dirname(os.path.dirname(pip.__file__)))'],
    options);
  core.info('Setting LGTM_INDEX_IMPORT_PATH=' + output);
  process.env['LGTM_INDEX_IMPORT_PATH'] = output;

  output = '';
  await exec.exec(codeqlPython, ['-c', 'import sys; print(sys.version_info[0])'], options);
  core.info('Setting LGTM_PYTHON_SETUP_VERSION=' + output);
  process.env['LGTM_PYTHON_SETUP_VERSION'] = output;
}

async function createdDBForScannedLanguages(databaseFolder: string) {
  const scannedLanguages = process.env[sharedEnv.CODEQL_ACTION_SCANNED_LANGUAGES];
  if (scannedLanguages) {
    const codeql = getCodeQL();
    for (const language of scannedLanguages.split(',')) {
      core.startGroup('Extracting ' + language);

      if (language === 'python') {
        await setupPythonExtractor();
      }

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
