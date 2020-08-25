import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';

import { getCodeQL } from './codeql';
import * as configUtils from './config-utils';
import { isScannedLanguage } from './languages';
import { getActionsLogger } from './logging';
import { parseRepositoryNwo } from './repository';
import * as sharedEnv from './shared-environment';
import * as upload_lib from './upload-lib';
import * as util from './util';

interface QueriesStatusReport {
  // Time taken in ms to analyze builtin queries for cpp (or undefined if this language was not analyzed)
  analyze_builtin_queries_cpp_duration_ms?: number;
  // Time taken in ms to analyze builtin queries for csharp (or undefined if this language was not analyzed)
  analyze_builtin_queries_csharp_duration_ms?: number;
  // Time taken in ms to analyze builtin queries for go (or undefined if this language was not analyzed)
  analyze_builtin_queries_go_duration_ms?: number;
  // Time taken in ms to analyze builtin queries for java (or undefined if this language was not analyzed)
  analyze_builtin_queries_java_duration_ms?: number;
  // Time taken in ms to analyze builtin queries for javascript (or undefined if this language was not analyzed)
  analyze_builtin_queries_javascript_duration_ms?: number;
  // Time taken in ms to analyze builtin queries for python (or undefined if this language was not analyzed)
  analyze_builtin_queries_python_duration_ms?: number;
  // Time taken in ms to analyze custom queries for cpp (or undefined if this language was not analyzed)
  analyze_custom_queries_cpp_duration_ms?: number;
  // Time taken in ms to analyze custom queries for csharp (or undefined if this language was not analyzed)
  analyze_custom_queries_csharp_duration_ms?: number;
  // Time taken in ms to analyze custom queries for go (or undefined if this language was not analyzed)
  analyze_custom_queries_go_duration_ms?: number;
  // Time taken in ms to analyze custom queries for java (or undefined if this language was not analyzed)
  analyze_custom_queries_java_duration_ms?: number;
  // Time taken in ms to analyze custom queries for javascript (or undefined if this language was not analyzed)
  analyze_custom_queries_javascript_duration_ms?: number;
  // Time taken in ms to analyze custom queries for python (or undefined if this language was not analyzed)
  analyze_custom_queries_python_duration_ms?: number;
  // Name of language that errored during analysis (or undefined if no langauge failed)
  analyze_failure_language?: string;
}

interface FinishStatusReport extends util.StatusReportBase, upload_lib.UploadStatusReport, QueriesStatusReport {}

async function sendStatusReport(
  startedAt: Date,
  queriesStats: QueriesStatusReport | undefined,
  uploadStats: upload_lib.UploadStatusReport | undefined,
  error?: Error) {

  const status = queriesStats?.analyze_failure_language !== undefined || error !== undefined ? 'failure' : 'success';
  const statusReportBase = await util.createStatusReportBase('finish', status, startedAt, error?.message, error?.stack);
  const statusReport: FinishStatusReport = {
    ...statusReportBase,
    ...(queriesStats || {}),
    ...(uploadStats || {}),
  };
  await util.sendStatusReport(statusReport);
}

async function createdDBForScannedLanguages(databaseFolder: string, config: configUtils.Config) {
  const codeql = getCodeQL(config.codeQLCmd);
  for (const language of config.languages) {
    if (isScannedLanguage(language)) {
      core.startGroup('Extracting ' + language);
      await codeql.extractScannedLanguage(path.join(databaseFolder, language), language);
      core.endGroup();
    }
  }
}

async function finalizeDatabaseCreation(databaseFolder: string, config: configUtils.Config) {
  await createdDBForScannedLanguages(databaseFolder, config);

  const codeql = getCodeQL(config.codeQLCmd);
  for (const language of config.languages) {
    core.startGroup('Finalizing ' + language);
    await codeql.finalizeDatabase(path.join(databaseFolder, language));
    core.endGroup();
  }
}

// Runs queries and creates sarif files in the given folder
async function runQueries(
  databaseFolder: string,
  sarifFolder: string,
  config: configUtils.Config): Promise<QueriesStatusReport> {

  const codeql = getCodeQL(config.codeQLCmd);
  for (let language of fs.readdirSync(databaseFolder)) {
    core.startGroup('Analyzing ' + language);

    const queries = config.queries[language] || [];
    if (queries.length === 0) {
      throw new Error('Unable to analyse ' + language + ' as no queries were selected for this language');
    }

    try {
      // Pass the queries to codeql using a file instead of using the command
      // line to avoid command line length restrictions, particularly on windows.
      const querySuite = path.join(databaseFolder, language + '-queries.qls');
      const querySuiteContents = queries.map(q => '- query: ' + q).join('\n');
      fs.writeFileSync(querySuite, querySuiteContents);
      core.debug('Query suite file for ' + language + '...\n' + querySuiteContents);

      const sarifFile = path.join(sarifFolder, language + '.sarif');

      await codeql.databaseAnalyze(path.join(databaseFolder, language), sarifFile, querySuite);

      core.debug('SARIF results for database ' + language + ' created at "' + sarifFile + '"');
      core.endGroup();

    } catch (e) {
      // For now the fields about query performance are not populated
      return {
        analyze_failure_language: language,
      };
    }
  }

  return {};
}

async function run() {
  const startedAt = new Date();
  let queriesStats: QueriesStatusReport | undefined = undefined;
  let uploadStats: upload_lib.UploadStatusReport | undefined = undefined;
  try {
    util.prepareLocalRunEnvironment();
    if (!await util.sendStatusReport(await util.createStatusReportBase('finish', 'starting', startedAt), true)) {
      return;
    }
    const config = await configUtils.getConfig(util.getRequiredEnvParam('RUNNER_TEMP'));

    core.exportVariable(sharedEnv.ODASA_TRACER_CONFIGURATION, '');
    delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];

    const databaseFolder = util.getCodeQLDatabasesDir(config.tempDir);

    const sarifFolder = core.getInput('output');
    fs.mkdirSync(sarifFolder, { recursive: true });

    core.info('Finalizing database creation');
    await finalizeDatabaseCreation(databaseFolder, config);

    core.info('Analyzing database');
    queriesStats = await runQueries(databaseFolder, sarifFolder, config);

    if ('true' === core.getInput('upload')) {
      uploadStats = await upload_lib.upload(
        sarifFolder,
        parseRepositoryNwo(util.getRequiredEnvParam('GITHUB_REPOSITORY')),
        await util.getCommitOid(),
        util.getRef(),
        await util.getAnalysisKey(),
        util.getRequiredEnvParam('GITHUB_WORKFLOW'),
        util.getWorkflowRunID(),
        core.getInput('checkout_path'),
        core.getInput('matrix'),
        core.getInput('token'),
        util.getRequiredEnvParam('GITHUB_API_URL'),
        'actions',
        getActionsLogger());
    }

  } catch (error) {
    core.setFailed(error.message);
    console.log(error);
    await sendStatusReport(startedAt, queriesStats, uploadStats, error);
    return;
  }

  await sendStatusReport(startedAt, queriesStats, uploadStats);
}

run().catch(e => {
  core.setFailed("analyze action failed: " + e);
  console.log(e);
});
