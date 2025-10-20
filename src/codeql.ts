import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";
import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as yaml from "js-yaml";

import {
  CommandInvocationError,
  getActionVersion,
  getOptionalInput,
  runTool,
} from "./actions-util";
import * as api from "./api-client";
import { CliError, wrapCliConfigurationError } from "./cli-errors";
import { appendExtraQueryExclusions, type Config } from "./config-utils";
import { DocUrl } from "./doc-url";
import { EnvVar } from "./environment";
import {
  CodeQLDefaultVersionInfo,
  Feature,
  FeatureEnablement,
} from "./feature-flags";
import { isAnalyzingDefaultBranch } from "./git-utils";
import { Language } from "./languages";
import { Logger } from "./logging";
import {
  OverlayDatabaseMode,
  writeBaseDatabaseOidsFile,
  writeOverlayChangesFile,
} from "./overlay-database-utils";
import * as setupCodeql from "./setup-codeql";
import { ZstdAvailability } from "./tar";
import { ToolsDownloadStatusReport } from "./tools-download";
import { ToolsFeature, isSupportedToolsFeature } from "./tools-features";
import { shouldEnableIndirectTracing } from "./tracer-config";
import * as util from "./util";
import { BuildMode, getErrorMessage } from "./util";

type Options = Array<string | number | boolean>;

/**
 * Extra command line options for the codeql commands.
 */
interface ExtraOptions {
  "*"?: Options;
  database?: {
    "*"?: Options;
    init?: Options;
    "trace-command"?: Options;
    analyze?: Options;
    finalize?: Options;
  };
  resolve?: {
    "*"?: Options;
    extractor?: Options;
    queries?: Options;
  };
  github?: {
    "*"?: Options;
    "merge-results"?: Options;
  };
}

export interface CodeQL {
  /**
   * Get the path of the CodeQL executable.
   */
  getPath(): string;
  /**
   * Get a string containing the semver version of the CodeQL executable.
   */
  getVersion(): Promise<VersionInfo>;
  /**
   * Print version information about CodeQL.
   */
  printVersion(): Promise<void>;
  /**
   * Returns whether the CodeQL executable supports the specified feature.
   */
  supportsFeature(feature: ToolsFeature): Promise<boolean>;
  /**
   * Returns whether the provided language is traced.
   */
  isTracedLanguage(language: Language): Promise<boolean>;
  /**
   * Returns whether the provided language is scanned.
   */
  isScannedLanguage(language: Language): Promise<boolean>;
  /**
   * Run 'codeql database init --db-cluster'.
   */
  databaseInitCluster(
    config: Config,
    sourceRoot: string,
    processName: string | undefined,
    qlconfigFile: string | undefined,
    logger: Logger,
  ): Promise<void>;
  /**
   * Runs the autobuilder for the given language.
   */
  runAutobuild(config: Config, language: Language): Promise<void>;
  /**
   * Extract code for a scanned language using 'codeql database trace-command'
   * and running the language extractor.
   */
  extractScannedLanguage(config: Config, language: Language): Promise<void>;
  /**
   * Extract code with 'codeql database trace-command --use-build-mode'. This can only be used when
   * the database specifies a build mode. This requires the `traceCommandUseBuildMode` tool feature.
   */
  extractUsingBuildMode(config: Config, language: Language): Promise<void>;
  /**
   * Finalize a database using 'codeql database finalize'.
   */
  finalizeDatabase(
    databasePath: string,
    threadsFlag: string,
    memoryFlag: string,
    enableDebugLogging: boolean,
  ): Promise<void>;
  /**
   * Run 'codeql resolve languages'.
   */
  resolveLanguages(): Promise<ResolveLanguagesOutput>;
  /**
   * Run 'codeql resolve languages' with '--format=betterjson'.
   */
  betterResolveLanguages(options?: {
    filterToLanguagesWithQueries: boolean;
  }): Promise<BetterResolveLanguagesOutput>;
  /**
   * Run 'codeql resolve build-environment'
   */
  resolveBuildEnvironment(
    workingDir: string | undefined,
    language: string,
  ): Promise<ResolveBuildEnvironmentOutput>;

