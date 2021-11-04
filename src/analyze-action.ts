import * as fs from "fs";
import * as path from "path";

import * as artifact from "@actions/artifact";
import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import {
  CodeQLAnalysisError,
  QueriesStatusReport,
  runCleanup,
  runQueries,
  runFinalize,
} from "./analyze";
import { CODEQL_VERSION_NEW_TRACING, getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import { uploadDatabases } from "./database-upload";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as upload_lib from "./upload-lib";
import { UploadStatusReport } from "./upload-lib";
import * as util from "./util";
import { bundleDb, codeQlVersionAbove, DEBUG_ARTIFACT_NAME } from "./util";

// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");

interface AnalysisStatusReport
  extends upload_lib.UploadStatusReport,
    QueriesStatusReport {}

interface FinishStatusReport
  extends actionsUtil.StatusReportBase,
    AnalysisStatusReport {}

export async function sendStatusReport(
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
    await util.enrichEnvironment(
      util.Mode.actions,
      await getCodeQL(config.codeQLCmd)
    );

    const apiDetails = {
      auth: actionsUtil.getRequiredInput("token"),
      url: util.getRequiredEnvParam("GITHUB_SERVER_URL"),
    };
    const outputDir = actionsUtil.getRequiredInput("output");
    const threads = util.getThreadsFlag(
      actionsUtil.getOptionalInput("threads") || process.env["CODEQL_THREADS"],
      logger
    );
    const memory = util.getMemoryFlag(
      actionsUtil.getOptionalInput("ram") || process.env["CODEQL_RAM"]
    );
    await runFinalize(outputDir, threads, memory, config, logger);
    if (actionsUtil.getRequiredInput("skip-queries") !== "true") {
      runStats = await runQueries(
        outputDir,
        memory,
        util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")),
        threads,
        actionsUtil.getOptionalInput("category"),
        config,
        logger
      );

      if (config.debugMode) {
        // Upload the SARIF files as an Actions artifact for debugging
        await uploadDebugArtifacts(
          config.languages.map((lang) =>
            path.resolve(outputDir, `${lang}.sarif`)
          ),
          outputDir
        );
      }
    }

    const codeql = await getCodeQL(config.codeQLCmd);

    if (config.debugMode) {
      // Upload the logs as an Actions artifact for debugging
      const toUpload: string[] = [];
      for (const language of config.languages) {
        toUpload.push(
          ...listFolder(
            path.resolve(util.getCodeQLDatabasePath(config, language), "log")
          )
        );
      }
      if (await codeQlVersionAbove(codeql, CODEQL_VERSION_NEW_TRACING)) {
        // Multilanguage tracing: there are additional logs in the root of the cluster
        toUpload.push(...listFolder(path.resolve(config.dbLocation, "log")));
      }
      await uploadDebugArtifacts(toUpload, config.dbLocation);
      if (!(await codeQlVersionAbove(codeql, CODEQL_VERSION_NEW_TRACING))) {
        // Before multi-language tracing, we wrote a compound-build-tracer.log in the temp dir
        await uploadDebugArtifacts(
          [path.resolve(config.tempDir, "compound-build-tracer.log")],
          config.tempDir
        );
      }
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
    await uploadDatabases(repositoryNwo, config, apiDetails, logger); // Possibly upload the database bundles for remote queries

    if (config.debugMode) {
      // Upload the database bundles as an Actions artifact for debugging
      const toUpload: string[] = [];
      for (const language of config.languages)
        toUpload.push(await bundleDb(config, language, codeql));
      await uploadDebugArtifacts(toUpload, config.dbLocation);
    }
  } catch (origError) {
    const error =
      origError instanceof Error ? origError : new Error(String(origError));
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

async function uploadDebugArtifacts(toUpload: string[], rootDir: string) {
  let suffix = "";
  const matrix = actionsUtil.getRequiredInput("matrix");
  if (matrix !== undefined && matrix !== "null") {
    for (const entry of Object.entries(JSON.parse(matrix)).sort())
      suffix += `-${entry[1]}`;
  }
  await artifact.create().uploadArtifact(
    `${DEBUG_ARTIFACT_NAME}${suffix}`,
    toUpload.map((file) => path.normalize(file)),
    path.normalize(rootDir)
  );
}

function listFolder(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isFile()) {
      files.push(path.resolve(dir, entry.name));
    } else if (entry.isDirectory()) {
      files.push(...listFolder(path.resolve(dir, entry.name)));
    }
  }
  return files;
}

export const runPromise = run();

async function runWrapper() {
  try {
    await runPromise;
  } catch (error) {
    core.setFailed(`analyze action failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
