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
  isDefaultSetup,
} from "./actions-util";
import { getGitHubVersion } from "./api-client";
import {
  getDependencyCachingEnabled,
  getTotalCacheSize,
  shouldRestoreCache,
} from "./caching-utils";
import { CodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { downloadDependencyCaches } from "./dependency-caching";
import {
  addDiagnostic,
  flushDiagnostics,
  logUnwrittenDiagnostics,
  makeDiagnostic,
} from "./diagnostics";
import { EnvVar } from "./environment";
import { Feature, featureConfig, Features } from "./feature-flags";
import {
  checkInstallPython311,
  cleanupDatabaseClusterDirectory,
  initCodeQL,
  initConfig,
  runInit,
} from "./init";
import { Language } from "./languages";
import { getActionsLogger, Logger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import { ToolsSource } from "./setup-codeql";
import {
  ActionName,
  StatusReportBase,
  createStatusReportBase,
  getActionsStatus,
  sendStatusReport,
} from "./status-report";
import { ZstdAvailability } from "./tar";
import { ToolsDownloadStatusReport } from "./tools-download";
import { ToolsFeature } from "./tools-features";
import {
  checkDiskUsage,
  checkForTimeout,
  checkGitHubVersionInRange,
  checkSipEnablement,
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
  cloneObject,
  getErrorMessage,
} from "./util";
import { validateWorkflow } from "./workflow";
/** Fields of the init status report that can be sent before `config` is populated. */
interface InitStatusReport extends StatusReportBase {
  /** Value given by the user as the "tools" input. */
  tools_input: string;
  /** Version of the bundle used. */
  tools_resolved_version: string;
  /** Where the bundle originated from. */
  tools_source: ToolsSource;
  /** Comma-separated list of languages specified explicitly in the workflow file. */
  workflow_languages: string;
}

/** Fields of the init status report that are populated using values from `config`. */
interface InitWithConfigStatusReport extends InitStatusReport {
  /** Comma-separated list of languages where the default queries are disabled. */
  disable_default_queries: string;
  /** Comma-separated list of paths, from the 'paths' config field. */
  paths: string;
  /** Comma-separated list of paths, from the 'paths-ignore' config field. */
  paths_ignore: string;
  /** Comma-separated list of queries sources, from the 'queries' config field or workflow input. */
  queries: string;
  /** Stringified JSON object of packs, from the 'packs' config field or workflow input. */
  packs: string;
  /** Comma-separated list of languages for which we are using TRAP caching. */
  trap_cache_languages: string;
  /** Size of TRAP caches that we downloaded, in bytes. */
  trap_cache_download_size_bytes: number;
  /** Time taken to download TRAP caches, in milliseconds. */
  trap_cache_download_duration_ms: number;
  /** Stringified JSON array of registry configuration objects, from the 'registries' config field
  or workflow input. **/
  registries: string;
  /** Stringified JSON object representing a query-filters, from the 'query-filters' config field. **/
  query_filters: string;
  /** Path to the specified code scanning config file, from the 'config-file' config field. */
  config_file: string;
}

/** Fields of the init status report populated when the tools source is `download`. */
interface InitToolsDownloadFields {
  /** Time taken to download the bundle, in milliseconds. */
  tools_download_duration_ms?: number;
  /**
   * Whether the relevant tools dotcom feature flags have been misconfigured.
   * Only populated if we attempt to determine the default version based on the dotcom feature flags. */
  tools_feature_flags_valid?: boolean;
}

async function sendCompletedStatusReport(
  startedAt: Date,
  config: configUtils.Config | undefined,
  configFile: string | undefined,
  toolsDownloadStatusReport: ToolsDownloadStatusReport | undefined,
  toolsFeatureFlagsValid: boolean | undefined,
  toolsSource: ToolsSource,
  toolsVersion: string,
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
    const languages = config.languages.join(",");
    const paths = (config.originalUserInput.paths || []).join(",");
    const pathsIgnore = (config.originalUserInput["paths-ignore"] || []).join(
      ",",
    );
    const disableDefaultQueries = config.originalUserInput[
      "disable-default-queries"
    ]
      ? languages
      : "";

    const queries: string[] = [];
    let queriesInput = getOptionalInput("queries")?.trim();
    if (queriesInput === undefined || queriesInput.startsWith("+")) {
      queries.push(
        ...(config.originalUserInput.queries || []).map((q) => q.uses),
      );
    }
    if (queriesInput !== undefined) {
      queriesInput = queriesInput.startsWith("+")
        ? queriesInput.slice(1)
        : queriesInput;
      queries.push(...queriesInput.split(","));
    }

    let packs: Record<string, string[]> = {};
    if (
      (config.augmentationProperties.packsInputCombines ||
        !config.augmentationProperties.packsInput) &&
      config.originalUserInput.packs
    ) {
      // Make a copy, because we might modify `packs`.
      const copyPacksFromOriginalUserInput = cloneObject(
        config.originalUserInput.packs,
      );
      // If it is an array, then assume there is only a single language being analyzed.
      if (Array.isArray(copyPacksFromOriginalUserInput)) {
        packs[config.languages[0]] = copyPacksFromOriginalUserInput;
      } else {
        packs = copyPacksFromOriginalUserInput;
      }
    }

    if (config.augmentationProperties.packsInput) {
      packs[config.languages[0]] ??= [];
      packs[config.languages[0]].push(
        ...config.augmentationProperties.packsInput,
      );
    }

    // Append fields that are dependent on `config`
    const initWithConfigStatusReport: InitWithConfigStatusReport = {
      ...initStatusReport,
      config_file: configFile ?? "",
      disable_default_queries: disableDefaultQueries,
      paths,
      paths_ignore: pathsIgnore,
      queries: queries.join(","),
      packs: JSON.stringify(packs),
      trap_cache_languages: Object.keys(config.trapCaches).join(","),
      trap_cache_download_size_bytes: Math.round(
        await getTotalCacheSize(Object.values(config.trapCaches), logger),
      ),
      trap_cache_download_duration_ms: Math.round(config.trapCacheDownloadTime),
      query_filters: JSON.stringify(
        config.originalUserInput["query-filters"] ?? [],
      ),
      registries: JSON.stringify(
        configUtils.parseRegistriesWithoutCredentials(
          getOptionalInput("registries"),
        ) ?? [],
      ),
    };
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

  const repositoryNwo = parseRepositoryNwo(
    getRequiredEnvParam("GITHUB_REPOSITORY"),
  );

  const features = new Features(
    gitHubVersion,
    repositoryNwo,
    getTemporaryDirectory(),
    logger,
  );

  const jobRunUuid = uuidV4();
  logger.info(`Job run UUID is ${jobRunUuid}.`);
  core.exportVariable(EnvVar.JOB_RUN_UUID, jobRunUuid);

  core.exportVariable(EnvVar.INIT_ACTION_HAS_RUN, "true");

  const configFile = getOptionalInput("config-file");

  try {
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

    config = await initConfig(
      {
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
          getOptionalInput("debug-artifact-name") ||
          DEFAULT_DEBUG_ARTIFACT_NAME,
        debugDatabaseName:
          getOptionalInput("debug-database-name") ||
          DEFAULT_DEBUG_DATABASE_NAME,
        repository: repositoryNwo,
        tempDir: getTemporaryDirectory(),
        codeql,
        workspacePath: getRequiredEnvParam("GITHUB_WORKSPACE"),
        githubVersion: gitHubVersion,
        apiDetails,
        features,
        logger,
      },
      codeql,
    );

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

  try {
    cleanupDatabaseClusterDirectory(config, logger);

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
      config.languages.includes(Language.swift) &&
      process.platform === "linux"
    ) {
      logger.warning(
        `Swift analysis on Ubuntu runner images is no longer supported. Please migrate to a macOS runner if this affects you.`,
      );
    }

    if (
      config.languages.includes(Language.go) &&
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
            Language.go,
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

    if (config.languages.includes(Language.cpp)) {
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

    // Set CODEQL_EXTRACTOR_CPP_BUILD_MODE_NONE
    if (config.languages.includes(Language.cpp)) {
      const bmnVar = "CODEQL_EXTRACTOR_CPP_BUILD_MODE_NONE";
      const value =
        process.env[bmnVar] ||
        (await features.getValue(Feature.CppBuildModeNone, codeql));
      logger.info(`Setting C++ build-mode: none to ${value}`);
      core.exportVariable(bmnVar, value);
    }

    // Set CODEQL_ENABLE_EXPERIMENTAL_FEATURES for rust
    if (config.languages.includes(Language.rust)) {
      const feat = Feature.RustAnalysis;
      const minVer = featureConfig[feat].minimumVersion as string;
      const envVar = "CODEQL_ENABLE_EXPERIMENTAL_FEATURES";
      // if in default setup, it means the feature flag was on when rust was enabled
      // if the feature flag gets turned off, let's not have rust analysis throwing a configuration error
      // in that case rust analysis will be disabled only when default setup is refreshed
      if (isDefaultSetup() || (await features.getValue(feat, codeql))) {
        core.exportVariable(envVar, "true");
      }
      if (process.env[envVar] !== "true") {
        throw new ConfigurationError(
          `Experimental and not officially supported Rust analysis requires setting ${envVar}=true in the environment`,
        );
      }
      const actualVer = (await codeql.getVersion()).version;
      if (semver.lt(actualVer, minVer)) {
        throw new ConfigurationError(
          `Experimental rust analysis is supported by CodeQL CLI version ${minVer} or higher, but found version ${actualVer}`,
        );
      }
      logger.info("Experimental rust analysis enabled");
    }

    // Restore dependency cache(s), if they exist.
    if (shouldRestoreCache(config.dependencyCachingEnabled)) {
      await downloadDependencyCaches(config.languages, logger);
    }

    // For CLI versions <2.15.1, build tracing caused errors in macOS ARM machines with
    // System Integrity Protection (SIP) disabled.
    if (
      !(await codeQlVersionAtLeast(codeql, "2.15.1")) &&
      process.platform === "darwin" &&
      (process.arch === "arm" || process.arch === "arm64") &&
      !(await checkSipEnablement(logger))
    ) {
      logger.warning(
        "CodeQL versions 2.15.0 and lower are not supported on macOS ARM machines with System Integrity Protection (SIP) disabled.",
      );
    }

    // From 2.16.0 the default for the python extractor is to not perform any
    // dependency extraction. For versions before that, you needed to set this flag to
    // enable this behavior.

    if (await codeQlVersionAtLeast(codeql, "2.17.1")) {
      // disabled by default, no warning
    } else if (await codeQlVersionAtLeast(codeql, "2.16.0")) {
      // disabled by default, prints warning if environment variable is not set
      core.exportVariable(
        "CODEQL_EXTRACTOR_PYTHON_DISABLE_LIBRARY_EXTRACTION",
        "true",
      );
    } else {
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

    const sourceRoot = path.resolve(
      getRequiredEnvParam("GITHUB_WORKSPACE"),
      getOptionalInput("source-root") || "",
    );

    const tracerConfig = await runInit(
      codeql,
      config,
      sourceRoot,
      "Runner.Worker.exe",
      getOptionalInput("registries"),
      apiDetails,
      logger,
    );
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
      logger,
      error,
    );
    return;
  } finally {
    logUnwrittenDiagnostics();
  }
  await sendCompletedStatusReport(
    startedAt,
    config,
    configFile,
    toolsDownloadStatusReport,
    toolsFeatureFlagsValid,
    toolsSource,
    toolsVersion,
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