  /**
   * Clean up all the databases within a database cluster.
   */
  databaseCleanupCluster(config: Config, cleanupLevel: string): Promise<void>;
  /**
   * Run 'codeql database bundle'.
   */
  databaseBundle(
    databasePath: string,
    outputFilePath: string,
    dbName: string,
  ): Promise<void>;
  /**
   * Run 'codeql database run-queries'. If no `queries` are specified, then the CLI
   * will automatically use the `config-queries.qls` (if it exists) or default queries
   * for the language.
   */
  databaseRunQueries(
    databasePath: string,
    flags: string[],
    queries?: string[],
  ): Promise<void>;
  /**
   * Run 'codeql database interpret-results'.
   */
  databaseInterpretResults(
    databasePath: string,
    querySuitePaths: string[] | undefined,
    sarifFile: string,
    addSnippetsFlag: string,
    threadsFlag: string,
    verbosityFlag: string | undefined,
    sarifRunPropertyFlag: string | undefined,
    automationDetailsId: string | undefined,
    config: Config,
    features: FeatureEnablement,
  ): Promise<string>;
  /**
   * Run 'codeql database print-baseline'.
   */
  databasePrintBaseline(databasePath: string): Promise<string>;
  /**
   * Run 'codeql database export-diagnostics'
   *
   * Note that the "--sarif-include-diagnostics" option is always used, as the command should
   * only be run if the ExportDiagnosticsEnabled feature flag is on.
   */
  databaseExportDiagnostics(
    databasePath: string,
    sarifFile: string,
    automationDetailsId: string | undefined,
  ): Promise<void>;
  /**
   * Run 'codeql diagnostics export'.
   */
  diagnosticsExport(
    sarifFile: string,
    automationDetailsId: string | undefined,
    config: Config,
  ): Promise<void>;
  /** Get the location of an extractor for the specified language. */
  resolveExtractor(language: Language): Promise<string>;
  /**
   * Run 'codeql resolve queries --format=startingpacks'.
   */
  resolveQueriesStartingPacks(queries: string[]): Promise<string[]>;
  /**
   * Run 'codeql github merge-results'.
   */
  mergeResults(
    sarifFiles: string[],
    outputFile: string,
    options: { mergeRunsFromEqualCategory?: boolean },
  ): Promise<void>;
}

export interface VersionInfo {
  version: string;
  features?: { [name: string]: boolean };
  /**
   * The overlay version helps deal with backward incompatible changes for
   * overlay analysis. When a precompiled query pack reports the same overlay
   * version as the CodeQL CLI, we can use the CodeQL CLI to perform overlay
   * analysis with that pack. Otherwise, if the overlay versions are different,
   * or if either the pack or the CLI does not report an overlay version,
   * we need to revert to non-overlay analysis.
   */
  overlayVersion?: number;
}

export interface ResolveLanguagesOutput {
  [language: string]: [string];
}

export interface BetterResolveLanguagesOutput {
  aliases?: {
    [alias: string]: string;
  };
  extractors: {
    [language: string]: [
      {
        extractor_root: string;
        extractor_options?: any;
      },
    ];
  };
}

export interface ResolveBuildEnvironmentOutput {
  configuration?: {
    [language: string]: {
      [key: string]: unknown;
    };
  };
}

/**
 * Stores the CodeQL object, and is populated by `setupCodeQL` or `getCodeQL`.
 */
let cachedCodeQL: CodeQL | undefined = undefined;

/**
 * The oldest version of CodeQL that the Action will run with. This should be
 * at least three minor versions behind the current version and must include the
 * CLI versions shipped with each supported version of GHES.
 *
 * The version flags below can be used to conditionally enable certain features
 * on versions newer than this.
 */
const CODEQL_MINIMUM_VERSION = "2.16.6";

/**
 * This version will shortly become the oldest version of CodeQL that the Action will run with.
 */
const CODEQL_NEXT_MINIMUM_VERSION = "2.17.6";

/**
 * This is the version of GHES that was most recently deprecated.
 */
const GHES_VERSION_MOST_RECENTLY_DEPRECATED = "3.13";

/**
 * This is the deprecation date for the version of GHES that was most recently deprecated.
 */
const GHES_MOST_RECENT_DEPRECATION_DATE = "2025-06-19";

/** The CLI verbosity level to use for extraction in debug mode. */
const EXTRACTION_DEBUG_MODE_VERBOSITY = "progress++";

/*
 * Deprecated in favor of ToolsFeature.
 *
 * Versions of CodeQL that version-flag certain functionality in the Action.
 * For convenience, please keep these in descending order. Once a version
 * flag is older than the oldest supported version above, it may be removed.
 */

/**
 * Versions 2.17.1+ of the CodeQL CLI support the `--cache-cleanup` option.
 */
const CODEQL_VERSION_CACHE_CLEANUP = "2.17.1";

/**
 * Set up CodeQL CLI access.
 *
 * @param toolsInput
 * @param apiDetails
 * @param tempDir
 * @param variant
 * @param defaultCliVersion
 * @param features Information about the features that are enabled.
 * @param logger
 * @param checkVersion Whether to check that CodeQL CLI meets the minimum
 *        version requirement. Must be set to true outside tests.
 * @returns a { CodeQL, toolsVersion } object.
 */
