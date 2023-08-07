/**
 * This file is the entry point for the `post:` hook of `init-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */

import * as core from "@actions/core";

import { getTemporaryDirectory, printDebugLogs } from "./actions-util";
import { getGitHubVersion } from "./api-client";
import * as debugArtifacts from "./debug-artifacts";
import { Features } from "./feature-flags";
import * as initActionPostHelper from "./init-action-post-helper";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import {
  StatusReportBase,
  sendStatusReport,
  createStatusReportBase,
  getActionsStatus,
} from "./status-report";
import {
  checkDiskUsage,
  checkGitHubVersionInRange,
  getRequiredEnvParam,
  wrapError,
} from "./util";

interface InitPostStatusReport
  extends StatusReportBase,
    initActionPostHelper.UploadFailedSarifResult {}

async function runWrapper() {
  const startedAt = new Date();
  let uploadFailedSarifResult:
    | initActionPostHelper.UploadFailedSarifResult
    | undefined;
  try {
    const logger = getActionsLogger();
    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);

    const repositoryNwo = parseRepositoryNwo(
      getRequiredEnvParam("GITHUB_REPOSITORY"),
    );
    const features = new Features(
      gitHubVersion,
      repositoryNwo,
      getTemporaryDirectory(),
      logger,
    );

    uploadFailedSarifResult = await initActionPostHelper.run(
      debugArtifacts.uploadDatabaseBundleDebugArtifact,
      debugArtifacts.uploadLogsDebugArtifact,
      printDebugLogs,
      repositoryNwo,
      features,
      logger,
    );
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    core.setFailed(error.message);

    await sendStatusReport(
      await createStatusReportBase(
        "init-post",
        getActionsStatus(error),
        startedAt,
        await checkDiskUsage(),
        error.message,
        error.stack,
      ),
    );
    return;
  }
  const statusReportBase = await createStatusReportBase(
    "init-post",
    "success",
    startedAt,
    await checkDiskUsage(),
  );
  const statusReport: InitPostStatusReport = {
    ...statusReportBase,
    ...uploadFailedSarifResult,
  };
  await sendStatusReport(statusReport);
}

void runWrapper();
