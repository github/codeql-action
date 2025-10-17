import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";
import * as io from "@actions/io";
import * as semver from "semver";
import { v4 as uuidV4 } from "uuid";

import {
  FileCmdNotFoundError,
  getActionVersion,
  getFileType,
  getOptionalInput,
  getRequiredInput,
  getTemporaryDirectory,
  persistInputs,
} from "./actions-util";
import { AnalysisKind, getAnalysisKinds } from "./analyses";
import { getGitHubVersion } from "./api-client";
import {
  getDependencyCachingEnabled,
  getTotalCacheSize,
  shouldRestoreCache,
} from "./caching-utils";
import { CodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import {
  DependencyCacheRestoreStatusReport,
  downloadDependencyCaches,
} from "./dependency-caching";
import {
  addDiagnostic,
  flushDiagnostics,
  logUnwrittenDiagnostics,
  makeDiagnostic,
} from "./diagnostics";
import { EnvVar } from "./environment";
import { Feature, Features } from "./feature-flags";
import { loadPropertiesFromApi } from "./feature-flags/properties";
import {
  checkInstallPython311,
  checkPacksForOverlayCompatibility,
  cleanupDatabaseClusterDirectory,
  initCodeQL,
  initConfig,
  runDatabaseInitCluster,
} from "./init";
import { KnownLanguage } from "./languages";
import { getActionsLogger, Logger } from "./logging";
import {
  downloadOverlayBaseDatabaseFromCache,
  OverlayBaseDatabaseDownloadStats,
  OverlayDatabaseMode,
} from "./overlay-database-utils";
import { getRepositoryNwo } from "./repository";
import { ToolsSource } from "./setup-codeql";
import {
  ActionName,
  InitStatusReport,
  InitToolsDownloadFields,
  InitWithConfigStatusReport,
  createInitWithConfigStatusReport,
  createStatusReportBase,
  getActionsStatus,
  sendStatusReport,
} from "./status-report";
import { ZstdAvailability } from "./tar";
import { ToolsDownloadStatusReport } from "./tools-download";
import { ToolsFeature } from "./tools-features";
import { getCombinedTracerConfig } from "./tracer-config";
import {
  checkDiskUsage,
  checkForTimeout,
  checkGitHubVersionInRange,
  codeQlVersionAtLeast,
  DEFAULT_DEBUG_ARTIFACT_NAME,
  DEFAULT_DEBUG_DATABASE_NAME,
  getMemoryFlagValue,
  getRequiredEnvParam,
  getThreadsFlagValue,
  initializeEnvironment,
  isHostedRunner,
  ConfigurationError,
  wrapError,
  checkActionVersion,
  getErrorMessage,
  BuildMode,
} from "./util";
import { validateWorkflow } from "./workflow";

/**
 * Sends a status report indicating that the `init` Action is starting.
 *
 * @param startedAt
 * @param config
 * @param logger
 */
async function sendStartingStatusReport(
  startedAt: Date,
  config: Partial<configUtils.Config> | undefined,
  logger: Logger,
) {
  const statusReportBase = await createStatusReportBase(
    ActionName.Init,
    "starting",
    startedAt,
    config,
    await checkDiskUsage(logger),
    logger,
  );
  if (statusReportBase !== undefined) {
    await sendStatusReport(statusReportBase);
  }
}

async function sendCompletedStatusReport(
  startedAt: Date,
  config: configUtils.Config | undefined,
  configFile: string | undefined,
  toolsDownloadStatusReport: ToolsDownloadStatusReport | undefined,
  toolsFeatureFlagsValid: boolean | undefined,
  toolsSource: ToolsSource,
  toolsVersion: string,
  overlayBaseDatabaseStats: OverlayBaseDatabaseDownloadStats | undefined,
  dependencyCachingResults: DependencyCacheRestoreStatusReport | undefined,
  logger: Logger,
  error?: Error,
) {
  const statusReportBase = await createStatusReportBase(
    ActionName.Init,
    getActionsStatus(error),
    startedAt,
    config,
    await checkDiskUsage(logger),
    logger,
    error?.message,
    error?.stack,
  );

  if (statusReportBase === undefined) {
    return;
  }

  const workflowLanguages = getOptionalInput("languages");

  const initStatusReport: InitStatusReport = {
    ...statusReportBase,
    tools_input: getOptionalInput("tools") || "",
    tools_resolved_version: toolsVersion,
    tools_source: toolsSource || ToolsSource.Unknown,
    workflow_languages: workflowLanguages || "",
  };

  const initToolsDownloadFields: InitToolsDownloadFields = {};

  if (toolsDownloadStatusReport?.downloadDurationMs !== undefined) {
    initToolsDownloadFields.tools_download_duration_ms =
      toolsDownloadStatusReport.downloadDurationMs;
  }
  if (toolsFeatureFlagsValid !== undefined) {
    initToolsDownloadFields.tools_feature_flags_valid = toolsFeatureFlagsValid;
  }

  if (config !== undefined) {
    // Append fields that are dependent on `config`
    const initWithConfigStatusReport: InitWithConfigStatusReport =
      await createInitWithConfigStatusReport(
        config,
        initStatusReport,
        configFile,
        Math.round(
          await getTotalCacheSize(Object.values(config.trapCaches), logger),
        ),
        overlayBaseDatabaseStats,
        dependencyCachingResults,
      );
    await sendStatusReport({
      ...initWithConfigStatusReport,
      ...initToolsDownloadFields,
    });
  } else {
    await sendStatusReport({ ...initStatusReport, ...initToolsDownloadFields });
  }
}

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  initializeEnvironment(getActionVersion());

  // Make inputs accessible in the `post` step.
  persistInputs();

  let config: configUtils.Config | undefined;
  let codeql: CodeQL;
  let toolsDownloadStatusReport: ToolsDownloadStatusReport | undefined;
  let toolsFeatureFlagsValid: boolean | undefined;
  let toolsSource: ToolsSource;
  let toolsVersion: string;
  let zstdAvailability: ZstdAvailability | undefined;

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

  // Fetch the values of known repository properties that affect us.
  const enableRepoProps = await features.getValue(
    Feature.UseRepositoryProperties,
  );
  const repositoryProperties = enableRepoProps
    ? await loadPropertiesFromApi(gitHubVersion, logger, repositoryNwo)
    : {};

  // Create a unique identifier for this run.
  const jobRunUuid = uuidV4();
  logger.info(`Job run UUID is ${jobRunUuid}.`);
  core.exportVariable(EnvVar.JOB_RUN_UUID, jobRunUuid);

  core.exportVariable(EnvVar.INIT_ACTION_HAS_RUN, "true");

  const configFile = getOptionalInput("config-file");

  // path.resolve() respects the intended semantics of source-root. If
  // source-root is relative, it is relative to the GITHUB_WORKSPACE. If
  // source-root is absolute, it is used as given.
  const sourceRoot = path.resolve(
    getRequiredEnvParam("GITHUB_WORKSPACE"),
    getOptionalInput("source-root") || "",
  );

  try {
    // Parsing the `analysis-kinds` input may throw a `ConfigurationError`, which we don't want before
    // we have called `sendStartingStatusReport` below. However, we want the analysis kinds for that status
    // report. To work around this, we ignore exceptions that are thrown here and then call `getAnalysisKinds`
    // a second time later. The second call will then throw the exception again. If `getAnalysisKinds` is
    // successful, the results are cached so that we don't duplicate the work in normal runs.
    let analysisKinds: AnalysisKind[] | undefined;
    try {
      analysisKinds = await getAnalysisKinds(logger);
    } catch (err) {
      logger.debug(
        `Failed to parse analysis kinds for 'starting' status report: ${getErrorMessage(err)}`,
      );
    }

    // Send a status report indicating that an analysis is starting.
    await sendStartingStatusReport(startedAt, { analysisKinds }, logger);

    // Throw a `ConfigurationError` if the `setup-codeql` action has been run.
    if (process.env[EnvVar.SETUP_CODEQL_ACTION_HAS_RUN] === "true") {
      throw new ConfigurationError(
        `The 'init' action should not be run in the same workflow as 'setup-codeql'.`,
      );
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
    zstdAvailability = initCodeQLResult.zstdAvailability;

    core.startGroup("Validating workflow");
    const validateWorkflowResult = await validateWorkflow(codeql, logger);
    if (validateWorkflowResult === undefined) {
      logger.info("Detected no issues with the code scanning workflow.");
    } else {
      logger.warning(
        `Unable to validate code scanning workflow: ${validateWorkflowResult}`,
      );
    }
    core.endGroup();

    // Set CODEQL_ENABLE_EXPERIMENTAL_FEATURES for Rust if between 2.19.3 (included) and 2.22.1 (excluded)
    // We need to set this environment variable before initializing the config, otherwise Rust
    // analysis will not be enabled (experimental language packs are only active with that environment
    // variable set to `true`).
    if (
      // Only enable the experimental features env variable for Rust analysis if the user has explicitly
      // requested rust - don't enable it via language autodetection.
      configUtils
        .getRawLanguagesNoAutodetect(getOptionalInput("languages"))
        .includes(KnownLanguage.rust)
    ) {
      const experimental = "2.19.3";
      const publicPreview = "2.22.1";
      const actualVer = (await codeql.getVersion()).version;
      if (semver.lt(actualVer, experimental)) {
        throw new ConfigurationError(
          `Rust analysis is supported by CodeQL CLI version ${experimental} or higher, but found version ${actualVer}`,
        );
      }
      if (semver.lt(actualVer, publicPreview)) {
        core.exportVariable(EnvVar.EXPERIMENTAL_FEATURES, "true");
        logger.info("Experimental Rust analysis enabled");
      }
    }

    analysisKinds = await getAnalysisKinds(logger);
    config = await initConfig({
      analysisKinds,
      languagesInput: getOptionalInput("languages"),
      queriesInput: getOptionalInput("queries"),
      packsInput: getOptionalInput("packs"),
      buildModeInput: getOptionalInput("build-mode"),
      configFile,
      dbLocation: getOptionalInput("db-location"),
      configInput: getOptionalInput("config"),
      trapCachingEnabled: getTrapCachingEnabled(),
      dependencyCachingEnabled: getDependencyCachingEnabled(),
      // Debug mode is enabled if:
      // - The `init` Action is passed `debug: true`.
      // - Actions step debugging is enabled (e.g. by [enabling debug logging for a rerun](https://docs.github.com/en/actions/managing-workflow-runs/re-running-workflows-and-jobs#re-running-all-the-jobs-in-a-workflow),
      //   or by setting the `ACTIONS_STEP_DEBUG` secret to `true`).
      debugMode: getOptionalInput("debug") === "true" || core.isDebug(),
      debugArtifactName:
        getOptionalInput("debug-artifact-name") || DEFAULT_DEBUG_ARTIFACT_NAME,
      debugDatabaseName:
        getOptionalInput("debug-database-name") || DEFAULT_DEBUG_DATABASE_NAME,
      repository: repositoryNwo,
      tempDir: getTemporaryDirectory(),
      codeql,
      workspacePath: getRequiredEnvParam("GITHUB_WORKSPACE"),
      sourceRoot,
      githubVersion: gitHubVersion,
      apiDetails,
      features,
      repositoryProperties,
      logger,
    });

    await checkInstallPython311(config.languages, codeql);
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    core.setFailed(error.message);
    const statusReportBase = await createStatusReportBase(
      ActionName.Init,
      error instanceof ConfigurationError ? "user-error" : "aborted",
      startedAt,
      config,
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

  let overlayBaseDatabaseStats: OverlayBaseDatabaseDownloadStats | undefined;
  let dependencyCachingResults: DependencyCacheRestoreStatusReport | undefined;
  try {
    if (
      config.overlayDatabaseMode === OverlayDatabaseMode.Overlay &&
      config.useOverlayDatabaseCaching
    ) {
      // OverlayDatabaseMode.Overlay comes in two flavors: with database
      // caching, or without. The flavor with database caching is intended to be
      // an "automatic control" mode, which is supposed to be fail-safe. If we
      // cannot download an overlay-base database, we revert to
      // OverlayDatabaseMode.None so that the workflow can continue to run.
      //
      // The flavor without database caching is intended to be a "manual
      // control" mode, where the workflow is supposed to make all the
      // necessary preparations. So, in that mode, we would assume that
      // everything is in order and let the analysis fail if that turns out not
      // to be the case.
      overlayBaseDatabaseStats = await downloadOverlayBaseDatabaseFromCache(
        codeql,
        config,
        logger,
      );
      if (!overlayBaseDatabaseStats) {
        config.overlayDatabaseMode = OverlayDatabaseMode.None;
        logger.info(
          "No overlay-base database found in cache, " +
            `reverting overlay database mode to ${OverlayDatabaseMode.None}.`,
        );
      }
    }

    if (config.overlayDatabaseMode !== OverlayDatabaseMode.Overlay) {
      cleanupDatabaseClusterDirectory(config, logger);
    }

    if (zstdAvailability) {
      await recordZstdAvailability(config, zstdAvailability);
    }

    // Log CodeQL download telemetry, if appropriate
    if (toolsDownloadStatusReport) {
      addDiagnostic(
        config,
        // Arbitrarily choose the first language. We could also choose all languages, but that
        // increases the risk of misinterpreting the data.
        config.languages[0],
        makeDiagnostic(
          "codeql-action/bundle-download-telemetry",
          "CodeQL bundle download telemetry",
          {
            attributes: toolsDownloadStatusReport,
            visibility: {
              cliSummaryTable: false,
              statusPage: false,
              telemetry: true,
            },
          },
        ),
      );
    }

    // Forward Go flags
    const goFlags = process.env["GOFLAGS"];
    if (goFlags) {
      core.exportVariable("GOFLAGS", goFlags);
      core.warning(
        "Passing the GOFLAGS env parameter to the init action is deprecated. Please move this to the analyze action.",
      );
    }

    if (
      config.languages.includes(KnownLanguage.swift) &&
      process.platform === "linux"
    ) {
      logger.warning(
        `Swift analysis on Ubuntu runner images is no longer supported. Please migrate to a macOS runner if this affects you.`,
      );
    }

    if (
      config.languages.includes(KnownLanguage.go) &&
      process.platform === "linux"
    ) {
      try {
        const goBinaryPath = await io.which("go", true);
        const fileOutput = await getFileType(goBinaryPath);

        // Go 1.21 and above ships with statically linked binaries on Linux. CodeQL cannot currently trace custom builds
        // where the entry point is a statically linked binary. Until that is fixed, we work around the problem by
        // replacing the `go` binary with a shell script that invokes the actual `go` binary. Since the shell is
        // typically dynamically linked, this provides a suitable entry point for the CodeQL tracer.
        if (
          fileOutput.includes("statically linked") &&
          !(await codeql.supportsFeature(
            ToolsFeature.IndirectTracingSupportsStaticBinaries,
          ))
        ) {
          try {
            logger.debug(`Applying static binary workaround for Go`);

            // Create a directory that we can add to the system PATH.
            const tempBinPath = path.resolve(
              getTemporaryDirectory(),
              "codeql-action-go-tracing",
              "bin",
            );
            fs.mkdirSync(tempBinPath, { recursive: true });
            core.addPath(tempBinPath);

            // Write the wrapper script to the directory we just added to the PATH.
            const goWrapperPath = path.resolve(tempBinPath, "go");
            fs.writeFileSync(
              goWrapperPath,
              `#!/bin/bash\n\nexec ${goBinaryPath} "$@"`,
            );
            fs.chmodSync(goWrapperPath, "755");

            // Store the original location of our wrapper script somewhere where we can
            // later retrieve it from and cross-check that it hasn't been changed.
            core.exportVariable(EnvVar.GO_BINARY_LOCATION, goWrapperPath);
          } catch (e) {
            logger.warning(
              `Analyzing Go on Linux, but failed to install wrapper script. Tracing custom builds may fail: ${e}`,
            );
          }
        } else {
          // Store the location of the original Go binary, so we can check that no setup tasks were performed after the
          // `init` Action ran.
          core.exportVariable(EnvVar.GO_BINARY_LOCATION, goBinaryPath);
        }
      } catch (e) {
        logger.warning(
          `Failed to determine the location of the Go binary: ${e}`,
        );

        if (e instanceof FileCmdNotFoundError) {
          addDiagnostic(
            config,
            KnownLanguage.go,
            makeDiagnostic(
              "go/workflow/file-program-unavailable",
              "The `file` program is required on Linux, but does not appear to be installed",
              {
                markdownMessage:
                  "CodeQL was unable to find the `file` program on this system. Ensure that the `file` program is installed on Linux runners and accessible.",
                visibility: {
                  statusPage: true,
                  telemetry: true,
                  cliSummaryTable: true,
                },
                severity: "warning",
              },
            ),
          );
        }
      }
    }

    // Limit RAM and threads for extractors. When running extractors, the CodeQL CLI obeys the
    // CODEQL_RAM and CODEQL_THREADS environment variables to decide how much RAM and how many
    // threads it would ask extractors to use. See help text for the "--ram" and "--threads"
    // options at https://codeql.github.com/docs/codeql-cli/manual/database-trace-command/
    // for details.
    core.exportVariable(
      "CODEQL_RAM",
      process.env["CODEQL_RAM"] ||
        getMemoryFlagValue(getOptionalInput("ram"), logger).toString(),
    );
    core.exportVariable(
      "CODEQL_THREADS",
      process.env["CODEQL_THREADS"] ||
        getThreadsFlagValue(getOptionalInput("threads"), logger).toString(),
    );

    // Disable Kotlin extractor if feature flag set
    if (await features.getValue(Feature.DisableKotlinAnalysisEnabled)) {
      core.exportVariable("CODEQL_EXTRACTOR_JAVA_AGENT_DISABLE_KOTLIN", "true");
    }

    const kotlinLimitVar =
      "CODEQL_EXTRACTOR_KOTLIN_OVERRIDE_MAXIMUM_VERSION_LIMIT";
    if (
      (await codeQlVersionAtLeast(codeql, "2.20.3")) &&
      !(await codeQlVersionAtLeast(codeql, "2.20.4"))
    ) {
      core.exportVariable(kotlinLimitVar, "2.1.20");
    }

    if (config.languages.includes(KnownLanguage.cpp)) {
      const envVar = "CODEQL_EXTRACTOR_CPP_TRAP_CACHING";
      if (process.env[envVar]) {
        logger.info(
          `Environment variable ${envVar} already set. Not en/disabling CodeQL C++ TRAP caching support`,
        );
      } else if (
        getTrapCachingEnabled() &&
        (await codeQlVersionAtLeast(codeql, "2.17.5"))
      ) {
        logger.info("Enabling CodeQL C++ TRAP caching support");
        core.exportVariable(envVar, "true");
      } else {
        logger.info("Disabling CodeQL C++ TRAP caching support");
        core.exportVariable(envVar, "false");
      }
    }

    // Restore dependency cache(s), if they exist.
    const minimizeJavaJars = await features.getValue(
      Feature.JavaMinimizeDependencyJars,
      codeql,
    );
    if (shouldRestoreCache(config.dependencyCachingEnabled)) {
      dependencyCachingResults = await downloadDependencyCaches(
        config.languages,
        logger,
        minimizeJavaJars,
      );
    }

    // Suppress warnings about disabled Python library extraction.
    if (await codeQlVersionAtLeast(codeql, "2.17.1")) {
      // disabled by default, no warning
    } else {
      // disabled by default, prints warning if environment variable is not set
      core.exportVariable(
        "CODEQL_EXTRACTOR_PYTHON_DISABLE_LIBRARY_EXTRACTION",
        "true",
      );
    }

    if (getOptionalInput("setup-python-dependencies") !== undefined) {
      logger.warning(
        "The setup-python-dependencies input is deprecated and no longer has any effect. We recommend removing any references from your workflows. See https://github.blog/changelog/2024-01-23-codeql-2-16-python-dependency-installation-disabled-new-queries-and-bug-fixes/ for more information.",
      );
    }

    if (
      process.env["CODEQL_ACTION_DISABLE_PYTHON_DEPENDENCY_INSTALLATION"] !==
      undefined
    ) {
      logger.warning(
        "The CODEQL_ACTION_DISABLE_PYTHON_DEPENDENCY_INSTALLATION environment variable is deprecated and no longer has any effect. We recommend removing any references from your workflows. See https://github.blog/changelog/2024-01-23-codeql-2-16-python-dependency-installation-disabled-new-queries-and-bug-fixes/ for more information.",
      );
    }

    if (
      await codeql.supportsFeature(
        ToolsFeature.PythonDefaultIsToNotExtractStdlib,
      )
    ) {
      if (process.env["CODEQL_EXTRACTOR_PYTHON_EXTRACT_STDLIB"]) {
        logger.debug(
          "CODEQL_EXTRACTOR_PYTHON_EXTRACT_STDLIB is already set, so the Action will not override it.",
        );
      } else if (
        !(await features.getValue(
          Feature.PythonDefaultIsToNotExtractStdlib,
          codeql,
        ))
      ) {
        // We are in a situation where the feature flag is not rolled out,
        // so we need to suppress the new default CLI behavior.
        core.exportVariable("CODEQL_EXTRACTOR_PYTHON_EXTRACT_STDLIB", "true");
      }
    }

    // If the feature flag to minimize Java dependency jars is enabled, and we are doing a Java
    // `build-mode: none` analysis (i.e. the flag is relevant), then set the environment variable
    // that enables the corresponding option in the Java extractor. We also only do this if
    // dependency caching is enabled, since the option is intended to reduce the size of
    // dependency caches, but the jar-rewriting does have a performance cost that we'd like to avoid
    // when caching is not being used.
    if (process.env[EnvVar.JAVA_EXTRACTOR_MINIMIZE_DEPENDENCY_JARS]) {
      logger.debug(
        `${EnvVar.JAVA_EXTRACTOR_MINIMIZE_DEPENDENCY_JARS} is already set to '${process.env[EnvVar.JAVA_EXTRACTOR_MINIMIZE_DEPENDENCY_JARS]}', so the Action will not override it.`,
      );
    } else if (
      minimizeJavaJars &&
      config.dependencyCachingEnabled &&
      config.buildMode === BuildMode.None &&
      config.languages.includes(KnownLanguage.java)
    ) {
      core.exportVariable(
        EnvVar.JAVA_EXTRACTOR_MINIMIZE_DEPENDENCY_JARS,
        "true",
      );
    }

    const { registriesAuthTokens, qlconfigFile } =
      await configUtils.generateRegistries(
        getOptionalInput("registries"),
        config.tempDir,
        logger,
      );
    const databaseInitEnvironment = {
      GITHUB_TOKEN: apiDetails.auth,
      CODEQL_REGISTRIES_AUTH: registriesAuthTokens,
    };

    await runDatabaseInitCluster(
      databaseInitEnvironment,
      codeql,
      config,
      sourceRoot,
      "Runner.Worker.exe",
      qlconfigFile,
      logger,
    );

    // To check custom query packs for compatibility with overlay analysis, we
    // need to first initialize the database cluster, which downloads the
    // user-specified custom query packs. But we also want to check custom query
    // pack compatibility first, because database cluster initialization depends
    // on the overlay database mode. The solution is to initialize the database
    // cluster first, check custom query pack compatibility, and if we need to
    // revert to `OverlayDatabaseMode.None`, re-initialize the database cluster
    // with the new overlay database mode.
    if (
      config.overlayDatabaseMode !== OverlayDatabaseMode.None &&
      !(await checkPacksForOverlayCompatibility(codeql, config, logger))
    ) {
      logger.info(
        "Reverting overlay database mode to None due to incompatible packs.",
      );
      config.overlayDatabaseMode = OverlayDatabaseMode.None;
      cleanupDatabaseClusterDirectory(config, logger, {
        disableExistingDirectoryWarning: true,
      });
      await runDatabaseInitCluster(
        databaseInitEnvironment,
        codeql,
        config,
        sourceRoot,
        "Runner.Worker.exe",
        qlconfigFile,
        logger,
      );
    }

    const tracerConfig = await getCombinedTracerConfig(codeql, config);
    if (tracerConfig !== undefined) {
      for (const [key, value] of Object.entries(tracerConfig.env)) {
        core.exportVariable(key, value);
      }
    }

    // Write diagnostics to the database that we previously stored in memory because the database
    // did not exist until now.
    flushDiagnostics(config);

    core.setOutput("codeql-path", config.codeQLCmd);
    core.setOutput("codeql-version", (await codeql.getVersion()).version);
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    core.setFailed(error.message);
    await sendCompletedStatusReport(
      startedAt,
      config,
      undefined, // We only report config info on success.
      toolsDownloadStatusReport,
      toolsFeatureFlagsValid,
      toolsSource,
      toolsVersion,
      overlayBaseDatabaseStats,
      dependencyCachingResults,
      logger,
      error,
    );
    return;
  } finally {
    logUnwrittenDiagnostics();
  }

  // We save the config here instead of at the end of `initConfig` because we
  // may have updated the config returned from `initConfig`, e.g. to revert to
  // `OverlayDatabaseMode.None` if we failed to download an overlay-base
  // database.
  await configUtils.saveConfig(config, logger);
  await sendCompletedStatusReport(
    startedAt,
    config,
    configFile,
    toolsDownloadStatusReport,
    toolsFeatureFlagsValid,
    toolsSource,
    toolsVersion,
    overlayBaseDatabaseStats,
    dependencyCachingResults,
    logger,
  );
}

function getTrapCachingEnabled(): boolean {
  // If the workflow specified something always respect that
  const trapCaching = getOptionalInput("trap-caching");
  if (trapCaching !== undefined) return trapCaching === "true";

  // On self-hosted runners which may have slow network access, disable TRAP caching by default
  if (!isHostedRunner()) return false;

  // On hosted runners, enable TRAP caching by default
  return true;
}

async function recordZstdAvailability(
  config: configUtils.Config,
  zstdAvailability: ZstdAvailability,
) {
  addDiagnostic(
    config,
    // Arbitrarily choose the first language. We could also choose all languages, but that
    // increases the risk of misinterpreting the data.
    config.languages[0],
    makeDiagnostic(
      "codeql-action/zstd-availability",
      "Zstandard availability",
      {
        attributes: zstdAvailability,
        visibility: {
          cliSummaryTable: false,
          statusPage: false,
          telemetry: true,
        },
      },
    ),
  );
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`init action failed: ${getErrorMessage(error)}`);
  }
  await checkForTimeout();
}

void runWrapper();