export async function setupCodeQL(
  toolsInput: string | undefined,
  apiDetails: api.GitHubApiDetails,
  tempDir: string,
  variant: util.GitHubVariant,
  defaultCliVersion: CodeQLDefaultVersionInfo,
  features: FeatureEnablement,
  logger: Logger,
  checkVersion: boolean,
): Promise<{
  codeql: CodeQL;
  toolsDownloadStatusReport?: ToolsDownloadStatusReport;
  toolsSource: setupCodeql.ToolsSource;
  toolsVersion: string;
  zstdAvailability: ZstdAvailability;
}> {
  try {
    const {
      codeqlFolder,
      toolsDownloadStatusReport,
      toolsSource,
      toolsVersion,
      zstdAvailability,
    } = await setupCodeql.setupCodeQLBundle(
      toolsInput,
      apiDetails,
      tempDir,
      variant,
      defaultCliVersion,
      features,
      logger,
    );

    logger.debug(
      `Bundle download status report: ${JSON.stringify(
        toolsDownloadStatusReport,
      )}`,
    );

    let codeqlCmd = path.join(codeqlFolder, "codeql", "codeql");
    if (process.platform === "win32") {
      codeqlCmd += ".exe";
    } else if (process.platform !== "linux" && process.platform !== "darwin") {
      throw new util.ConfigurationError(
        `Unsupported platform: ${process.platform}`,
      );
    }

    cachedCodeQL = await getCodeQLForCmd(codeqlCmd, checkVersion);
    return {
      codeql: cachedCodeQL,
      toolsDownloadStatusReport,
      toolsSource,
      toolsVersion,
      zstdAvailability,
    };
  } catch (rawError) {
    const e = api.wrapApiConfigurationError(rawError);
    const ErrorClass =
      e instanceof util.ConfigurationError ||
      (e instanceof Error && e.message.includes("ENOSPC")) // out of disk space
        ? util.ConfigurationError
        : Error;

    throw new ErrorClass(
      `Unable to download and extract CodeQL CLI: ${getErrorMessage(e)}${
        e instanceof Error && e.stack ? `\n\nDetails: ${e.stack}` : ""
      }`,
    );
  }
}

/**
 * Use the CodeQL executable located at the given path.
 */
export async function getCodeQL(cmd: string): Promise<CodeQL> {
  if (cachedCodeQL === undefined) {
    cachedCodeQL = await getCodeQLForCmd(cmd, true);
  }
  return cachedCodeQL;
}

/**
 * Overrides the CodeQL object. Only for use in tests that cannot override
 * CodeQL via dependency injection.
 *
 * Accepts a partial object. Any undefined methods will be implemented
 * to immediately throw an exception indicating which method is missing.
 */
export function setCodeQL(codeql: Partial<CodeQL>): void {
  cachedCodeQL = createStubCodeQL(codeql);
}

function resolveFunction<T>(
  partialCodeql: Partial<CodeQL>,
  methodName: string,
  defaultImplementation?: T,
): T {
  if (typeof partialCodeql[methodName] !== "function") {
    if (defaultImplementation !== undefined) {
      return defaultImplementation;
    }
    const dummyMethod = () => {
      throw new Error(`CodeQL ${methodName} method not correctly defined`);
    };
    return dummyMethod as T;
  }
  return partialCodeql[methodName] as T;
}

/**
 * Creates a stub CodeQL object. Only for use in tests.
 *
 * Accepts a partial object. Any undefined methods will be implemented
 * to immediately throw an exception indicating which method is missing.
 */
export function createStubCodeQL(partialCodeql: Partial<CodeQL>): CodeQL {
  return {
    getPath: resolveFunction(partialCodeql, "getPath", () => "/tmp/dummy-path"),
    getVersion: resolveFunction(partialCodeql, "getVersion", async () => ({
      version: "1.0.0",
    })),
    printVersion: resolveFunction(partialCodeql, "printVersion"),
    supportsFeature: resolveFunction(
      partialCodeql,
      "supportsFeature",
      async (feature) =>
        !!partialCodeql.getVersion &&
        isSupportedToolsFeature(await partialCodeql.getVersion(), feature),
    ),
    isTracedLanguage: resolveFunction(partialCodeql, "isTracedLanguage"),
    isScannedLanguage: resolveFunction(partialCodeql, "isScannedLanguage"),
    databaseInitCluster: resolveFunction(partialCodeql, "databaseInitCluster"),
    runAutobuild: resolveFunction(partialCodeql, "runAutobuild"),
    extractScannedLanguage: resolveFunction(
      partialCodeql,
      "extractScannedLanguage",
    ),
    extractUsingBuildMode: resolveFunction(
      partialCodeql,
      "extractUsingBuildMode",
    ),
    finalizeDatabase: resolveFunction(partialCodeql, "finalizeDatabase"),
    resolveLanguages: resolveFunction(partialCodeql, "resolveLanguages"),
    betterResolveLanguages: resolveFunction(
      partialCodeql,
      "betterResolveLanguages",
      async () => ({ aliases: {}, extractors: {} }),
    ),
    resolveBuildEnvironment: resolveFunction(
      partialCodeql,
      "resolveBuildEnvironment",
    ),
    databaseCleanupCluster: resolveFunction(
      partialCodeql,
      "databaseCleanupCluster",
    ),
    databaseBundle: resolveFunction(partialCodeql, "databaseBundle"),
    databaseRunQueries: resolveFunction(partialCodeql, "databaseRunQueries"),
    databaseInterpretResults: resolveFunction(
      partialCodeql,
      "databaseInterpretResults",
    ),
    databasePrintBaseline: resolveFunction(
      partialCodeql,
      "databasePrintBaseline",
    ),
    databaseExportDiagnostics: resolveFunction(
      partialCodeql,
      "databaseExportDiagnostics",
    ),
    diagnosticsExport: resolveFunction(partialCodeql, "diagnosticsExport"),
    resolveExtractor: resolveFunction(partialCodeql, "resolveExtractor"),
    resolveQueriesStartingPacks: resolveFunction(
      partialCodeql,
      "resolveQueriesStartingPacks",
    ),
    mergeResults: resolveFunction(partialCodeql, "mergeResults"),
  };
}

