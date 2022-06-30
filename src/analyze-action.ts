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
import { getGitHubVersionActionsOnly } from "./api-client";
import { CODEQL_VERSION_NEW_TRACING, getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import { uploadDatabases } from "./database-upload";
import { GitHubFeatureFlags } from "./feature-flags";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as upload_lib from "./upload-lib";
import { UploadResult } from "./upload-lib";
import * as util from "./util";
import { bundleDb, codeQlVersionAbove } from "./util";

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
  config: Config | undefined,
  stats: AnalysisStatusReport | undefined,
  error?: Error
) {
  const status = actionsUtil.getActionsStatus(
    error,
    stats?.analyze_failure_language
  );
  const statusReportBase = await actionsUtil.createStatusReportBase(
    "finish",
    status,
    startedAt,
    error?.message,
    error?.stack
  );
  const statusReport: FinishStatusReport = {
    ...statusReportBase,
    ...(config
      ? {
          ml_powered_javascript_queries:
            util.getMlPoweredJsQueriesStatus(config),
        }
      : {}),
    ...(stats || {}),
  };
  await actionsUtil.sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  let uploadResult: UploadResult | undefined = undefined;
  let runStats: QueriesStatusReport | undefined = undefined;
  let config: Config | undefined = undefined;
  util.initializeEnvironment(util.Mode.actions, pkg.version);
  await util.checkActionVersion(pkg.version);

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

    const repositoryNwo = parseRepositoryNwo(
      util.getRequiredEnvParam("GITHUB_REPOSITORY")
    );

    const gitHubVersion = await getGitHubVersionActionsOnly();

    const featureFlags = new GitHubFeatureFlags(
      gitHubVersion,
      apiDetails,
      repositoryNwo,
      logger
    );

    await runFinalize(outputDir, threads, memory, config, logger, featureFlags);
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
          outputDir,
          config.debugArtifactName
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
      await uploadDebugArtifacts(
        toUpload,
        config.dbLocation,
        config.debugArtifactName
      );
      if (!(await codeQlVersionAbove(codeql, CODEQL_VERSION_NEW_TRACING))) {
        // Before multi-language tracing, we wrote a compound-build-tracer.log in the temp dir
        await uploadDebugArtifacts(
          [path.resolve(config.tempDir, "compound-build-tracer.log")],
          config.tempDir,
          config.debugArtifactName
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
      uploadResult = await upload_lib.uploadFromActions(
        outputDir,
        config.gitHubVersion,
        apiDetails,
        logger
      );
      core.setOutput("sarif-id", uploadResult.sarifID);
    } else {
      logger.info("Not uploading results");
    }

    // Possibly upload the database bundles for remote queries
    await uploadDatabases(repositoryNwo, config, apiDetails, logger);

    // We don't upload results in test mode, so don't wait for processing
    if (util.isInTestMode()) {
      core.debug("In test mode. Waiting for processing is disabled.");
    } else if (
      uploadResult !== undefined &&
      actionsUtil.getRequiredInput("wait-for-processing") === "true"
    ) {
      await upload_lib.waitForProcessing(
        parseRepositoryNwo(util.getRequiredEnvParam("GITHUB_REPOSITORY")),
        uploadResult.sarifID,
        apiDetails,
        getActionsLogger()
      );
    }
  } catch (origError) {
    const error =
      origError instanceof Error ? origError : new Error(String(origError));
    core.setFailed(error.message);
    console.log(error);

    if (error instanceof CodeQLAnalysisError) {
      const stats = { ...error.queriesStatusReport };
      await sendStatusReport(startedAt, config, stats, error);
    } else {
      await sendStatusReport(startedAt, config, undefined, error);
    }

    return;
  } finally {
    if (config !== undefined && config.debugMode) {
      try {
        // Upload the database bundles as an Actions artifact for debugging
        const toUpload: string[] = [];
        for (const language of config.languages) {
          toUpload.push(
            await bundleDb(
              config,
              language,
              await getCodeQL(config.codeQLCmd),
              `${config.debugDatabaseName}-${language}`
            )
          );
        }
        await uploadDebugArtifacts(
          toUpload,
          config.dbLocation,
          config.debugArtifactName
        );
      } catch (error) {
        console.log(`Failed to upload database debug bundles: ${error}`);
      }
    }

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

  if (runStats && uploadResult) {
    await sendStatusReport(startedAt, config, {
      ...runStats,
      ...uploadResult.statusReport,
    });
  } else if (runStats) {
    await sendStatusReport(startedAt, config, { ...runStats });
  } else {
    await sendStatusReport(startedAt, config, undefined);
  }
}

async function uploadDebugArtifacts(
  toUpload: string[],
  rootDir: string,
  artifactName: string
) {
  let suffix = "";
  const matrix = actionsUtil.getRequiredInput("matrix");
  if (matrix !== undefined && matrix !== "null") {
    for (const entry of Object.entries(JSON.parse(matrix)).sort())
      suffix += `-${entry[1]}`;
  }
  await artifact.create().uploadArtifact(
    actionsUtil.sanitizeArifactName(`${artifactName}${suffix}`),
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
