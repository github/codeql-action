import * as fs from "fs";
import path from "path";
import { performance } from "perf_hooks";

import * as core from "@actions/core";
import * as github from "@actions/github";

import * as actionsUtil from "./actions-util";
import {
  CodeQLAnalysisError,
  dbIsFinalized,
  QueriesStatusReport,
  runCleanup,
  runFinalize,
  runQueries,
  setupDiffInformedQueryRun,
  warnIfGoInstalledAfterInit,
} from "./analyze";
import { getApiDetails, getGitHubVersion } from "./api-client";
import { runAutobuild } from "./autobuild";
import { getTotalCacheSize, shouldStoreCache } from "./caching-utils";
import { getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import { uploadDatabases } from "./database-upload";
import { uploadDependencyCaches } from "./dependency-caching";
import { EnvVar } from "./environment";
import { Features } from "./feature-flags";
import { Language } from "./languages";
import { getActionsLogger, Logger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as statusReport from "./status-report";
import {
  ActionName,
  createStatusReportBase,
  DatabaseCreationTimings,
  getActionsStatus,
  StatusReportBase,
} from "./status-report";
import {
  cleanupTrapCaches,
  TrapCacheCleanupStatusReport,
  uploadTrapCaches,
} from "./trap-caching";
import * as uploadLib from "./upload-lib";
import { UploadResult } from "./upload-lib";
import * as util from "./util";

interface AnalysisStatusReport
  extends uploadLib.UploadStatusReport,
    QueriesStatusReport {}

interface FinishStatusReport
  extends StatusReportBase,
    DatabaseCreationTimings,
    AnalysisStatusReport {}

interface FinishWithTrapUploadStatusReport extends FinishStatusReport {
  /** Size of TRAP caches that we uploaded, in bytes. */
  trap_cache_upload_size_bytes: number;
  /** Time taken to upload TRAP caches, in milliseconds. */
  trap_cache_upload_duration_ms: number;
}

async function sendStatusReport(
  startedAt: Date,
  config: Config | undefined,
  stats: AnalysisStatusReport | undefined,
  error: Error | undefined,
  trapCacheUploadTime: number | undefined,
  dbCreationTimings: DatabaseCreationTimings | undefined,
  didUploadTrapCaches: boolean,
  trapCacheCleanup: TrapCacheCleanupStatusReport | undefined,
  logger: Logger,
) {
  const status = getActionsStatus(error, stats?.analyze_failure_language);
  const statusReportBase = await createStatusReportBase(
    ActionName.Analyze,
    status,
    startedAt,
    config,
    await util.checkDiskUsage(logger),
    logger,
    error?.message,
    error?.stack,
  );
  if (statusReportBase !== undefined) {
    const report: FinishStatusReport = {
      ...statusReportBase,
      ...(stats || {}),
      ...(dbCreationTimings || {}),
      ...(trapCacheCleanup || {}),
    };
    if (config && didUploadTrapCaches) {
      const trapCacheUploadStatusReport: FinishWithTrapUploadStatusReport = {
        ...report,
        trap_cache_upload_duration_ms: Math.round(trapCacheUploadTime || 0),
        trap_cache_upload_size_bytes: Math.round(
          await getTotalCacheSize(Object.values(config.trapCaches), logger),
        ),
      };
      await statusReport.sendStatusReport(trapCacheUploadStatusReport);
    } else {
      await statusReport.sendStatusReport(report);
    }
  }
}

// `expect-error` should only be set to a non-false value by the CodeQL Action PR checks.
function hasBadExpectErrorInput(): boolean {
  return (
    actionsUtil.getOptionalInput("expect-error") !== "false" &&
    !util.isInTestMode()
  );
}

/**
 * Returns whether any TRAP files exist under the `db-go` folder,
 * indicating whether Go extraction has extracted at least one file.
 */
function doesGoExtractionOutputExist(config: Config): boolean {
  const golangDbDirectory = util.getCodeQLDatabasePath(config, Language.go);
  const trapDirectory = path.join(golangDbDirectory, "trap", Language.go);
  return (
    fs.existsSync(trapDirectory) &&
    fs
      .readdirSync(trapDirectory)
      .some((fileName) =>
        [
          ".trap",
          ".trap.gz",
          ".trap.br",
          ".trap.tar.gz",
          ".trap.tar.br",
          ".trap.tar",
        ].some((ext) => fileName.endsWith(ext)),
      )
  );
}

/**
 * We attempt to autobuild Go to preserve compatibility for users who have
 * set up Go using a legacy scanning style CodeQL workflow, i.e. one without
 * an autobuild step or manual build steps.
 *
 * - We detect whether an autobuild step is present by checking the
 * `CODEQL_ACTION_DID_AUTOBUILD_GOLANG` environment variable, which is set
 * when the autobuilder is invoked.
 * - We detect whether the Go database has already been finalized in case it
 * has been manually set in a prior Action step.
 * - We approximate whether manual build steps are present by looking at
 * whether any extraction output already exists for Go.
 */
async function runAutobuildIfLegacyGoWorkflow(config: Config, logger: Logger) {
  if (!config.languages.includes(Language.go)) {
    return;
  }
  if (config.buildMode) {
    logger.debug(
      "Skipping legacy Go autobuild since a build mode has been specified.",
    );
    return;
  }
  if (process.env[EnvVar.DID_AUTOBUILD_GOLANG] === "true") {
    logger.debug("Won't run Go autobuild since it has already been run.");
    return;
  }
  if (dbIsFinalized(config, Language.go, logger)) {
    logger.debug(
      "Won't run Go autobuild since there is already a finalized database for Go.",
    );
    return;
  }
  // This captures whether a user has added manual build steps for Go
  if (doesGoExtractionOutputExist(config)) {
    logger.debug(
      "Won't run Go autobuild since at least one file of Go code has already been extracted.",
    );
    // If the user has run the manual build step, and has set the `CODEQL_EXTRACTOR_GO_BUILD_TRACING`
    // variable, we suggest they remove it from their workflow.
    if ("CODEQL_EXTRACTOR_GO_BUILD_TRACING" in process.env) {
      logger.warning(
        `The CODEQL_EXTRACTOR_GO_BUILD_TRACING environment variable has no effect on workflows with manual build steps, so we recommend that you remove it from your workflow.`,
      );
    }
    return;
  }
  logger.debug(
    "Running Go autobuild because extraction output (TRAP files) for Go code has not been found.",
  );
  await runAutobuild(config, Language.go, logger);
}

async function run() {
  const startedAt = new Date();
  let uploadResult: UploadResult | undefined = undefined;
  let runStats: QueriesStatusReport | undefined = undefined;
  let config: Config | undefined = undefined;
  let trapCacheCleanupTelemetry: TrapCacheCleanupStatusReport | undefined =
    undefined;
  let trapCacheUploadTime: number | undefined = undefined;
  let dbCreationTimings: DatabaseCreationTimings | undefined = undefined;
  let didUploadTrapCaches = false;
  util.initializeEnvironment(actionsUtil.getActionVersion());

  // Unset the CODEQL_PROXY_* environment variables, as they are not needed
  // and can cause issues with the CodeQL CLI
  // Check for CODEQL_PROXY_HOST: and if it is empty but set, unset it
  if (process.env.CODEQL_PROXY_HOST === "") {
    delete process.env.CODEQL_PROXY_HOST;
    delete process.env.CODEQL_PROXY_PORT;
    delete process.env.CODEQL_PROXY_CA_CERTIFICATE;
  }

  // Make inputs accessible in the `post` step, details at
  // https://github.com/github/codeql-action/issues/2553
  actionsUtil.persistInputs();

  const logger = getActionsLogger();
  try {
    const statusReportBase = await createStatusReportBase(
      ActionName.Analyze,
      "starting",
      startedAt,
      config,
      await util.checkDiskUsage(logger),
      logger,
    );
    if (statusReportBase !== undefined) {
      await statusReport.sendStatusReport(statusReportBase);
    }

    config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
    if (config === undefined) {
      throw new Error(
        "Config file could not be found at expected location. Has the 'init' action been called?",
      );
    }

    const codeql = await getCodeQL(config.codeQLCmd);

    if (hasBadExpectErrorInput()) {
      throw new util.ConfigurationError(
        "`expect-error` input parameter is for internal use only. It should only be set by codeql-action or a fork.",
      );
    }

    const apiDetails = getApiDetails();
    const outputDir = actionsUtil.getRequiredInput("output");
    core.exportVariable(EnvVar.SARIF_RESULTS_OUTPUT_DIR, outputDir);
    const threads = util.getThreadsFlag(
      actionsUtil.getOptionalInput("threads") || process.env["CODEQL_THREADS"],
      logger,
    );

    const repositoryNwo = parseRepositoryNwo(
      util.getRequiredEnvParam("GITHUB_REPOSITORY"),
    );

    const gitHubVersion = await getGitHubVersion();

    util.checkActionVersion(actionsUtil.getActionVersion(), gitHubVersion);

    const features = new Features(
      gitHubVersion,
      repositoryNwo,
      actionsUtil.getTemporaryDirectory(),
      logger,
    );

    const memory = util.getMemoryFlag(
      actionsUtil.getOptionalInput("ram") || process.env["CODEQL_RAM"],
      logger,
    );

    const pull_request = github.context.payload.pull_request;
    const diffRangePackDir =
      pull_request &&
      (await setupDiffInformedQueryRun(
        pull_request.base.ref as string,
        pull_request.head.label as string,
        codeql,
        logger,
        features,
      ));

    await warnIfGoInstalledAfterInit(config, logger);
    await runAutobuildIfLegacyGoWorkflow(config, logger);

    dbCreationTimings = await runFinalize(
      outputDir,
      threads,
      memory,
      codeql,
      config,
      logger,
    );

    if (actionsUtil.getRequiredInput("skip-queries") !== "true") {
      runStats = await runQueries(
        outputDir,
        memory,
        util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")),
        threads,
        diffRangePackDir,
        actionsUtil.getOptionalInput("category"),
        config,
        logger,
        features,
      );
    }

    if (actionsUtil.getOptionalInput("cleanup-level") !== "none") {
      await runCleanup(
        config,
        actionsUtil.getOptionalInput("cleanup-level") || "brutal",
        logger,
      );
    }

    const dbLocations: { [lang: string]: string } = {};
    for (const language of config.languages) {
      dbLocations[language] = util.getCodeQLDatabasePath(config, language);
    }
    core.setOutput("db-locations", dbLocations);
    core.setOutput("sarif-output", path.resolve(outputDir));
    const uploadInput = actionsUtil.getOptionalInput("upload");
    if (runStats && actionsUtil.getUploadValue(uploadInput) === "always") {
      uploadResult = await uploadLib.uploadFiles(
        outputDir,
        actionsUtil.getRequiredInput("checkout_path"),
        actionsUtil.getOptionalInput("category"),
        features,
        logger,
      );
      core.setOutput("sarif-id", uploadResult.sarifID);
    } else {
      logger.info("Not uploading results");
    }

    // Possibly upload the database bundles for remote queries
    await uploadDatabases(repositoryNwo, config, apiDetails, logger);

    // Possibly upload the TRAP caches for later re-use
    const trapCacheUploadStartTime = performance.now();
    didUploadTrapCaches = await uploadTrapCaches(codeql, config, logger);
    trapCacheUploadTime = performance.now() - trapCacheUploadStartTime;

    // Clean up TRAP caches
    trapCacheCleanupTelemetry = await cleanupTrapCaches(
      config,
      features,
      logger,
    );

    // Store dependency cache(s) if dependency caching is enabled.
    if (shouldStoreCache(config.dependencyCachingEnabled)) {
      await uploadDependencyCaches(config, logger);
    }

    // We don't upload results in test mode, so don't wait for processing
    if (util.isInTestMode()) {
      logger.debug("In test mode. Waiting for processing is disabled.");
    } else if (
      uploadResult !== undefined &&
      actionsUtil.getRequiredInput("wait-for-processing") === "true"
    ) {
      await uploadLib.waitForProcessing(
        parseRepositoryNwo(util.getRequiredEnvParam("GITHUB_REPOSITORY")),
        uploadResult.sarifID,
        getActionsLogger(),
      );
    }
    // If we did not throw an error yet here, but we expect one, throw it.
    if (actionsUtil.getOptionalInput("expect-error") === "true") {
      core.setFailed(
        `expect-error input was set to true but no error was thrown.`,
      );
    }
    core.exportVariable(EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY, "true");
  } catch (unwrappedError) {
    const error = util.wrapError(unwrappedError);
    if (
      actionsUtil.getOptionalInput("expect-error") !== "true" ||
      hasBadExpectErrorInput()
    ) {
      core.setFailed(error.message);
    }

    await sendStatusReport(
      startedAt,
      config,
      error instanceof CodeQLAnalysisError
        ? error.queriesStatusReport
        : undefined,
      error instanceof CodeQLAnalysisError ? error.error : error,
      trapCacheUploadTime,
      dbCreationTimings,
      didUploadTrapCaches,
      trapCacheCleanupTelemetry,
      logger,
    );
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
      dbCreationTimings,
      didUploadTrapCaches,
      trapCacheCleanupTelemetry,
      logger,
    );
  } else if (runStats) {
    await sendStatusReport(
      startedAt,
      config,
      { ...runStats },
      undefined,
      trapCacheUploadTime,
      dbCreationTimings,
      didUploadTrapCaches,
      trapCacheCleanupTelemetry,
      logger,
    );
  } else {
    await sendStatusReport(
      startedAt,
      config,
      undefined,
      undefined,
      trapCacheUploadTime,
      dbCreationTimings,
      didUploadTrapCaches,
      trapCacheCleanupTelemetry,
      logger,
    );
  }
}

export const runPromise = run();

async function runWrapper() {
  try {
    await runPromise;
  } catch (error) {
    core.setFailed(`analyze action failed: ${util.getErrorMessage(error)}`);
  }
  await util.checkForTimeout();
}

void runWrapper();
