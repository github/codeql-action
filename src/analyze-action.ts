import * as fs from "fs";
import path from "path";
// We need to import `performance` on Node 12
import { performance } from "perf_hooks";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { DatabaseCreationTimings } from "./actions-util";
import {
  CodeQLAnalysisError,
  dbIsFinalized,
  QueriesStatusReport,
  runCleanup,
  runFinalize,
  runQueries,
} from "./analyze";
import { getApiDetails, getGitHubVersion } from "./api-client";
import { runAutobuild } from "./autobuild";
import { getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import { uploadDatabases } from "./database-upload";
import { Features } from "./feature-flags";
import { Language } from "./languages";
import { getActionsLogger, Logger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import { CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY } from "./shared-environment";
import { getTotalCacheSize, uploadTrapCaches } from "./trap-caching";
import * as upload_lib from "./upload-lib";
import { UploadResult } from "./upload-lib";
import * as util from "./util";
import { checkForTimeout } from "./util";

// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");

interface AnalysisStatusReport
  extends upload_lib.UploadStatusReport,
    QueriesStatusReport {}

interface FinishStatusReport
  extends actionsUtil.StatusReportBase,
    actionsUtil.DatabaseCreationTimings,
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
  dbCreationTimings: DatabaseCreationTimings | undefined,
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
    ...(dbCreationTimings || {}),
  };
  if (config && didUploadTrapCaches) {
    const trapCacheUploadStatusReport: FinishWithTrapUploadStatusReport = {
      ...statusReport,
      trap_cache_upload_duration_ms: Math.round(trapCacheUploadTime || 0),
      trap_cache_upload_size_bytes: Math.round(
        await getTotalCacheSize(config.trapCaches, logger)
      ),
    };
    await actionsUtil.sendStatusReport(trapCacheUploadStatusReport);
  } else {
    await actionsUtil.sendStatusReport(statusReport);
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
        ].some((ext) => fileName.endsWith(ext))
      )
  );
}

/**
 * We attempt to autobuild Go to preserve compatibility for users who have
 * set up Go using a legacy scanning style CodeQL workflow, i.e. one without
 * an autobuild step or manual build steps.
 *
 * - We detect whether an autobuild step is present by checking the
 * `util.DID_AUTOBUILD_GO_ENV_VAR_NAME` environment variable, which is set
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
  if (process.env[util.DID_AUTOBUILD_GO_ENV_VAR_NAME] === "true") {
    logger.debug("Won't run Go autobuild since it has already been run.");
    return;
  }
  if (dbIsFinalized(config, Language.go, logger)) {
    logger.debug(
      "Won't run Go autobuild since there is already a finalized database for Go."
    );
    return;
  }
  // This captures whether a user has added manual build steps for Go
  if (doesGoExtractionOutputExist(config)) {
    logger.debug(
      "Won't run Go autobuild since at least one file of Go code has already been extracted."
    );
    // If the user has run the manual build step, and has set the `CODEQL_EXTRACTOR_GO_BUILD_TRACING`
    // variable, we suggest they remove it from their workflow.
    if ("CODEQL_EXTRACTOR_GO_BUILD_TRACING" in process.env) {
      logger.warning(
        `The CODEQL_EXTRACTOR_GO_BUILD_TRACING environment variable has no effect on workflows with manual build steps, so we recommend that you remove it from your workflow.`
      );
    }
    return;
  }
  await runAutobuild(Language.go, config, logger);
}

async function run() {
  const startedAt = new Date();
  let uploadResult: UploadResult | undefined = undefined;
  let runStats: QueriesStatusReport | undefined = undefined;
  let config: Config | undefined = undefined;
  let trapCacheUploadTime: number | undefined = undefined;
  let dbCreationTimings: DatabaseCreationTimings | undefined = undefined;
  let didUploadTrapCaches = false;
  util.initializeEnvironment(pkg.version);
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

    await util.enrichEnvironment(await getCodeQL(config.codeQLCmd));

    const apiDetails = getApiDetails();
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

    const gitHubVersion = await getGitHubVersion();

    const features = new Features(
      gitHubVersion,
      repositoryNwo,
      actionsUtil.getTemporaryDirectory(),
      logger
    );

    await runAutobuildIfLegacyGoWorkflow(config, logger);

    dbCreationTimings = await runFinalize(
      outputDir,
      threads,
      memory,
      config,
      logger
    );

    if (actionsUtil.getRequiredInput("skip-queries") !== "true") {
      runStats = await runQueries(
        outputDir,
        memory,
        util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")),
        threads,
        actionsUtil.getOptionalInput("category"),
        config,
        logger,
        features
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
        actionsUtil.getRequiredInput("checkout_path"),
        actionsUtil.getOptionalInput("category"),
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
    didUploadTrapCaches = await uploadTrapCaches(codeql, config, logger);
    trapCacheUploadTime = performance.now() - trapCacheUploadStartTime;

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
        getActionsLogger()
      );
    }
    // If we did not throw an error yet here, but we expect one, throw it.
    if (actionsUtil.getOptionalInput("expect-error") === "true") {
      core.setFailed(
        `expect-error input was set to true but no error was thrown.`
      );
    }
    core.exportVariable(
      CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY,
      "true"
    );
  } catch (origError) {
    const error =
      origError instanceof Error ? origError : new Error(String(origError));
    if (
      actionsUtil.getOptionalInput("expect-error") !== "true" ||
      hasBadExpectErrorInput()
    ) {
      core.setFailed(error.message);
    }

    if (error instanceof CodeQLAnalysisError) {
      const stats = { ...error.queriesStatusReport };
      await sendStatusReport(
        startedAt,
        config,
        stats,
        error,
        trapCacheUploadTime,
        dbCreationTimings,
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
        dbCreationTimings,
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
      dbCreationTimings,
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
      dbCreationTimings,
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
      dbCreationTimings,
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
    core.setFailed(`analyze action failed: ${error}`);
  }
  await checkForTimeout();
}

void runWrapper();
