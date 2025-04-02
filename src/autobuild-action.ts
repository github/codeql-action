import * as core from "@actions/core";

import {
  getActionVersion,
  getOptionalInput,
  getTemporaryDirectory,
} from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { determineAutobuildLanguages, runAutobuild } from "./autobuild";
import { getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import { EnvVar } from "./environment";
import { Language } from "./languages";
import { Logger, getActionsLogger } from "./logging";
import {
  StatusReportBase,
  getActionsStatus,
  createStatusReportBase,
  sendStatusReport,
  ActionName,
} from "./status-report";
import { endTracingForCluster } from "./tracer-config";
import {
  checkActionVersion,
  checkDiskUsage,
  checkGitHubVersionInRange,
  getErrorMessage,
  initializeEnvironment,
  wrapError,
} from "./util";

interface AutobuildStatusReport extends StatusReportBase {
  /** Comma-separated set of languages being auto-built. */
  autobuild_languages: string;
  /** Language that failed autobuilding (or undefined if all languages succeeded). */
  autobuild_failure?: string;
}

async function sendCompletedStatusReport(
  config: Config | undefined,
  logger: Logger,
  startedAt: Date,
  allLanguages: string[],
  failingLanguage?: string,
  cause?: Error,
) {
  initializeEnvironment(getActionVersion());

  const status = getActionsStatus(cause, failingLanguage);
  const statusReportBase = await createStatusReportBase(
    ActionName.Autobuild,
    status,
    startedAt,
    config,
    await checkDiskUsage(logger),
    logger,
    cause?.message,
    cause?.stack,
  );
  if (statusReportBase !== undefined) {
    const statusReport: AutobuildStatusReport = {
      ...statusReportBase,
      autobuild_languages: allLanguages.join(","),
      autobuild_failure: failingLanguage,
    };
    await sendStatusReport(statusReport);
  }
}

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  let config: Config | undefined;
  let currentLanguage: Language | undefined;
  let languages: Language[] | undefined;
  try {
    const statusReportBase = await createStatusReportBase(
      ActionName.Autobuild,
      "starting",
      startedAt,
      config,
      await checkDiskUsage(logger),
      logger,
    );
    if (statusReportBase !== undefined) {
      await sendStatusReport(statusReportBase);
    }

    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);
    checkActionVersion(getActionVersion(), gitHubVersion);

    config = await getConfig(getTemporaryDirectory(), logger);
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?",
      );
    }

    const codeql = await getCodeQL(config.codeQLCmd);

    languages = await determineAutobuildLanguages(codeql, config, logger);
    if (languages !== undefined) {
      const workingDirectory = getOptionalInput("working-directory");
      if (workingDirectory) {
        logger.info(
          `Changing autobuilder working directory to ${workingDirectory}`,
        );
        process.chdir(workingDirectory);
      }
      for (const language of languages) {
        currentLanguage = language;
        await runAutobuild(config, language, logger);
      }
    }

    // End tracing early to avoid tracing analyze. This improves the performance and reliability of
    // the analyze step.
    await endTracingForCluster(codeql, config, logger);
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    core.setFailed(
      `We were unable to automatically build your code. Please replace the call to the autobuild action with your custom build steps. ${error.message}`,
    );
    await sendCompletedStatusReport(
      config,
      logger,
      startedAt,
      languages ?? [],
      currentLanguage,
      error,
    );
    return;
  }

  core.exportVariable(EnvVar.AUTOBUILD_DID_COMPLETE_SUCCESSFULLY, "true");

  await sendCompletedStatusReport(config, logger, startedAt, languages ?? []);
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`autobuild action failed. ${getErrorMessage(error)}`);
  }
}

void runWrapper();
