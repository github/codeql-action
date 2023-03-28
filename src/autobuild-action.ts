import * as core from "@actions/core";

import {
  createStatusReportBase,
  getActionsStatus,
  getActionVersion,
  getOptionalInput,
  getTemporaryDirectory,
  sendStatusReport,
  StatusReportBase,
} from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { determineAutobuildLanguages, runAutobuildScript } from "./autobuild";
import { getCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { Feature, Features } from "./feature-flags";
import { Language } from "./languages";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import { CODEQL_ACTION_DID_AUTOBUILD_GOLANG } from "./shared-environment";
import {
  checkGitHubVersionInRange,
  getRequiredEnvParam,
  initializeEnvironment,
} from "./util";

interface AutobuildStatusReport extends StatusReportBase {
  /** Comma-separated set of languages being auto-built. */
  autobuild_languages: string;
  /** Language that failed autobuilding (or undefined if all languages succeeded). */
  autobuild_failure?: string;
}

async function sendCompletedStatusReport(
  startedAt: Date,
  allLanguages: string[],
  failingLanguage?: string,
  cause?: Error
) {
  initializeEnvironment(getActionVersion());

  const status = getActionsStatus(cause, failingLanguage);
  const statusReportBase = await createStatusReportBase(
    "autobuild",
    status,
    startedAt,
    cause?.message,
    cause?.stack
  );
  const statusReport: AutobuildStatusReport = {
    ...statusReportBase,
    autobuild_languages: allLanguages.join(","),
    autobuild_failure: failingLanguage,
  };
  await sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  let currentLanguage: Language | undefined = undefined;
  let languages: Language[] | undefined = undefined;
  try {
    if (
      !(await sendStatusReport(
        await createStatusReportBase("autobuild", "starting", startedAt)
      ))
    ) {
      return;
    }

    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);

    const config = await configUtils.getConfig(getTemporaryDirectory(), logger);
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?"
      );
    }

    const repositoryNwo = parseRepositoryNwo(
      getRequiredEnvParam("GITHUB_REPOSITORY")
    );

    const features = new Features(
      gitHubVersion,
      repositoryNwo,
      getTemporaryDirectory(),
      logger
    );

    const codeql = await getCodeQL(config.codeQLCmd);
    const workingDirectory = getOptionalInput("working-directory");

    if (await features.getValue(Feature.CliAutobuildEnabled, codeql)) {
      logger.debug("Autobuilding using the CLI.");
      await codeql.databaseAutobuild(config.dbLocation, workingDirectory);
    } else {
      logger.debug("Autobuilding using the Action.");
      languages = await determineAutobuildLanguages(config, logger);
      if (languages !== undefined) {
        if (workingDirectory) {
          logger.info(
            `Changing autobuilder working directory to ${workingDirectory}`
          );
          process.chdir(workingDirectory);
        }
        for (const language of languages) {
          currentLanguage = language;
          await runAutobuildScript(language, config, logger);
          if (language === Language.go) {
            core.exportVariable(CODEQL_ACTION_DID_AUTOBUILD_GOLANG, "true");
          }
        }
      }
    }
  } catch (error) {
    core.setFailed(
      `We were unable to automatically build your code. Please replace the call to the autobuild action with your custom build steps.  ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    console.log(error);
    await sendCompletedStatusReport(
      startedAt,
      languages ?? [],
      currentLanguage,
      error instanceof Error ? error : new Error(String(error))
    );
    return;
  }

  await sendCompletedStatusReport(startedAt, languages ?? []);
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`autobuild action failed. ${error}`);
    console.log(error);
  }
}

void runWrapper();
