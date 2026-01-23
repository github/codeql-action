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
  getWorkflowRunID,
  getWorkflowRunAttempt,
} from "./actions-util";
import { getApiClient, getGitHubVersion } from "./api-client";
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
  sendUnhandledErrorStatusReport,
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

/**
 * TEMPORARY: Test function to check if the GitHub API can detect workflow cancellation.
 * This queries the Jobs API to see the current job's status and step conclusions.
 */
async function testCancellationDetection(): Promise<void> {
  const logger = getActionsLogger();
  try {
    const apiClient = getApiClient();
    const runId = getWorkflowRunID();
    const attemptNumber = getWorkflowRunAttempt();
    const jobName = process.env["GITHUB_JOB"] || "";
    const repositoryNwo = getRepositoryNwo();

    logger.info(
      `[Cancellation Test] Querying jobs API for run ${runId}, attempt ${attemptNumber}, job "${jobName}"`,
    );

    const response = await apiClient.rest.actions.listJobsForWorkflowRunAttempt(
      {
        owner: repositoryNwo.owner,
        repo: repositoryNwo.repo,
        run_id: runId,
        attempt_number: attemptNumber,
      },
    );

    const currentJob = response.data.jobs.find((j) => j.name === jobName);

    if (currentJob) {
      logger.info(
        `[Cancellation Test] Current job status: ${currentJob.status}, conclusion: ${currentJob.conclusion}`,
      );

      // Log each step's status
      for (const step of currentJob.steps || []) {
        logger.info(
          `[Cancellation Test]   Step "${step.name}": status=${step.status}, conclusion=${step.conclusion}`,
        );
      }

      // Check if any step shows cancelled
      const hasCancelledStep = currentJob.steps?.some(
        (step) => step.conclusion === "cancelled",
      );
      logger.info(
        `[Cancellation Test] Has cancelled step: ${hasCancelledStep}`,
      );
    } else {
      logger.warning(
        `[Cancellation Test] Could not find job with name "${jobName}" in API response`,
      );
      logger.info(
        `[Cancellation Test] Available jobs: ${response.data.jobs.map((j) => j.name).join(", ")}`,
      );
    }
  } catch (error) {
    logger.warning(
      `[Cancellation Test] Failed to query API: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function run(startedAt: Date) {
  // To capture errors appropriately, keep as much code within the try-catch as
  // possible, and only use safe functions outside.

  const logger = getActionsLogger();
  let config: Config | undefined;
  let uploadFailedSarifResult:
    | initActionPostHelper.UploadFailedSarifResult
    | undefined;
  let dependencyCachingUsage: DependencyCachingUsageReport | undefined;
  try {
    // TEMPORARY: Test cancellation detection via API
    await testCancellationDetection();

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

async function runWrapper() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  try {
    await run(startedAt);
  } catch (error) {
    core.setFailed(`init post action failed: ${wrapError(error).message}`);
    await sendUnhandledErrorStatusReport(
      ActionName.InitPost,
      startedAt,
      error,
      logger,
    );
  }
}

void runWrapper();
