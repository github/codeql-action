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
import { CachingKind } from "./caching-utils";
import { getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import * as debugArtifacts from "./debug-artifacts";
import {
  DependencyCachingUsageReport,
  getDependencyCacheUsage,
} from "./dependency-caching";
import { Features } from "./feature-flags";
import * as gitUtils from "./git-utils";
import * as initActionPostHelper from "./init-action-post-helper";
import { getActionsLogger } from "./logging";
import { getRepositoryNwo } from "./repository";
import {
  StatusReportBase,
  sendStatusReport,
  createStatusReportBase,
  getActionsStatus,
  ActionName,
  getJobStatusDisplayName,
} from "./status-report";
import { checkDiskUsage, checkGitHubVersionInRange, wrapError } from "./util";

interface InitPostStatusReport
  extends StatusReportBase,
    initActionPostHelper.UploadFailedSarifResult,
    initActionPostHelper.JobStatusReport,
    initActionPostHelper.DependencyCachingUsageReport {}

async function runWrapper() {
  const logger = getActionsLogger();
  const startedAt = new Date();
  let config: Config | undefined;
  let uploadFailedSarifResult:
    | initActionPostHelper.UploadFailedSarifResult
    | undefined;
  let dependencyCachingUsage: DependencyCachingUsageReport | undefined;
  try {
    // Restore inputs from `init` Action.
    restoreInputs();

    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);

    const repositoryNwo = getRepositoryNwo();
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
      const codeql = await getCodeQL(config.codeQLCmd);

      uploadFailedSarifResult = await initActionPostHelper.run(
        debugArtifacts.tryUploadAllAvailableDebugArtifacts,
        printDebugLogs,
        codeql,
        config,
        repositoryNwo,
        features,
        logger,
      );

      // If we are analysing the default branch and some kind of caching is enabled,
      // then try to determine our overall cache usage for dependency caches. We only
      // do this under these circumstances to avoid slowing down analyses for PRs
      // and where caching may not be enabled.
      if (
        (await gitUtils.isAnalyzingDefaultBranch()) &&
        config.dependencyCachingEnabled !== CachingKind.None
      ) {
        dependencyCachingUsage = await getDependencyCacheUsage(logger);
      }
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
      dependency_caching_usage: dependencyCachingUsage,
    };
    logger.info("Sending status report for init-post step.");
    await sendStatusReport(statusReport);
    logger.info("Status report sent for init-post step.");
  }
}

void runWrapper();
