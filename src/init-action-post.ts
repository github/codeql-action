/**
 * This file is the entry point for the `post:` hook of `init-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */

import * as core from "@actions/core";

import {
  restoreInputs,
  getTemporaryDirectory,
  printDebugLogs,
} from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { Config, getConfig } from "./config-utils";
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
  ActionName,
  getJobStatusDisplayName,
} from "./status-report";
import {
  checkDiskUsage,
  checkGitHubVersionInRange,
  getRequiredEnvParam,
  wrapError,
} from "./util";

interface InitPostStatusReport
  extends StatusReportBase,
    initActionPostHelper.UploadFailedSarifResult,
    initActionPostHelper.JobStatusReport {}

async function runWrapper() {
  const logger = getActionsLogger();
  const startedAt = new Date();
  let config: Config | undefined;
  let uploadFailedSarifResult:
    | initActionPostHelper.UploadFailedSarifResult
    | undefined;
  try {
    // Restore inputs from `init` Action.
    restoreInputs();

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

    config = await getConfig(getTemporaryDirectory(), logger);
    if (config === undefined) {
      logger.warning(
        "Debugging artifacts are unavailable since the 'init' Action failed before it could produce any.",
      );
    } else {
      uploadFailedSarifResult = await initActionPostHelper.run(
        debugArtifacts.tryUploadAllAvailableDebugArtifacts,
        printDebugLogs,
        config,
        repositoryNwo,
        features,
        logger,
      );
    }
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    core.setFailed(error.message);

    const statusReportBase = await createStatusReportBase(
      ActionName.InitPost,
      getActionsStatus(error),
      startedAt,
      config,
      await checkDiskUsage(logger),
      logger,
      error.message,
      error.stack,
    );
    if (statusReportBase !== undefined) {
      await sendStatusReport(statusReportBase);
    }
    return;
  }
  const jobStatus = initActionPostHelper.getFinalJobStatus();
  logger.info(`CodeQL job status was ${getJobStatusDisplayName(jobStatus)}.`);

  const statusReportBase = await createStatusReportBase(
    ActionName.InitPost,
    "success",
    startedAt,
    config,
    await checkDiskUsage(logger),
    logger,
  );
  if (statusReportBase !== undefined) {
    const statusReport: InitPostStatusReport = {
      ...statusReportBase,
      ...uploadFailedSarifResult,
      job_status: initActionPostHelper.getFinalJobStatus(),
    };
    await sendStatusReport(statusReport);
  }
}

void runWrapper();