/**
 * Get a real, newly created CodeQL instance for testing. The instance refers to
 * a non-existent placeholder codeql command, so tests that use this function
 * should also stub the toolrunner.ToolRunner constructor.
 */
export async function getCodeQLForTesting(
  cmd = "codeql-for-testing",
): Promise<CodeQL> {
  return getCodeQLForCmd(cmd, false);
}

/**
 * Return a CodeQL object for CodeQL CLI access.
 *
 * @param cmd Path to CodeQL CLI
 * @param checkVersion Whether to check that CodeQL CLI meets the minimum
 *        version requirement. Must be set to true outside tests.
 * @returns A new CodeQL object
 */
export async function getCodeQLForCmd(
  cmd: string,
  checkVersion: boolean,
): Promise<CodeQL> {
  const codeql: CodeQL = {
    getPath() {
      return cmd;
    },
    async getVersion() {
      let result = util.getCachedCodeQlVersion();
      if (result === undefined) {
        const output = await runCli(cmd, ["version", "--format=json"], {
          noStreamStdout: true,
        });
        try {
          result = JSON.parse(output) as VersionInfo;
        } catch {
          throw Error(
            `Invalid JSON output from \`version --format=json\`: ${output}`,
          );
        }
        util.cacheCodeQlVersion(result);
      }
      return result;
    },
    async printVersion() {
      await runCli(cmd, ["version", "--format=json"]);
    },
    async supportsFeature(feature: ToolsFeature) {
      return isSupportedToolsFeature(await this.getVersion(), feature);
    },
    async isTracedLanguage(language: Language) {
      const extractorPath = await this.resolveExtractor(language);
      const tracingConfigPath = path.join(
        extractorPath,
        "tools",
        "tracing-config.lua",
      );
      return fs.existsSync(tracingConfigPath);
    },
    async isScannedLanguage(language: Language) {
      return !(await this.isTracedLanguage(language));
    },
    async databaseInitCluster(
      config: Config,
      sourceRoot: string,
      processName: string | undefined,
      qlconfigFile: string | undefined,
      logger: Logger,
    ) {
      const extraArgs = config.languages.map(
        (language) => `--language=${language}`,
      );
      if (await shouldEnableIndirectTracing(codeql, config)) {
        extraArgs.push("--begin-tracing");
        extraArgs.push(...(await getTrapCachingExtractorConfigArgs(config)));
        extraArgs.push(`--trace-process-name=${processName}`);
      }

      const codeScanningConfigFile = await writeCodeScanningConfigFile(
        config,
        logger,
      );
      const externalRepositoryToken = getOptionalInput(
        "external-repository-token",
      );
      extraArgs.push(`--codescanning-config=${codeScanningConfigFile}`);
      if (externalRepositoryToken) {
        extraArgs.push("--external-repository-token-stdin");
      }

      if (config.buildMode !== undefined) {
        extraArgs.push(`--build-mode=${config.buildMode}`);
      }
      if (qlconfigFile !== undefined) {
        extraArgs.push(`--qlconfig-file=${qlconfigFile}`);
      }

      const overwriteFlag = isSupportedToolsFeature(
        await this.getVersion(),
        ToolsFeature.ForceOverwrite,
      )
        ? "--force-overwrite"
        : "--overwrite";

      const overlayDatabaseMode = config.overlayDatabaseMode;
      if (overlayDatabaseMode === OverlayDatabaseMode.Overlay) {
        const overlayChangesFile = await writeOverlayChangesFile(
          config,
          sourceRoot,
          logger,
        );
        extraArgs.push(`--overlay-changes=${overlayChangesFile}`);
      } else if (overlayDatabaseMode === OverlayDatabaseMode.OverlayBase) {
        extraArgs.push("--overlay-base");
      }

      await runCli(
        cmd,
        [
          "database",
          "init",
          ...(overlayDatabaseMode === OverlayDatabaseMode.Overlay
            ? []
            : [overwriteFlag]),
          "--db-cluster",
          config.dbLocation,
          `--source-root=${sourceRoot}`,
          "--calculate-language-specific-baseline",
          "--extractor-include-aliases",
          "--sublanguage-file-coverage",
          ...extraArgs,
          ...getExtraOptionsFromEnv(["database", "init"], {
            ignoringOptions: ["--overwrite"],
          }),
        ],
        { stdin: externalRepositoryToken },
      );

      if (overlayDatabaseMode === OverlayDatabaseMode.OverlayBase) {
        await writeBaseDatabaseOidsFile(config, sourceRoot);
      }
    },
    async runAutobuild(config: Config, language: Language) {
      applyAutobuildAzurePipelinesTimeoutFix();

      const autobuildCmd = path.join(
        await this.resolveExtractor(language),
        "tools",
        process.platform === "win32" ? "autobuild.cmd" : "autobuild.sh",
      );

      // Bump the verbosity of the autobuild command if we're in debug mode
      if (config.debugMode) {
        process.env[EnvVar.CLI_VERBOSITY] =
          process.env[EnvVar.CLI_VERBOSITY] || EXTRACTION_DEBUG_MODE_VERBOSITY;
      }

      // On macOS, System Integrity Protection (SIP) typically interferes with
      // CodeQL build tracing of protected binaries.
      // The usual workaround is to prefix `$CODEQL_RUNNER` to build commands:
      // `$CODEQL_RUNNER` (not to be confused with the deprecated CodeQL Runner tool)
      // points to a simple wrapper binary included with the CLI, and the extra layer of
      // process indirection helps the tracer bypass SIP.

      // The above SIP workaround is *not* needed here.
      // At the `autobuild` step in the Actions workflow, we assume the `init` step
      // has successfully run, and will have exported `DYLD_INSERT_LIBRARIES`
      // into the environment of subsequent steps, to activate the tracer.
      // When `DYLD_INSERT_LIBRARIES` is set in the environment for a step,
      // the Actions runtime introduces its own workaround for SIP
      // (https://github.com/actions/runner/pull/416).
      await runCli(autobuildCmd);
    },
    async extractScannedLanguage(config: Config, language: Language) {
      await runCli(cmd, [
        "database",
        "trace-command",
        "--index-traceless-dbs",
        ...(await getTrapCachingExtractorConfigArgsForLang(config, language)),
        ...getExtractionVerbosityArguments(config.debugMode),
        ...getExtraOptionsFromEnv(["database", "trace-command"]),
        util.getCodeQLDatabasePath(config, language),
      ]);
    },
    async extractUsingBuildMode(config: Config, language: Language) {
      if (config.buildMode === BuildMode.Autobuild) {
        applyAutobuildAzurePipelinesTimeoutFix();
      }
      try {
        await runCli(cmd, [
          "database",
          "trace-command",
          "--use-build-mode",
          "--working-dir",
          process.cwd(),
          ...(await getTrapCachingExtractorConfigArgsForLang(config, language)),
          ...getExtractionVerbosityArguments(config.debugMode),
          ...getExtraOptionsFromEnv(["database", "trace-command"]),
          util.getCodeQLDatabasePath(config, language),
        ]);
      } catch (e) {
        if (config.buildMode === BuildMode.Autobuild) {
          const prefix =
            "We were unable to automatically build your code. " +
            "Please change the build mode for this language to manual and specify build steps " +
            `for your project. See ${DocUrl.AUTOMATIC_BUILD_FAILED} for more information.`;
          throw new util.ConfigurationError(`${prefix} ${getErrorMessage(e)}`);
        } else {
          throw e;
        }
      }
    },
    async finalizeDatabase(
      databasePath: string,
      threadsFlag: string,
      memoryFlag: string,
      enableDebugLogging: boolean,
    ) {
      const args = [
        "database",
        "finalize",
        "--finalize-dataset",
        threadsFlag,
        memoryFlag,
        ...getExtractionVerbosityArguments(enableDebugLogging),
        ...getExtraOptionsFromEnv(["database", "finalize"]),
        databasePath,
      ];
      await runCli(cmd, args);
    },
    async resolveLanguages() {
      const codeqlArgs = [
        "resolve",
        "languages",
        "--format=json",
        ...getExtraOptionsFromEnv(["resolve", "languages"]),
      ];
      const output = await runCli(cmd, codeqlArgs);

      try {
        return JSON.parse(output) as ResolveLanguagesOutput;
      } catch (e) {
        throw new Error(
          `Unexpected output from codeql resolve languages: ${e}`,
        );
      }
    },
    async betterResolveLanguages(
      {
        filterToLanguagesWithQueries,
      }: {
        filterToLanguagesWithQueries: boolean;
      } = { filterToLanguagesWithQueries: false },
    ) {
      const codeqlArgs = [
        "resolve",
        "languages",
        "--format=betterjson",
        "--extractor-options-verbosity=4",
        "--extractor-include-aliases",
        ...(filterToLanguagesWithQueries
          ? ["--filter-to-languages-with-queries"]
          : []),
        ...getExtraOptionsFromEnv(["resolve", "languages"]),
      ];
      const output = await runCli(cmd, codeqlArgs);

      try {
        return JSON.parse(output) as BetterResolveLanguagesOutput;
      } catch (e) {
        throw new Error(
          `Unexpected output from codeql resolve languages with --format=betterjson: ${e}`,
        );
      }
    },
    async resolveBuildEnvironment(
      workingDir: string | undefined,
      language: string,
    ) {
      const codeqlArgs = [
        "resolve",
        "build-environment",
        `--language=${language}`,
        "--extractor-include-aliases",
        ...getExtraOptionsFromEnv(["resolve", "build-environment"]),
      ];
      if (workingDir !== undefined) {
        codeqlArgs.push("--working-dir", workingDir);
      }
      const output = await runCli(cmd, codeqlArgs);

      try {
        return JSON.parse(output) as ResolveBuildEnvironmentOutput;
      } catch (e) {
        throw new Error(
          `Unexpected output from codeql resolve build-environment: ${e} in\n${output}`,
        );
      }
    },
    async databaseRunQueries(
      databasePath: string,
      flags: string[],
      queries: string[] = [],
    ): Promise<void> {
      const codeqlArgs = [
        "database",
        "run-queries",
        ...flags,
        databasePath,
        "--min-disk-free=1024", // Try to leave at least 1GB free
        "-v",
        ...queries,
        ...getExtraOptionsFromEnv(["database", "run-queries"], {
          ignoringOptions: ["--expect-discarded-cache"],
        }),
      ];
      await runCli(cmd, codeqlArgs);
    },
    async databaseInterpretResults(
      databasePath: string,
      querySuitePaths: string[] | undefined,
      sarifFile: string,
      addSnippetsFlag: string,
      threadsFlag: string,
      verbosityFlag: string,
      sarifRunPropertyFlag: string | undefined,
      automationDetailsId: string | undefined,
      config: Config,
      features: FeatureEnablement,
    ): Promise<string> {
      const shouldExportDiagnostics = await features.getValue(
        Feature.ExportDiagnosticsEnabled,
        this,
      );
      const codeqlArgs = [
        "database",
        "interpret-results",
        threadsFlag,
        "--format=sarif-latest",
        verbosityFlag,
        `--output=${sarifFile}`,
        addSnippetsFlag,
        "--print-diagnostics-summary",
        "--print-metrics-summary",
        "--sarif-add-baseline-file-info",
        `--sarif-codescanning-config=${getGeneratedCodeScanningConfigPath(
          config,
        )}`,
        "--sarif-group-rules-by-pack",
        "--sarif-include-query-help=always",
        "--sublanguage-file-coverage",
        ...(await getJobRunUuidSarifOptions(this)),
        ...getExtraOptionsFromEnv(["database", "interpret-results"]),
      ];
      if (sarifRunPropertyFlag !== undefined) {
        codeqlArgs.push(sarifRunPropertyFlag);
      }
      if (automationDetailsId !== undefined) {
        codeqlArgs.push("--sarif-category", automationDetailsId);
      }
      if (shouldExportDiagnostics) {
        codeqlArgs.push("--sarif-include-diagnostics");
      } else {
        codeqlArgs.push("--no-sarif-include-diagnostics");
      }
      if (
        !isSupportedToolsFeature(
          await this.getVersion(),
          ToolsFeature.AnalysisSummaryV2IsDefault,
        )
      ) {
        codeqlArgs.push("--new-analysis-summary");
      }
      codeqlArgs.push(databasePath);
      if (querySuitePaths) {
        codeqlArgs.push(...querySuitePaths);
      }
      // Capture the stdout, which contains the analysis summary. Don't stream it to the Actions
      // logs to avoid printing it twice.
      return await runCli(cmd, codeqlArgs, {
        noStreamStdout: true,
      });
    },
    async databasePrintBaseline(databasePath: string): Promise<string> {
      const codeqlArgs = [
        "database",
        "print-baseline",
        ...getExtraOptionsFromEnv(["database", "print-baseline"]),
        databasePath,
      ];
      return await runCli(cmd, codeqlArgs);
    },
    async databaseCleanupCluster(
      config: Config,
      cleanupLevel: string,
    ): Promise<void> {
      const cacheCleanupFlag = (await util.codeQlVersionAtLeast(
        this,
        CODEQL_VERSION_CACHE_CLEANUP,
      ))
        ? "--cache-cleanup"
        : "--mode";
      for (const language of config.languages) {
        const databasePath = util.getCodeQLDatabasePath(config, language);
        const codeqlArgs = [
          "database",
          "cleanup",
          databasePath,
          `${cacheCleanupFlag}=${cleanupLevel}`,
          ...getExtraOptionsFromEnv(["database", "cleanup"]),
        ];
        await runCli(cmd, codeqlArgs);
      }
    },
    async databaseBundle(
      databasePath: string,
      outputFilePath: string,
      databaseName: string,
    ): Promise<void> {
      const args = [
        "database",
        "bundle",
        databasePath,
        `--output=${outputFilePath}`,
        `--name=${databaseName}`,
        ...getExtraOptionsFromEnv(["database", "bundle"]),
      ];
      await new toolrunner.ToolRunner(cmd, args).exec();
    },
    async databaseExportDiagnostics(
      databasePath: string,
      sarifFile: string,
      automationDetailsId: string | undefined,
    ): Promise<void> {
      const args = [
        "database",
        "export-diagnostics",
        `${databasePath}`,
        "--db-cluster", // Database is always a cluster for CodeQL versions that support diagnostics.
        "--format=sarif-latest",
        `--output=${sarifFile}`,
        "--sarif-include-diagnostics", // ExportDiagnosticsEnabled is always true if this command is run.
        "-vvv",
        ...getExtraOptionsFromEnv(["diagnostics", "export"]),
      ];
      if (automationDetailsId !== undefined) {
        args.push("--sarif-category", automationDetailsId);
      }
      await new toolrunner.ToolRunner(cmd, args).exec();
    },
    async diagnosticsExport(
      sarifFile: string,
      automationDetailsId: string | undefined,
      config: Config,
    ): Promise<void> {
      const args = [
        "diagnostics",
        "export",
        "--format=sarif-latest",
        `--output=${sarifFile}`,
        `--sarif-codescanning-config=${getGeneratedCodeScanningConfigPath(
          config,
        )}`,
        ...getExtraOptionsFromEnv(["diagnostics", "export"]),
      ];
      if (automationDetailsId !== undefined) {
        args.push("--sarif-category", automationDetailsId);
      }
      await new toolrunner.ToolRunner(cmd, args).exec();
    },
    async resolveExtractor(language: Language): Promise<string> {
      // Request it using `format=json` so we don't need to strip the trailing new line generated by
      // the CLI.
      let extractorPath = "";
      await new toolrunner.ToolRunner(
        cmd,
        [
          "resolve",
          "extractor",
          "--format=json",
          `--language=${language}`,
          "--extractor-include-aliases",
          ...getExtraOptionsFromEnv(["resolve", "extractor"]),
        ],
        {
          silent: true,
          listeners: {
            stdout: (data) => {
              extractorPath += data.toString();
            },
            stderr: (data) => {
              process.stderr.write(data);
            },
          },
        },
      ).exec();
      return JSON.parse(extractorPath) as string;
    },
    async resolveQueriesStartingPacks(queries: string[]): Promise<string[]> {
      const codeqlArgs = [
        "resolve",
        "queries",
        "--format=startingpacks",
        ...getExtraOptionsFromEnv(["resolve", "queries"]),
        ...queries,
      ];
      const output = await runCli(cmd, codeqlArgs, { noStreamStdout: true });

      try {
        return JSON.parse(output) as string[];
      } catch (e) {
        throw new Error(
          `Unexpected output from codeql resolve queries --format=startingpacks: ${e}`,
        );
      }
    },
    async mergeResults(
      sarifFiles: string[],
      outputFile: string,
      {
        mergeRunsFromEqualCategory = false,
      }: { mergeRunsFromEqualCategory?: boolean },
    ): Promise<void> {
      const args = [
        "github",
        "merge-results",
        "--output",
        outputFile,
        ...getExtraOptionsFromEnv(["github", "merge-results"]),
      ];

      for (const sarifFile of sarifFiles) {
        args.push("--sarif", sarifFile);
      }

      if (mergeRunsFromEqualCategory) {
        args.push("--sarif-merge-runs-from-equal-category");
      }

      await runCli(cmd, args);
    },
  };
  // To ensure that status reports include the CodeQL CLI version wherever
  // possible, we want to call getVersion(), which populates the version value
  // used by status reporting, at the earliest opportunity. But invoking
  // getVersion() directly here breaks tests that only pretend to create a
  // CodeQL object. So instead we rely on the assumption that all non-test
  // callers would set checkVersion to true, and util.codeQlVersionAbove()
  // would call getVersion(), so the CLI version would be cached as soon as the
  // CodeQL object is created.
  if (
    checkVersion &&
    !(await util.codeQlVersionAtLeast(codeql, CODEQL_MINIMUM_VERSION))
  ) {
    throw new util.ConfigurationError(
      `Expected a CodeQL CLI with version at least ${CODEQL_MINIMUM_VERSION} but got version ${
        (await codeql.getVersion()).version
      }`,
    );
  } else if (
    checkVersion &&
    process.env[EnvVar.SUPPRESS_DEPRECATED_SOON_WARNING] !== "true" &&
    !(await util.codeQlVersionAtLeast(codeql, CODEQL_NEXT_MINIMUM_VERSION))
  ) {
    const result = await codeql.getVersion();
    core.warning(
      `CodeQL CLI version ${result.version} was discontinued on ` +
        `${GHES_MOST_RECENT_DEPRECATION_DATE} alongside GitHub Enterprise Server ` +
        `${GHES_VERSION_MOST_RECENTLY_DEPRECATED} and will not be supported by the next minor ` +
        `release of the CodeQL Action. Please update to CodeQL CLI version ` +
        `${CODEQL_NEXT_MINIMUM_VERSION} or later. For instance, if you have specified a custom ` +
        "version of the CLI using the 'tools' input to the 'init' Action, you can remove this " +
        "input to use the default version.\n\n" +
        "Alternatively, if you want to continue using CodeQL CLI version " +
        `${result.version}, you can replace 'github/codeql-action/*@v${
          getActionVersion().split(".")[0]
        }' by 'github/codeql-action/*@v${getActionVersion()}' in your code scanning workflow to ` +
        "continue using this version of the CodeQL Action.",
    );
    core.exportVariable(EnvVar.SUPPRESS_DEPRECATED_SOON_WARNING, "true");
  }
  return codeql;
}

