import * as core from "@actions/core";
import { v4 as uuidV4 } from "uuid";

import {
  getActionVersion,
  getOptionalInput,
  getRequiredInput,
  getTemporaryDirectory,
} from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { CodeQL } from "./codeql";
import { EnvVar } from "./environment";
import { Features } from "./feature-flags";
import { initCodeQL } from "./init";
import { getActionsLogger, Logger } from "./logging";
import { getRepositoryNwo } from "./repository";
import { ToolsSource } from "./setup-codeql";
import {
  ActionName,
  InitStatusReport,
  InitToolsDownloadFields,
  createStatusReportBase,
  getActionsStatus,
  sendStatusReport,
} from "./status-report";
import { ToolsDownloadStatusReport } from "./tools-download";
import {
  checkDiskUsage,
  checkForTimeout,
  checkGitHubVersionInRange,
  getRequiredEnvParam,
  initializeEnvironment,
  ConfigurationError,
  wrapError,
  checkActionVersion,
  getErrorMessage,
} from "./util";

/**
 * Helper function to send a full status report for this action.
 */
async function sendCompletedStatusReport(
  startedAt: Date,
  toolsDownloadStatusReport: ToolsDownloadStatusReport | undefined,
  toolsFeatureFlagsValid: boolean | undefined,
  toolsSource: ToolsSource,
  toolsVersion: string,
  logger: Logger,
  error?: Error,
): Promise<void> {
  const statusReportBase = await createStatusReportBase(
    ActionName.SetupCodeQL,
    getActionsStatus(error),
    startedAt,
    undefined,
    await checkDiskUsage(logger),
    logger,
    error?.message,
    error?.stack,
  );

  if (statusReportBase === undefined) {
    return;
  }

  const initStatusReport: InitStatusReport = {
    ...statusReportBase,
    tools_input: getOptionalInput("tools") || "",
    tools_resolved_version: toolsVersion,
    tools_source: toolsSource || ToolsSource.Unknown,
    workflow_languages: "",
  };

  const initToolsDownloadFields: InitToolsDownloadFields = {};

  if (toolsDownloadStatusReport?.downloadDurationMs !== undefined) {
    initToolsDownloadFields.tools_download_duration_ms =
      toolsDownloadStatusReport.downloadDurationMs;
  }
  if (toolsFeatureFlagsValid !== undefined) {
    initToolsDownloadFields.tools_feature_flags_valid = toolsFeatureFlagsValid;
  }

  await sendStatusReport({ ...initStatusReport, ...initToolsDownloadFields });
}

/** The main behaviour of this action. */
async function run(): Promise<void> {
  const startedAt = new Date();
  const logger = getActionsLogger();
  initializeEnvironment(getActionVersion());

  let codeql: CodeQL;
  let toolsDownloadStatusReport: ToolsDownloadStatusReport | undefined;
  let toolsFeatureFlagsValid: boolean | undefined;
  let toolsSource: ToolsSource;
  let toolsVersion: string;

  const apiDetails = {
    auth: getRequiredInput("token"),
    externalRepoAuth: getOptionalInput("external-repository-token"),
    url: getRequiredEnvParam("GITHUB_SERVER_URL"),
    apiURL: getRequiredEnvParam("GITHUB_API_URL"),
  };

  const gitHubVersion = await getGitHubVersion();
  checkGitHubVersionInRange(gitHubVersion, logger);
  checkActionVersion(getActionVersion(), gitHubVersion);

  const repositoryNwo = getRepositoryNwo();

  const features = new Features(
    gitHubVersion,
    repositoryNwo,
    getTemporaryDirectory(),
    logger,
  );

  const jobRunUuid = uuidV4();
  logger.info(`Job run UUID is ${jobRunUuid}.`);
  core.exportVariable(EnvVar.JOB_RUN_UUID, jobRunUuid);

  try {
    const statusReportBase = await createStatusReportBase(
      ActionName.SetupCodeQL,
      "starting",
      startedAt,
      undefined,
      await checkDiskUsage(logger),
      logger,
    );
    if (statusReportBase !== undefined) {
      await sendStatusReport(statusReportBase);
    }
    const codeQLDefaultVersionInfo = await features.getDefaultCliVersion(
      gitHubVersion.type,
    );
    toolsFeatureFlagsValid = codeQLDefaultVersionInfo.toolsFeatureFlagsValid;
    const initCodeQLResult = await initCodeQL(
      getOptionalInput("tools"),
      apiDetails,
      getTemporaryDirectory(),
      gitHubVersion.type,
      codeQLDefaultVersionInfo,
      features,
      logger,
    );
    codeql = initCodeQLResult.codeql;
    toolsDownloadStatusReport = initCodeQLResult.toolsDownloadStatusReport;
    toolsVersion = initCodeQLResult.toolsVersion;
    toolsSource = initCodeQLResult.toolsSource;

    core.setOutput("codeql-path", codeql.getPath());
    core.setOutput("codeql-version", (await codeql.getVersion()).version);

    core.exportVariable(EnvVar.SETUP_CODEQL_ACTION_HAS_RUN, "true");
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    core.setFailed(error.message);
    const statusReportBase = await createStatusReportBase(
      ActionName.SetupCodeQL,
      error instanceof ConfigurationError ? "user-error" : "failure",
      startedAt,
      undefined,
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

  await sendCompletedStatusReport(
    startedAt,
    toolsDownloadStatusReport,
    toolsFeatureFlagsValid,
    toolsSource,
    toolsVersion,
    logger,
  );
}

/** Run the action and catch any unhandled errors. */
async function runWrapper(): Promise<void> {
  try {
    await run();
  } catch (error) {
    core.setFailed(`setup-codeql action failed: ${getErrorMessage(error)}`);
  }
  await checkForTimeout();
}

void runWrapper();
