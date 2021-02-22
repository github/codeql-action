import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { determineAutobuildLanguage, runAutobuild } from "./autobuild";
import * as config_utils from "./config-utils";
import { Language } from "./languages";
import { getActionsLogger } from "./logging";

interface AutobuildStatusReport extends actionsUtil.StatusReportBase {
  // Comma-separated set of languages being auto-built
  autobuild_languages: string;
  // Language that failed autobuilding (or undefined if all languages succeeded).
  autobuild_failure?: string;
}

async function sendCompletedStatusReport(
  startedAt: Date,
  allLanguages: string[],
  failingLanguage?: string,
  cause?: Error
) {
  const status =
    failingLanguage !== undefined || cause !== undefined
      ? "failure"
      : "success";
  const statusReportBase = await actionsUtil.createStatusReportBase(
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
  await actionsUtil.sendStatusReport(statusReport);
}

async function run() {
  const logger = getActionsLogger();
  const startedAt = new Date();
  let language: Language | undefined = undefined;
  try {
    actionsUtil.prepareLocalRunEnvironment();
    if (
      !(await actionsUtil.sendStatusReport(
        await actionsUtil.createStatusReportBase(
          "autobuild",
          "starting",
          startedAt
        )
      ))
    ) {
      return;
    }

    const config = await config_utils.getConfig(
      actionsUtil.getTemporaryDirectory(),
      logger
    );
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?"
      );
    }
    language = determineAutobuildLanguage(config, logger);
    if (language !== undefined) {
      await runAutobuild(language, config, logger);
    }
  } catch (error) {
    core.setFailed(
      `We were unable to automatically build your code. Please replace the call to the autobuild action with your custom build steps.  ${error.message}`
    );
    console.log(error);
    await sendCompletedStatusReport(
      startedAt,
      language ? [language] : [],
      language,
      error
    );
    return;
  }

  await sendCompletedStatusReport(startedAt, language ? [language] : []);
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