/**
 * Gets the options for `path` of `options` as an array of extra option strings.
 *
 * @param ignoringOptions Options that should be ignored, for example because they have already
 *                        been passed and it is an error to pass them more than once.
 */
function getExtraOptionsFromEnv(
  paths: string[],
  { ignoringOptions }: { ignoringOptions?: string[] } = {},
) {
  const options: ExtraOptions = util.getExtraOptionsEnvParam();
  return getExtraOptions(options, paths, []).filter(
    (option) => !ignoringOptions?.includes(option),
  );
}

/**
 * Gets `options` as an array of extra option strings.
 *
 * - throws an exception mentioning `pathInfo` if this conversion is impossible.
 */
function asExtraOptions(options: any, pathInfo: string[]): string[] {
  if (options === undefined) {
    return [];
  }
  if (!Array.isArray(options)) {
    const msg = `The extra options for '${pathInfo.join(
      ".",
    )}' ('${JSON.stringify(options)}') are not in an array.`;
    throw new Error(msg);
  }
  return options.map((o) => {
    const t = typeof o;
    if (t !== "string" && t !== "number" && t !== "boolean") {
      const msg = `The extra option for '${pathInfo.join(
        ".",
      )}' ('${JSON.stringify(o)}') is not a primitive value.`;
      throw new Error(msg);
    }
    return `${o}`;
  });
}

