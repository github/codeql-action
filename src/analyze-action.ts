import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import {
  CodeQLAnalysisError,
  QueriesStatusReport,
  runCleanup,
  runQueries,
  runFinalize,
} from "./analyze";
import { Config, getConfig } from "./config-utils";
import { uploadDatabases } from "./database-upload";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as upload_lib from "./upload-lib";
import { UploadStatusReport } from "./upload-lib";
import * as util from "./util";

// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");

interface AnalysisStatusReport
  extends upload_lib.UploadStatusReport,
    QueriesStatusReport {}

interface FinishStatusReport
  extends actionsUtil.StatusReportBase,
    AnalysisStatusReport {}

async function sendStatusReport(
  startedAt: Date,
  stats: AnalysisStatusReport | undefined,
  error?: Error
) {
  const status =
    stats?.analyze_failure_language !== undefined || error !== undefined
      ? "failure"
      : "success";
  const statusReportBase = await actionsUtil.createStatusReportBase(
    "finish",
    status,
    startedAt,
    error?.message,
    error?.stack
  );
  const statusReport: FinishStatusReport = {
    ...statusReportBase,
    ...(stats || {}),
  };
  await actionsUtil.sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  let uploadStats: UploadStatusReport | undefined = undefined;
  let runStats: QueriesStatusReport | undefined = undefined;
  let config: Config | undefined = undefined;
  util.initializeEnvironment(util.Mode.actions, pkg.version);

  try {
    if (
      !(await actionsUtil.sendStatusReport(
        await actionsUtil.createStatusReportBase(
          "finish",
          "starting",
          startedAt
        )
      ))
    ) {
      return;
    }
    const logger = getActionsLogger();
    config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?"
      );
    }

    const apiDetails = {
      auth: actionsUtil.getRequiredInput("token"),
      url: util.getRequiredEnvParam("GITHUB_SERVER_URL"),
    };
    const outputDir = actionsUtil.getRequiredInput("output");
    const threads = util.getThreadsFlag(
      actionsUtil.getOptionalInput("threads"),
      logger
    );
    await runFinalize(outputDir, threads, config, logger);
    if (actionsUtil.getRequiredInput("skip-queries") !== "true") {
      runStats = await runQueries(
        outputDir,
        util.getMemoryFlag(actionsUtil.getOptionalInput("ram")),
        util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")),
        threads,
        actionsUtil.getOptionalInput("category"),
        config,
        logger
      );
    }

    if (actionsUtil.getOptionalInput("cleanup-level") !== "none") {
      await runCleanup(
        config,
        actionsUtil.getOptionalInput("cleanup-level") || "brutal",
        logger
      );
    }

    const dbLocations: { [lang: string]: string } = {};
    for (const language of config.languages) {
      dbLocations[language] = util.getCodeQLDatabasePath(config, language);
    }
    core.setOutput("db-locations", dbLocations);

    if (runStats && actionsUtil.getRequiredInput("upload") === "true") {
      uploadStats = await upload_lib.uploadFromActions(
        outputDir,
        config.gitHubVersion,
        apiDetails,
        logger
      );
    } else {
      logger.info("Not uploading results");
    }

    const repositoryNwo = parseRepositoryNwo(
      util.getRequiredEnvParam("GITHUB_REPOSITORY")
    );
    await uploadDatabases(repositoryNwo, config, apiDetails, logger);
  } catch (error) {
    core.setFailed(error.message);
    console.log(error);

    if (error instanceof CodeQLAnalysisError) {
      const stats = { ...error.queriesStatusReport };
      await sendStatusReport(startedAt, stats, error);
    } else {
      await sendStatusReport(startedAt, undefined, error);
    }

    return;
  } finally {
    if (core.isDebug() && config !== undefined) {
      core.info("Debug mode is on. Printing CodeQL debug logs...");
      for (const language of config.languages) {
        const databaseDirectory = util.getCodeQLDatabasePath(config, language);
        const logsDirectory = path.join(databaseDirectory, "log");

        const walkLogFiles = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile()) {
              core.startGroup(
                `CodeQL Debug Logs - ${language} - ${entry.name}`
              );
              process.stdout.write(
                fs.readFileSync(path.resolve(dir, entry.name))
              );
              core.endGroup();
            } else if (entry.isDirectory()) {
              walkLogFiles(path.resolve(dir, entry.name));
            }
          }
        };
        walkLogFiles(logsDirectory);
      }
    }
  }

  if (runStats && uploadStats) {
    await sendStatusReport(startedAt, { ...runStats, ...uploadStats });
  } else if (runStats) {
    await sendStatusReport(startedAt, { ...runStats });
  } else {
    await sendStatusReport(startedAt, undefined);
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`analyze action failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
