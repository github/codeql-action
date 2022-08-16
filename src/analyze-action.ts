import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import {
  CodeQLAnalysisError,
  QueriesStatusReport,
  runCleanup,
  runFinalize,
  runQueries,
} from "./analyze";
import { getGitHubVersionActionsOnly } from "./api-client";
import { getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import { uploadDatabases } from "./database-upload";
import { GitHubFeatureFlags } from "./feature-flags";
import { getActionsLogger, Logger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import { getTotalCacheSize, uploadTrapCaches } from "./trap-caching";
import * as upload_lib from "./upload-lib";
import { UploadResult } from "./upload-lib";
import * as util from "./util";

// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");

interface AnalysisStatusReport
  extends upload_lib.UploadStatusReport,
    QueriesStatusReport {}

interface FinishStatusReport
  extends actionsUtil.StatusReportBase,
    AnalysisStatusReport {}

interface FinishWithTrapUploadStatusReport extends FinishStatusReport {
  /** Size of TRAP caches that we uploaded, in bytes. */
  trap_cache_upload_size_bytes: number;
  /** Time taken to upload TRAP caches, in milliseconds. */
  trap_cache_upload_duration_ms: number;
}

export async function sendStatusReport(
  startedAt: Date,
  config: Config | undefined,
  stats: AnalysisStatusReport | undefined,
  error: Error | undefined,
  trapCacheUploadTime: number | undefined,
  didUploadTrapCaches: boolean,
  logger: Logger
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
  if (config && didUploadTrapCaches) {
    const trapCacheUploadStatusReport: FinishWithTrapUploadStatusReport = {
      ...statusReport,
      trap_cache_upload_duration_ms: trapCacheUploadTime || 0,
      trap_cache_upload_size_bytes: await getTotalCacheSize(
        config.trapCaches,
        logger
      ),
    };
    await actionsUtil.sendStatusReport(trapCacheUploadStatusReport);
  } else {
    await actionsUtil.sendStatusReport(statusReport);
  }
}

// REVIEW: Instead of returning the boolean and calling the method twice
// I could also update a top level variable in this file. Which is preferable?
function hasBadExpectErrorInput(): boolean {
  return (
    actionsUtil.getOptionalInput("expect-error") !== "false" &&
    !actionsUtil.isAnalyzingCodeQLActionRepoOrFork()
  );
}

async function run() {
  const startedAt = new Date();
  let uploadResult: UploadResult | undefined = undefined;
  let runStats: QueriesStatusReport | undefined = undefined;
  let config: Config | undefined = undefined;
  let trapCacheUploadTime: number | undefined = undefined;
  let didUploadTrapCaches = false;
  util.initializeEnvironment(util.Mode.actions, pkg.version);
  await util.checkActionVersion(pkg.version);

  const logger = getActionsLogger();
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
    config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?"
      );
    }

    if (hasBadExpectErrorInput()) {
      throw new Error(
        "`expect-error` input parameter is for internal use only. It should only be set by codeql-action or a fork."
      );
    }

    await util.enrichEnvironment(
      util.Mode.actions,
      await getCodeQL(config.codeQLCmd)
    );

    const apiDetails = {
      auth: actionsUtil.getRequiredInput("token"),
      url: util.getRequiredEnvParam("GITHUB_SERVER_URL"),
      apiURL: util.getRequiredEnvParam("GITHUB_API_URL"),
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

    // Possibly upload the TRAP caches for later re-use
    const trapCacheUploadStartTime = performance.now();
    const codeql = await getCodeQL(config.codeQLCmd);
    trapCacheUploadTime = performance.now() - trapCacheUploadStartTime;
    didUploadTrapCaches = await uploadTrapCaches(codeql, config, logger);

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
    // If we did not throw an error yet here, but we expect one, throw it.
    if (actionsUtil.getOptionalInput("expect-error") === "true") {
      core.setFailed(
        `expect-error input was set to true but no error was thrown.`
      );
    }
  } catch (origError) {
    const error =
      origError instanceof Error ? origError : new Error(String(origError));
    if (
      actionsUtil.getOptionalInput("expect-error") !== "true" ||
      hasBadExpectErrorInput()
    ) {
      core.setFailed(error.message);
    }

    console.log(error);

    if (error instanceof CodeQLAnalysisError) {
      const stats = { ...error.queriesStatusReport };
      await sendStatusReport(
        startedAt,
        config,
        stats,
        error,
        trapCacheUploadTime,
        didUploadTrapCaches,
        logger
      );
    } else {
      await sendStatusReport(
        startedAt,
        config,
        undefined,
        error,
        trapCacheUploadTime,
        didUploadTrapCaches,
        logger
      );
    }

    return;
  }

  if (runStats && uploadResult) {
    await sendStatusReport(
      startedAt,
      config,
      {
        ...runStats,
        ...uploadResult.statusReport,
      },
      undefined,
      trapCacheUploadTime,
      didUploadTrapCaches,
      logger
    );
  } else if (runStats) {
    await sendStatusReport(
      startedAt,
      config,
      { ...runStats },
      undefined,
      trapCacheUploadTime,
      didUploadTrapCaches,
      logger
    );
  } else {
    await sendStatusReport(
      startedAt,
      config,
      undefined,
      undefined,
      trapCacheUploadTime,
      didUploadTrapCaches,
      logger
    );
  }
}

export const runPromise = run();

async function runWrapper() {
  try {
    await runPromise;
  } catch (error) {
    if (
      actionsUtil.getOptionalInput("expect-error") !== "true" ||
      hasBadExpectErrorInput()
    ) {
      core.setFailed(`analyze action failed: ${error}`);
    }
    console.log(error);
  }
}

void runWrapper();
