/**
 * This file is the entry point for the `post:` hook of `init-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */

import * as core from "@actions/core";

import { runInActions, type Action, type ActionState } from "./action-common";
import {
  getOptionalInput,
  getTemporaryDirectory,
  printDebugLogs,
} from "./actions-util";
import { getGitHubVersion, wrapApiConfigurationError } from "./api-client";
import { CachingKind } from "./caching-utils";
import { getCodeQL } from "./codeql";
import {
  hasConfigKey,
  type AbortedInitConfig,
  type Config,
} from "./config/action-config";
import { getAbortedInitConfig, getConfig } from "./config-utils";
import * as debugArtifacts from "./debug-artifacts";
import {
  DependencyCachingUsageReport,
  getDependencyCacheUsage,
} from "./dependency-caching";
import { EnvVar, type ReadOnlyEnv } from "./environment";
import { initFeatures } from "./feature-flags";
import * as gitUtils from "./git-utils";
import * as initActionPostHelper from "./init-action-post-helper";
import { getRepositoryNwo } from "./repository";
import {
  StatusReportBase,
  sendStatusReport,
  createStatusReportBase,
  getActionsStatus,
  ActionName,
  getJobStatusDisplayName,
  JobStatus,
} from "./status-report";
import { checkDiskUsage, checkGitHubVersionInRange, wrapError } from "./util";

interface InitPostStatusReport
  extends StatusReportBase,
    initActionPostHelper.UploadFailedSarifResult,
    initActionPostHelper.JobStatusReport,
    initActionPostHelper.DependencyCachingUsageReport {}