/**
 * Gets the options for `path` of `options` as an array of extra option strings.
 *
 * - the special terminal step name '*' in `options` matches all path steps
 * - throws an exception if this conversion is impossible.
 *
 * Exported for testing.
 */
export function getExtraOptions(
  options: any,
  paths: string[],
  pathInfo: string[],
): string[] {
  const all = asExtraOptions(options?.["*"], pathInfo.concat("*"));
  const specific =
    paths.length === 0
      ? asExtraOptions(options, pathInfo)
      : getExtraOptions(
          options?.[paths[0]],
          paths?.slice(1),
          pathInfo.concat(paths[0]),
        );
  return all.concat(specific);
}

async function runCli(
  cmd: string,
  args: string[] = [],
  opts: { stdin?: string; noStreamStdout?: boolean } = {},
): Promise<string> {
  try {
    return await runTool(cmd, args, opts);
  } catch (e) {
    if (e instanceof CommandInvocationError) {
      throw wrapCliConfigurationError(new CliError(e));
    }
    throw e;
  }
}

/**
 * Writes the code scanning configuration that is to be used by the CLI.
 *
 * @param codeql The CodeQL object to use.
 * @param config The CodeQL Action state to use.
 * @returns The path to the generated user configuration file.
 */
async function writeCodeScanningConfigFile(
  config: Config,
  logger: Logger,
): Promise<string> {
  const codeScanningConfigFile = getGeneratedCodeScanningConfigPath(config);

  // Apply the `extraQueryExclusions` from the CodeQL Action state to the CLI configuration.
  // We do this here at the latest possible point before passing the CLI configuration on to
  // the CLI so that the `extraQueryExclusions` appear after all user-configured `query-filters`.
  // See the comment in `applyExtraQueryExclusions` for more information, as well as
  // https://github.com/github/codeql-action/pull/2938
  const augmentedConfig = appendExtraQueryExclusions(
    config.extraQueryExclusions,
    config.computedConfig,
  );

  logger.info(
    `Writing augmented user configuration file to ${codeScanningConfigFile}`,
  );
  logger.startGroup("Augmented user configuration file contents");
  logger.info(yaml.dump(augmentedConfig));
  logger.endGroup();

  fs.writeFileSync(codeScanningConfigFile, yaml.dump(augmentedConfig));
  return codeScanningConfigFile;
}

