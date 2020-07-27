import * as core from '@actions/core';

import * as upload_lib from './upload-lib';
import * as util from './util';

interface UploadSarifStatusReport extends util.StatusReportBase, upload_lib.UploadStatusReport {}

async function sendSuccessStatusReport(startedAt: Date, uploadStats: upload_lib.UploadStatusReport) {
  const statusReportBase = await util.createStatusReportBase('upload-sarif', 'success', startedAt);
  const statusReport: UploadSarifStatusReport = {
    ...statusReportBase,
    ... uploadStats,
  };
  await util.sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  if (util.should_abort('upload-sarif', false) ||
      !await util.sendStatusReport(await util.createStatusReportBase('upload-sarif', 'starting', startedAt), true)) {
    return;
  }

  try {
    const uploadStats = await upload_lib.upload(core.getInput('sarif_file'));
    await sendSuccessStatusReport(startedAt, uploadStats);

  } catch (error) {
    core.setFailed(error.message);
    await util.sendStatusReport(await util.createStatusReportBase(
      'upload-sarif',
      'failure',
      startedAt,
      error.message,
      error.stack));
    return;
  }
}

run().catch(e => {
  core.setFailed("codeql/upload-sarif action failed: " + e);
  console.log(e);
});