async function run(action: ActionState<["Base", "Logger", "Env"]>) {
  // To capture errors appropriately, keep as much code within the try-catch as
  // possible, and only use safe functions outside.
  const logger = action.logger;

  let config: Config | AbortedInitConfig | undefined;
  let uploadFailedSarifResult:
    | initActionPostHelper.UploadFailedSarifResult
    | undefined;
  let dependencyCachingUsage: DependencyCachingUsageReport | undefined;

  try {
    // Read the job status before restoring inputs, since it is provided by the Actions runtime
    // environment for this step and would otherwise be overwritten by the value that the `init`
    // Action saw, which is always a success.
    const jobStatus = getOptionalInput("job-status");

    const tmpDir = getTemporaryDirectory();
    config = await getConfig(tmpDir, logger);

    // If we weren't able to read the normal configuration file, the `init` step failed before it could write it.
    // Try to load the "failed" configuration file instead which may have been written by the `init` step
    // with a minimal configuration for this post-action.
    if (config === undefined) {
      logger.debug(
        "Will try to load the configuration file from an aborted 'init' step, since there is no regular one.",
      );
      config = getAbortedInitConfig(action, tmpDir);
    }

    const gitHubVersion = config?.gitHubVersion ?? (await getGitHubVersion());
    checkGitHubVersionInRange(gitHubVersion, logger);

    const repositoryNwo = getRepositoryNwo();
    const features = initFeatures(
      gitHubVersion,
      repositoryNwo,
      getTemporaryDirectory(),
      logger,
    );

    if (config === undefined) {
      logger.warning(
        "Debugging artifacts are unavailable since the 'init' Action failed before it could produce any.",
      );
    } else {
      const codeql = await getCodeQL(logger, config.codeQLCmd);

      uploadFailedSarifResult = await initActionPostHelper.uploadFailureInfo(
        debugArtifacts.tryUploadAllAvailableDebugArtifacts,
        printDebugLogs,
        codeql,
        config,
        repositoryNwo,
        features,
        jobStatus,
        action.env,
        logger,
      );

      // If we are analyzing the default branch and some kind of caching is enabled,
      // then try to determine our overall cache usage for dependency caches. We only
      // do this under these circumstances to avoid slowing down analyses for PRs
      // and where caching may not be enabled.
      if (
        (await gitUtils.isAnalyzingDefaultBranch(
          action.env,
          config.repositoryRoot,
        )) &&
        hasConfigKey(config, "dependencyCachingEnabled") &&
        config.dependencyCachingEnabled !== CachingKind.None
      ) {
        dependencyCachingUsage = await getDependencyCacheUsage(logger);
      }
    }
  } catch (unwrappedError) {
    const error = wrapApiConfigurationError(wrapError(unwrappedError));
    core.setFailed(error.message);

    const statusReportBase = await createStatusReportBase(
      action.name,
      getActionsStatus(error),
      action.startedAt,
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
  const jobStatus = getFinalJobStatus(action, config);
  logger.info(`CodeQL job status was ${getJobStatusDisplayName(jobStatus)}.`);

  const statusReportBase = await createStatusReportBase(
    action.name,
    "success",
    action.startedAt,
    config,
    await checkDiskUsage(logger),
    logger,
  );
  if (statusReportBase !== undefined) {
    const statusReport: InitPostStatusReport = {
      ...statusReportBase,
      ...uploadFailedSarifResult,
      job_status: jobStatus,
      dependency_caching_usage: dependencyCachingUsage,
    };
    logger.info("Sending status report for init-post step.");
    await sendStatusReport(statusReport);
    logger.info("Status report sent for init-post step.");
  }
}

/**
 * Determine the final job status to be reported in the status report.
 *
 * If the job status has already been set by another step, we use that.
 * Otherwise, we determine the job status based on whether the analyze step
 * completed successfully and whether we have a valid CodeQL config.
 */
function getFinalJobStatus(
  action: ActionState<["Env"]>,
  config: Partial<Config> | undefined,
): JobStatus {
  const existingJobStatus = getJobStatusFromEnvironment(action.env);
  if (existingJobStatus !== undefined) {
    return existingJobStatus;
  }

  let jobStatus: JobStatus;

  if (
    action.env.getOptional(EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY) === "true"
  ) {
    action.env.export(EnvVar.JOB_STATUS, JobStatus.SuccessStatus);
    jobStatus = JobStatus.SuccessStatus;
  } else if (config !== undefined) {
    // - We have computed a CodeQL config
    // - Analyze didn't complete successfully
    // - The job status hasn't already been set to Failure/ConfigurationError
    //
    // This means that something along the way failed in a step that is not
    // owned by the Action, for example a manual build step. We consider this a
    // configuration error.
    jobStatus = JobStatus.ConfigErrorStatus;
  } else {
    // If we didn't manage to compute a CodeQL config, it is unclear at this
    // point why the analyze Action didn't complete.
    // - One possibility is that the workflow run was cancelled. We could
    //   consider determining workflow cancellation using the GitHub API, but
    //   for now we treat all these cases as unknown.
    // - Another possibility is that we're running a workflow that only runs
    //   `init`, for instance a workflow that was created before `setup-codeql`
    //   was available and uses `init` just to set up the CodeQL tools.
    jobStatus = JobStatus.UnknownStatus;
  }

  // This shouldn't be necessary, but in the odd case that we run more than one
  // `init` post step, ensure the job status is consistent between them.
  action.env.export(EnvVar.JOB_STATUS, jobStatus);
  return jobStatus;
}

/**
 * Get the job status from the environment variable, if it has been set.
 *
 * If the job status is invalid, return `UnknownStatus`.
 */
function getJobStatusFromEnvironment(env: ReadOnlyEnv): JobStatus | undefined {
  const jobStatusFromEnvironment = env.getOptional(EnvVar.JOB_STATUS);

  if (jobStatusFromEnvironment !== undefined) {
    // Validate the job status from the environment. If it is invalid, return unknown.
    if (
      Object.values(JobStatus).includes(jobStatusFromEnvironment as JobStatus)
    ) {
      return jobStatusFromEnvironment as JobStatus;
    }
    return JobStatus.UnknownStatus;
  }

  return undefined;
}

const initPost: Action = {
  name: ActionName.InitPost,
  run,
};

export async function runWrapper() {
  return await runInActions(initPost);
}