// This constant sets the size of each TRAP cache in megabytes.
const TRAP_CACHE_SIZE_MB = 1024;

export async function getTrapCachingExtractorConfigArgs(
  config: Config,
): Promise<string[]> {
  const result: string[][] = [];
  for (const language of config.languages)
    result.push(
      await getTrapCachingExtractorConfigArgsForLang(config, language),
    );
  return result.flat();
}

export async function getTrapCachingExtractorConfigArgsForLang(
  config: Config,
  language: Language,
): Promise<string[]> {
  const cacheDir = config.trapCaches[language];
  if (cacheDir === undefined) return [];
  const write = await isAnalyzingDefaultBranch();
  return [
    `-O=${language}.trap.cache.dir=${cacheDir}`,
    `-O=${language}.trap.cache.bound=${TRAP_CACHE_SIZE_MB}`,
    `-O=${language}.trap.cache.write=${write}`,
  ];
}

/**
 * Get the path to the code scanning configuration generated by the CLI.
 *
 * This will not exist if the configuration is being parsed in the Action.
 */
export function getGeneratedCodeScanningConfigPath(config: Config): string {
  return path.resolve(config.tempDir, "user-config.yaml");
}

function getExtractionVerbosityArguments(
  enableDebugLogging: boolean,
): string[] {
  return enableDebugLogging
    ? [`--verbosity=${EXTRACTION_DEBUG_MODE_VERBOSITY}`]
    : [];
}

/**
 * Updates the `JAVA_TOOL_OPTIONS` environment variable to resolve an issue with Azure Pipelines
 * timing out connections after 4 minutes and Maven not properly handling closed connections.
 *
 * Without the fix, long build processes will timeout when pulling down Java packages
 * https://developercommunity.visualstudio.com/content/problem/292284/maven-hosted-agent-connection-timeout.html
 */
function applyAutobuildAzurePipelinesTimeoutFix() {
  const javaToolOptions = process.env["JAVA_TOOL_OPTIONS"] || "";
  process.env["JAVA_TOOL_OPTIONS"] = [
    ...javaToolOptions.split(/\s+/),
    "-Dhttp.keepAlive=false",
    "-Dmaven.wagon.http.pool=false",
  ].join(" ");
}

async function getJobRunUuidSarifOptions(codeql: CodeQL) {
  const jobRunUuid = process.env[EnvVar.JOB_RUN_UUID];

  return jobRunUuid &&
    (await codeql.supportsFeature(
      ToolsFeature.DatabaseInterpretResultsSupportsSarifRunProperty,
    ))
    ? [`--sarif-run-property=jobRunUuid=${jobRunUuid}`]
    : [];
}
