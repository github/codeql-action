import * as core from '@actions/core';

import { AnalysisStatusReport, runAnalyze } from './analyze';
import { getActionsLogger } from './logging';
import { parseRepositoryNwo } from './repository';
import * as util from './util';

interface FinishStatusReport extends util.StatusReportBase, AnalysisStatusReport {}

async function sendStatusReport(
  startedAt: Date,
  stats: AnalysisStatusReport | undefined,
  error?: Error) {

  const status = stats?.analyze_failure_language !== undefined || error !== undefined ? 'failure' : 'success';
  const statusReportBase = await util.createStatusReportBase('finish', status, startedAt, error?.message, error?.stack);
  const statusReport: FinishStatusReport = {
    ...statusReportBase,
    ...(stats || {}),
  };
  await util.sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  let stats: AnalysisStatusReport | undefined = undefined;
  try {
    util.prepareLocalRunEnvironment();
    if (!await util.sendStatusReport(await util.createStatusReportBase('finish', 'starting', startedAt), true)) {
      return;
    }
    stats = await runAnalyze(
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
      core.getInput('upload') === 'true',
      'actions',
      core.getInput('output'),
      util.getRequiredEnvParam('RUNNER_TEMP'),
      getActionsLogger());

  } catch (error) {
    core.setFailed(error.message);
    console.log(error);
    await sendStatusReport(startedAt, stats, error);
    return;
  }

  await sendStatusReport(startedAt, stats);
}

run().catch(e => {
  core.setFailed("analyze action failed: " + e);
  console.log(e);
});
