import * as fs from "fs";
import * as path from "path";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as yaml from "js-yaml";

import { getOptionalInput } from "./actions-util";
import * as api from "./api-client";
import { Config } from "./config-utils";
import { errorMatchers } from "./error-matcher";
import { CodeQLDefaultVersionInfo, FeatureEnablement } from "./feature-flags";
import { isTracedLanguage, Language } from "./languages";
import { Logger } from "./logging";
import * as setupCodeql from "./setup-codeql";
import { toolrunnerErrorCatcher } from "./toolrunner-error-catcher";
import {
  getTrapCachingExtractorConfigArgs,
  getTrapCachingExtractorConfigArgsForLang,
} from "./trap-caching";
import * as util from "./util";

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
}

export class CommandInvocationError extends Error {
  constructor(
    cmd: string,
    args: string[],
    exitCode: number,
    error: string,
    public output: string
  ) {
    super(
      `Failure invoking ${cmd} with arguments ${args}.\n
      Exit code ${exitCode} and error was:\n
      ${error}`
    );
  }
}

export interface CodeQL {
  /**
   * Get the path of the CodeQL executable.
   */
  getPath(): string;
  /**
   * Get a string containing the semver version of the CodeQL executable.
   */
  getVersion(): Promise<string>;
  /**
   * Print version information about CodeQL.
   */
  printVersion(): Promise<void>;
  /**
   * Run 'codeql database trace-command' on 'tracer-env.js' and parse
   * the result to get environment variables set by CodeQL.
   */
  getTracerEnv(databasePath: string): Promise<{ [key: string]: string }>;
  /**
   * Run 'codeql database init'.
   */
  databaseInit(
    databasePath: string,
    language: Language,
    sourceRoot: string
  ): Promise<void>;
  /**
   * Run 'codeql database init --db-cluster'.
   */
  databaseInitCluster(
    config: Config,
    sourceRoot: string,
    processName: string | undefined,
    featureEnablement: FeatureEnablement,
    logger: Logger
  ): Promise<void>;
  /**
   * Runs the autobuilder for the given language.
   */
  runAutobuild(language: Language): Promise<void>;
  /**
   * Extract code for a scanned language using 'codeql database trace-command'
   * and running the language extractor.
   */
  extractScannedLanguage(config: Config, language: Language): Promise<void>;
  /**
   * Finalize a database using 'codeql database finalize'.
   */
  finalizeDatabase(
    databasePath: string,
    threadsFlag: string,
    memoryFlag: string
  ): Promise<void>;
  /**
   * Run 'codeql resolve languages'.
   */
  resolveLanguages(): Promise<ResolveLanguagesOutput>;
  /**
   * Run 'codeql resolve languages' with '--format=betterjson'.
   */
  betterResolveLanguages(): Promise<BetterResolveLanguagesOutput>;
  /**
   * Run 'codeql resolve queries'.
   */
  resolveQueries(
    queries: string[],
    extraSearchPath: string | undefined
  ): Promise<ResolveQueriesOutput>;

  /**
   * Run 'codeql pack download'.
   */
  packDownload(
    packs: string[],
    qlconfigFile: string | undefined
  ): Promise<PackDownloadOutput>;

  /**
   * Run 'codeql database cleanup'.
   */
  databaseCleanup(databasePath: string, cleanupLevel: string): Promise<void>;
  /**
   * Run 'codeql database bundle'.
   */
  databaseBundle(
    databasePath: string,
    outputFilePath: string,
    dbName: string
  ): Promise<void>;
  /**
   * Run 'codeql database run-queries'.
   */
  databaseRunQueries(
    databasePath: string,
    extraSearchPath: string | undefined,
    querySuitePath: string | undefined,
    memoryFlag: string,
    threadsFlag: string
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
    automationDetailsId: string | undefined
  ): Promise<string>;
  /**
   * Run 'codeql database print-baseline'.
   */
  databasePrintBaseline(databasePath: string): Promise<string>;
  /**
   * Run 'codeql diagnostics export'.
   */
  diagnosticsExport(
    sarifFile: string,
    automationDetailsId: string | undefined
  ): Promise<void>;
}

export interface ResolveLanguagesOutput {
  [language: string]: [string];
}

export interface BetterResolveLanguagesOutput {
  extractors: {
    [language: string]: [
      {
        extractor_root: string;
        extractor_options?: any;
      }
    ];
  };
}

export interface ResolveQueriesOutput {
  byLanguage: {
    [language: string]: {
      [queryPath: string]: {};
    };
  };
  noDeclaredLanguage: {
    [queryPath: string]: {};
  };
  multipleDeclaredLanguages: {
    [queryPath: string]: {};
  };
}

export interface PackDownloadOutput {
  packs: PackDownloadItem[];
}

interface PackDownloadItem {
  name: string;
  version: string;
  packDir: string;
  installResult: string;
}

/**
 * Stores the CodeQL object, and is populated by `setupCodeQL` or `getCodeQL`.
 * Can be overridden in tests using `setCodeQL`.
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
const CODEQL_MINIMUM_VERSION = "2.6.3";

/**
 * Versions of CodeQL that version-flag certain functionality in the Action.
 * For convenience, please keep these in descending order. Once a version
 * flag is older than the oldest supported version above, it may be removed.
 */
const CODEQL_VERSION_CUSTOM_QUERY_HELP = "2.7.1";
const CODEQL_VERSION_LUA_TRACER_CONFIG = "2.10.0";
const CODEQL_VERSION_LUA_TRACING_GO_WINDOWS_FIXED = "2.10.4";
export const CODEQL_VERSION_GHES_PACK_DOWNLOAD = "2.10.4";
const CODEQL_VERSION_FILE_BASELINE_INFORMATION = "2.11.3";

/**
 * This variable controls using the new style of tracing from the CodeQL
 * CLI. In particular, with versions above this we will use both indirect
 * tracing, and multi-language tracing together with database clusters.
 *
 * Note that there were bugs in both of these features that were fixed in
 * release 2.7.0 of the CodeQL CLI, therefore this flag is only enabled for
 * versions above that.
 */
export const CODEQL_VERSION_NEW_TRACING = "2.7.0";

/**
 * Versions 2.7.3+ of the CodeQL CLI support build tracing with glibc 2.34 on Linux. Versions before
 * this cannot perform build tracing when running on the Actions `ubuntu-22.04` runner image.
 */
export const CODEQL_VERSION_TRACING_GLIBC_2_34 = "2.7.3";

/**
 * Versions 2.9.0+ of the CodeQL CLI run machine learning models from a temporary directory, which
 * resolves an issue on Windows where TensorFlow models are not correctly loaded due to the path of
 * some of their files being greater than MAX_PATH (260 characters).
 */
export const CODEQL_VERSION_ML_POWERED_QUERIES_WINDOWS = "2.9.0";

/**
 * Previous versions had the option already, but were missing the
 * --extractor-options-verbosity that we need.
 */
export const CODEQL_VERSION_BETTER_RESOLVE_LANGUAGES = "2.10.3";

/**
 * Set up CodeQL CLI access.
 *
 * @param toolsInput
 * @param apiDetails
 * @param tempDir
 * @param variant
 * @param bypassToolcache
 * @param defaultCliVersion
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
  bypassToolcache: boolean,
  defaultCliVersion: CodeQLDefaultVersionInfo,
  logger: Logger,
  checkVersion: boolean
): Promise<{ codeql: CodeQL; toolsVersion: string }> {
  try {
    const { codeqlFolder, toolsVersion } = await setupCodeql.setupCodeQLBundle(
      toolsInput,
      apiDetails,
      tempDir,
      variant,
      bypassToolcache,
      defaultCliVersion,
      logger
    );
    let codeqlCmd = path.join(codeqlFolder, "codeql", "codeql");
    if (process.platform === "win32") {
      codeqlCmd += ".exe";
    } else if (process.platform !== "linux" && process.platform !== "darwin") {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }

    cachedCodeQL = await getCodeQLForCmd(codeqlCmd, checkVersion);
    return { codeql: cachedCodeQL, toolsVersion };
  } catch (e) {
    logger.error(e instanceof Error ? e : new Error(String(e)));
    throw new Error("Unable to download and extract CodeQL CLI");
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

function resolveFunction<T>(
  partialCodeql: Partial<CodeQL>,
  methodName: string,
  defaultImplementation?: T
): T {
  if (typeof partialCodeql[methodName] !== "function") {
    if (defaultImplementation !== undefined) {
      return defaultImplementation;
    }
    const dummyMethod = () => {
      throw new Error(`CodeQL ${methodName} method not correctly defined`);
    };
    return dummyMethod as any;
  }
  return partialCodeql[methodName];
}

/**
 * Set the functionality for CodeQL methods. Only for use in tests.
 *
 * Accepts a partial object and any undefined methods will be implemented
 * to immediately throw an exception indicating which method is missing.
 */
export function setCodeQL(partialCodeql: Partial<CodeQL>): CodeQL {
  cachedCodeQL = {
    getPath: resolveFunction(partialCodeql, "getPath", () => "/tmp/dummy-path"),
    getVersion: resolveFunction(
      partialCodeql,
      "getVersion",
      () => new Promise((resolve) => resolve("1.0.0"))
    ),
    printVersion: resolveFunction(partialCodeql, "printVersion"),
    getTracerEnv: resolveFunction(partialCodeql, "getTracerEnv"),
    databaseInit: resolveFunction(partialCodeql, "databaseInit"),
    databaseInitCluster: resolveFunction(partialCodeql, "databaseInitCluster"),
    runAutobuild: resolveFunction(partialCodeql, "runAutobuild"),
    extractScannedLanguage: resolveFunction(
      partialCodeql,
      "extractScannedLanguage"
    ),
    finalizeDatabase: resolveFunction(partialCodeql, "finalizeDatabase"),
    resolveLanguages: resolveFunction(partialCodeql, "resolveLanguages"),
    betterResolveLanguages: resolveFunction(
      partialCodeql,
      "betterResolveLanguages"
    ),
    resolveQueries: resolveFunction(partialCodeql, "resolveQueries"),
    packDownload: resolveFunction(partialCodeql, "packDownload"),
    databaseCleanup: resolveFunction(partialCodeql, "databaseCleanup"),
    databaseBundle: resolveFunction(partialCodeql, "databaseBundle"),
    databaseRunQueries: resolveFunction(partialCodeql, "databaseRunQueries"),
    databaseInterpretResults: resolveFunction(
      partialCodeql,
      "databaseInterpretResults"
    ),
    databasePrintBaseline: resolveFunction(
      partialCodeql,
      "databasePrintBaseline"
    ),
    diagnosticsExport: resolveFunction(partialCodeql, "diagnosticsExport"),
  };
  return cachedCodeQL;
}

/**
 * Get the cached CodeQL object. Should only be used from tests.
 *
 * TODO: Work out a good way for tests to get this from the test context
 * instead of having to have this method.
 */
export function getCachedCodeQL(): CodeQL {
  if (cachedCodeQL === undefined) {
    // Should never happen as setCodeQL is called by testing-utils.setupTests
    throw new Error("cachedCodeQL undefined");
  }
  return cachedCodeQL;
}

/**
 * Get a real, newly created CodeQL instance for testing. The instance refers to
 * a non-existent placeholder codeql command, so tests that use this function
 * should also stub the toolrunner.ToolRunner constructor.
 */
export async function getCodeQLForTesting(
  cmd = "codeql-for-testing"
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
  checkVersion: boolean
): Promise<CodeQL> {
  const codeql: CodeQL = {
    getPath() {
      return cmd;
    },
    async getVersion() {
      let result = util.getCachedCodeQlVersion();
      if (result === undefined) {
        result = (await runTool(cmd, ["version", "--format=terse"])).trim();
        util.cacheCodeQlVersion(result);
      }
      return result;
    },
    async printVersion() {
      await runTool(cmd, ["version", "--format=json"]);
    },
    async getTracerEnv(databasePath: string) {
      // Write tracer-env.js to a temp location.
      // BEWARE: The name and location of this file is recognized by `codeql database
      // trace-command` in order to enable special support for concatenable tracer
      // configurations. Consequently the name must not be changed.
      // (This warning can be removed once a different way to recognize the
      // action/runner has been implemented in `codeql database trace-command`
      // _and_ is present in the latest supported CLI release.)
      const tracerEnvJs = path.resolve(
        databasePath,
        "working",
        "tracer-env.js"
      );

      fs.mkdirSync(path.dirname(tracerEnvJs), { recursive: true });
      fs.writeFileSync(
        tracerEnvJs,
        `
        const fs = require('fs');
        const env = {};
        for (let entry of Object.entries(process.env)) {
          const key = entry[0];
          const value = entry[1];
          if (typeof value !== 'undefined' && key !== '_' && !key.startsWith('JAVA_MAIN_CLASS_')) {
            env[key] = value;
          }
        }
        process.stdout.write(process.argv[2]);
        fs.writeFileSync(process.argv[2], JSON.stringify(env), 'utf-8');`
      );

      // BEWARE: The name and location of this file is recognized by `codeql database
      // trace-command` in order to enable special support for concatenable tracer
      // configurations. Consequently the name must not be changed.
      // (This warning can be removed once a different way to recognize the
      // action/runner has been implemented in `codeql database trace-command`
      // _and_ is present in the latest supported CLI release.)
      const envFile = path.resolve(databasePath, "working", "env.tmp");

      try {
        await runTool(cmd, [
          "database",
          "trace-command",
          databasePath,
          ...getExtraOptionsFromEnv(["database", "trace-command"]),
          process.execPath,
          tracerEnvJs,
          envFile,
        ]);
      } catch (e) {
        if (
          e instanceof CommandInvocationError &&
          e.output.includes(
            "undefined symbol: __libc_dlopen_mode, version GLIBC_PRIVATE"
          ) &&
          process.platform === "linux" &&
          !(await util.codeQlVersionAbove(
            this,
            CODEQL_VERSION_TRACING_GLIBC_2_34
          ))
        ) {
          throw new util.UserError(
            "The CodeQL CLI is incompatible with the version of glibc on your system. " +
              `Please upgrade to CodeQL CLI version ${CODEQL_VERSION_TRACING_GLIBC_2_34} or ` +
              "later. If you cannot upgrade to a newer version of the CodeQL CLI, you can " +
              `alternatively run your workflow on another runner image such as "ubuntu-20.04" ` +
              "that has glibc 2.33 or earlier installed."
          );
        } else {
          throw e;
        }
      }
      return JSON.parse(fs.readFileSync(envFile, "utf-8"));
    },
    async databaseInit(
      databasePath: string,
      language: Language,
      sourceRoot: string
    ) {
      await runTool(cmd, [
        "database",
        "init",
        databasePath,
        `--language=${language}`,
        `--source-root=${sourceRoot}`,
        ...getExtraOptionsFromEnv(["database", "init"]),
      ]);
    },
    async databaseInitCluster(
      config: Config,
      sourceRoot: string,
      processName: string | undefined,
      featureEnablement: FeatureEnablement,
      logger: Logger
    ) {
      const extraArgs = config.languages.map(
        (language) => `--language=${language}`
      );
      if (config.languages.filter((l) => isTracedLanguage(l)).length > 0) {
        extraArgs.push("--begin-tracing");
        extraArgs.push(...(await getTrapCachingExtractorConfigArgs(config)));
        extraArgs.push(`--trace-process-name=${processName}`);
        if (
          // There's a bug in Lua tracing for Go on Windows in versions earlier than
          // `CODEQL_VERSION_LUA_TRACING_GO_WINDOWS_FIXED`, so don't use Lua tracing
          // when tracing Go on Windows on these CodeQL versions.
          (await util.codeQlVersionAbove(
            this,
            CODEQL_VERSION_LUA_TRACER_CONFIG
          )) &&
          config.languages.includes(Language.go) &&
          isTracedLanguage(Language.go) &&
          process.platform === "win32" &&
          !(await util.codeQlVersionAbove(
            this,
            CODEQL_VERSION_LUA_TRACING_GO_WINDOWS_FIXED
          ))
        ) {
          extraArgs.push("--no-internal-use-lua-tracing");
        }
      }

      // A config file is only generated if the CliConfigFileEnabled feature flag is enabled.
      const configLocation = await generateCodeScanningConfig(
        codeql,
        config,
        featureEnablement,
        logger
      );
      // Only pass external repository token if a config file is going to be parsed by the CLI.
      let externalRepositoryToken: string | undefined;
      if (configLocation) {
        extraArgs.push(`--codescanning-config=${configLocation}`);
        externalRepositoryToken = getOptionalInput("external-repository-token");
        if (externalRepositoryToken) {
          extraArgs.push("--external-repository-token-stdin");
        }
      }

      await runTool(
        cmd,
        [
          "database",
          "init",
          "--db-cluster",
          config.dbLocation,
          `--source-root=${sourceRoot}`,
          ...extraArgs,
          ...getExtraOptionsFromEnv(["database", "init"]),
        ],
        { stdin: externalRepositoryToken }
      );
    },
    async runAutobuild(language: Language) {
      const cmdName =
        process.platform === "win32" ? "autobuild.cmd" : "autobuild.sh";
      // The autobuilder for Swift is located in the experimental/ directory.
      const possibleExperimentalDir =
        language === Language.swift ? "experimental" : "";
      const autobuildCmd = path.join(
        path.dirname(cmd),
        possibleExperimentalDir,
        language,
        "tools",
        cmdName
      );

      // Update JAVA_TOOL_OPTIONS to contain '-Dhttp.keepAlive=false'
      // This is because of an issue with Azure pipelines timing out connections after 4 minutes
      // and Maven not properly handling closed connections
      // Otherwise long build processes will timeout when pulling down Java packages
      // https://developercommunity.visualstudio.com/content/problem/292284/maven-hosted-agent-connection-timeout.html
      const javaToolOptions = process.env["JAVA_TOOL_OPTIONS"] || "";
      process.env["JAVA_TOOL_OPTIONS"] = [
        ...javaToolOptions.split(/\s+/),
        "-Dhttp.keepAlive=false",
        "-Dmaven.wagon.http.pool=false",
      ].join(" ");

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
      await runTool(autobuildCmd);
    },
    async extractScannedLanguage(config: Config, language: Language) {
      const databasePath = util.getCodeQLDatabasePath(config, language);
      // Get extractor location
      let extractorPath = "";
      await new toolrunner.ToolRunner(
        cmd,
        [
          "resolve",
          "extractor",
          "--format=json",
          `--language=${language}`,
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
        }
      ).exec();

      // Set trace command
      const ext = process.platform === "win32" ? ".cmd" : ".sh";
      const traceCommand = path.resolve(
        JSON.parse(extractorPath),
        "tools",
        `autobuild${ext}`
      );
      // Run trace command
      await toolrunnerErrorCatcher(
        cmd,
        [
          "database",
          "trace-command",
          ...(await getTrapCachingExtractorConfigArgsForLang(config, language)),
          ...getExtraOptionsFromEnv(["database", "trace-command"]),
          databasePath,
          "--",
          traceCommand,
        ],
        errorMatchers
      );
    },
    async finalizeDatabase(
      databasePath: string,
      threadsFlag: string,
      memoryFlag: string
    ) {
      const args = [
        "database",
        "finalize",
        "--finalize-dataset",
        threadsFlag,
        memoryFlag,
        ...getExtraOptionsFromEnv(["database", "finalize"]),
        databasePath,
      ];
      await toolrunnerErrorCatcher(cmd, args, errorMatchers);
    },
    async resolveLanguages() {
      const codeqlArgs = [
        "resolve",
        "languages",
        "--format=json",
        ...getExtraOptionsFromEnv(["resolve", "languages"]),
      ];
      const output = await runTool(cmd, codeqlArgs);

      try {
        return JSON.parse(output);
      } catch (e) {
        throw new Error(
          `Unexpected output from codeql resolve languages: ${e}`
        );
      }
    },
    async betterResolveLanguages() {
      const codeqlArgs = [
        "resolve",
        "languages",
        "--format=betterjson",
        "--extractor-options-verbosity=4",
        ...getExtraOptionsFromEnv(["resolve", "languages"]),
      ];
      const output = await runTool(cmd, codeqlArgs);

      try {
        return JSON.parse(output);
      } catch (e) {
        throw new Error(
          `Unexpected output from codeql resolve languages with --format=betterjson: ${e}`
        );
      }
    },
    async resolveQueries(
      queries: string[],
      extraSearchPath: string | undefined
    ) {
      const codeqlArgs = [
        "resolve",
        "queries",
        ...queries,
        "--format=bylanguage",
        ...getExtraOptionsFromEnv(["resolve", "queries"]),
      ];
      if (extraSearchPath !== undefined) {
        codeqlArgs.push("--additional-packs", extraSearchPath);
      }
      const output = await runTool(cmd, codeqlArgs);

      try {
        return JSON.parse(output);
      } catch (e) {
        throw new Error(`Unexpected output from codeql resolve queries: ${e}`);
      }
    },
    async databaseRunQueries(
      databasePath: string,
      extraSearchPath: string | undefined,
      querySuitePath: string | undefined,
      memoryFlag: string,
      threadsFlag: string
    ): Promise<void> {
      const codeqlArgs = [
        "database",
        "run-queries",
        memoryFlag,
        threadsFlag,
        databasePath,
        "--min-disk-free=1024", // Try to leave at least 1GB free
        "-v",
        ...getExtraOptionsFromEnv(["database", "run-queries"]),
      ];
      if (extraSearchPath !== undefined) {
        codeqlArgs.push("--additional-packs", extraSearchPath);
      }
      if (querySuitePath) {
        codeqlArgs.push(querySuitePath);
      }
      await toolrunnerErrorCatcher(cmd, codeqlArgs, errorMatchers);
    },
    async databaseInterpretResults(
      databasePath: string,
      querySuitePaths: string[] | undefined,
      sarifFile: string,
      addSnippetsFlag: string,
      threadsFlag: string,
      verbosityFlag: string,
      automationDetailsId: string | undefined
    ): Promise<string> {
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
        "--sarif-group-rules-by-pack",
        ...getExtraOptionsFromEnv(["database", "interpret-results"]),
      ];
      if (await util.codeQlVersionAbove(this, CODEQL_VERSION_CUSTOM_QUERY_HELP))
        codeqlArgs.push("--sarif-add-query-help");
      if (automationDetailsId !== undefined) {
        codeqlArgs.push("--sarif-category", automationDetailsId);
      }
      if (
        await util.codeQlVersionAbove(
          this,
          CODEQL_VERSION_FILE_BASELINE_INFORMATION
        )
      ) {
        codeqlArgs.push("--sarif-add-baseline-file-info");
      }
      codeqlArgs.push(databasePath);
      if (querySuitePaths) {
        codeqlArgs.push(...querySuitePaths);
      }
      // capture stdout, which contains analysis summaries
      const returnState = await toolrunnerErrorCatcher(
        cmd,
        codeqlArgs,
        errorMatchers
      );
      return returnState.stdout;
    },
    async databasePrintBaseline(databasePath: string): Promise<string> {
      const codeqlArgs = [
        "database",
        "print-baseline",
        ...getExtraOptionsFromEnv(["database", "print-baseline"]),
        databasePath,
      ];
      return await runTool(cmd, codeqlArgs);
    },

    /**
     * Download specified packs into the package cache. If the specified
     * package and version already exists (e.g., from a previous analysis run),
     * then it is not downloaded again (unless the extra option `--force` is
     * specified).
     *
     * If no version is specified, then the latest version is
     * downloaded. The check to determine what the latest version is is done
     * each time this package is requested.
     *
     * Optionally, a `qlconfigFile` is included. If used, then this file
     * is used to determine which registry each pack is downloaded from.
     */
    async packDownload(
      packs: string[],
      qlconfigFile: string | undefined
    ): Promise<PackDownloadOutput> {
      const qlconfigArg = qlconfigFile
        ? [`--qlconfig-file=${qlconfigFile}`]
        : ([] as string[]);

      const codeqlArgs = [
        "pack",
        "download",
        ...qlconfigArg,
        "--format=json",
        "--resolve-query-specs",
        ...getExtraOptionsFromEnv(["pack", "download"]),
        ...packs,
      ];

      const output = await runTool(cmd, codeqlArgs);

      try {
        const parsedOutput: PackDownloadOutput = JSON.parse(output);
        if (
          Array.isArray(parsedOutput.packs) &&
          // TODO PackDownloadOutput will not include the version if it is not specified
          // in the input. The version is always the latest version available.
          // It should be added to the output, but this requires a CLI change
          parsedOutput.packs.every((p) => p.name /* && p.version */)
        ) {
          return parsedOutput;
        } else {
          throw new Error("Unexpected output from pack download");
        }
      } catch (e) {
        throw new Error(
          `Attempted to download specified packs but got an error:\n${output}\n${e}`
        );
      }
    },
    async databaseCleanup(
      databasePath: string,
      cleanupLevel: string
    ): Promise<void> {
      const codeqlArgs = [
        "database",
        "cleanup",
        databasePath,
        `--mode=${cleanupLevel}`,
        ...getExtraOptionsFromEnv(["database", "cleanup"]),
      ];
      await runTool(cmd, codeqlArgs);
    },
    async databaseBundle(
      databasePath: string,
      outputFilePath: string,
      databaseName: string
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
    async diagnosticsExport(
      sarifFile: string,
      automationDetailsId: string | undefined
    ): Promise<void> {
      const args = [
        "diagnostics",
        "export",
        "--format=sarif-latest",
        `--output=${sarifFile}`,
        ...getExtraOptionsFromEnv(["diagnostics", "export"]),
      ];
      if (automationDetailsId !== undefined) {
        args.push("--sarif-category", automationDetailsId);
      }
      await new toolrunner.ToolRunner(cmd, args).exec();
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
    !(await util.codeQlVersionAbove(codeql, CODEQL_MINIMUM_VERSION))
  ) {
    throw new Error(
      `Expected a CodeQL CLI with version at least ${CODEQL_MINIMUM_VERSION} but got version ${await codeql.getVersion()}`
    );
  }
  return codeql;
}

/**
 * Gets the options for `path` of `options` as an array of extra option strings.
 */
function getExtraOptionsFromEnv(paths: string[]) {
  const options: ExtraOptions = util.getExtraOptionsEnvParam();
  return getExtraOptions(options, paths, []);
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
      "."
    )}' ('${JSON.stringify(options)}') are not in an array.`;
    throw new Error(msg);
  }
  return options.map((o) => {
    const t = typeof o;
    if (t !== "string" && t !== "number" && t !== "boolean") {
      const msg = `The extra option for '${pathInfo.join(
        "."
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
  pathInfo: string[]
): string[] {
  const all = asExtraOptions(options?.["*"], pathInfo.concat("*"));
  const specific =
    paths.length === 0
      ? asExtraOptions(options, pathInfo)
      : getExtraOptions(
          options?.[paths[0]],
          paths?.slice(1),
          pathInfo.concat(paths[0])
        );
  return all.concat(specific);
}

/*
 * A constant defining the maximum number of characters we will keep from
 * the programs stderr for logging. This serves two purposes:
 * (1) It avoids an OOM if a program fails in a way that results it
 *     printing many log lines.
 * (2) It avoids us hitting the limit of how much data we can send in our
 *     status reports on GitHub.com.
 */
const maxErrorSize = 20_000;

async function runTool(
  cmd: string,
  args: string[] = [],
  opts: { stdin?: string } = {}
) {
  let output = "";
  let error = "";
  const exitCode = await new toolrunner.ToolRunner(cmd, args, {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString("utf8");
      },
      stderr: (data: Buffer) => {
        let readStartIndex = 0;
        // If the error is too large, then we only take the last 20,000 characters
        if (data.length - maxErrorSize > 0) {
          // Eg: if we have 20,000 the start index should be 2.
          readStartIndex = data.length - maxErrorSize + 1;
        }
        error += data.toString("utf8", readStartIndex);
      },
    },
    ignoreReturnCode: true,
    ...(opts.stdin ? { input: Buffer.from(opts.stdin || "") } : {}),
  }).exec();
  if (exitCode !== 0)
    throw new CommandInvocationError(cmd, args, exitCode, error, output);
  return output;
}

/**
 * If appropriate, generates a code scanning configuration that is to be used for a scan.
 * If the configuration is not to be generated, returns undefined.
 *
 * @param codeql The CodeQL object to use.
 * @param config The configuration to use.
 * @returns the path to the generated user configuration file.
 */
async function generateCodeScanningConfig(
  codeql: CodeQL,
  config: Config,
  featureEnablement: FeatureEnablement,
  logger: Logger
): Promise<string | undefined> {
  if (!(await util.useCodeScanningConfigInCli(codeql, featureEnablement))) {
    return;
  }
  const configLocation = path.resolve(config.tempDir, "user-config.yaml");
  // make a copy so we can modify it
  const augmentedConfig = cloneObject(config.originalUserInput);

  // Inject the queries from the input
  if (config.augmentationProperties.queriesInput) {
    if (config.augmentationProperties.queriesInputCombines) {
      augmentedConfig.queries = (augmentedConfig.queries || []).concat(
        config.augmentationProperties.queriesInput
      );
    } else {
      augmentedConfig.queries = config.augmentationProperties.queriesInput;
    }
  }
  if (augmentedConfig.queries?.length === 0) {
    delete augmentedConfig.queries;
  }

  // Inject the packs from the input
  if (config.augmentationProperties.packsInput) {
    if (config.augmentationProperties.packsInputCombines) {
      // At this point, we already know that this is a single-language analysis
      if (Array.isArray(augmentedConfig.packs)) {
        augmentedConfig.packs = (augmentedConfig.packs || []).concat(
          config.augmentationProperties.packsInput
        );
      } else if (!augmentedConfig.packs) {
        augmentedConfig.packs = config.augmentationProperties.packsInput;
      } else {
        // At this point, we know there is only one language.
        // If there were more than one language, an error would already have been thrown.
        const language = Object.keys(augmentedConfig.packs)[0];
        augmentedConfig.packs[language] = augmentedConfig.packs[
          language
        ].concat(config.augmentationProperties.packsInput);
      }
    } else {
      augmentedConfig.packs = config.augmentationProperties.packsInput;
    }
  }
  if (Array.isArray(augmentedConfig.packs) && !augmentedConfig.packs.length) {
    delete augmentedConfig.packs;
  }
  if (config.augmentationProperties.injectedMlQueries) {
    // We need to inject the ML queries into the original user input before
    // we pass this on to the CLI, to make sure these get run.
    const packString = await util.getMlPoweredJsQueriesPack(codeql);

    if (augmentedConfig.packs === undefined) augmentedConfig.packs = [];
    if (Array.isArray(augmentedConfig.packs)) {
      augmentedConfig.packs.push(packString);
    } else {
      if (!augmentedConfig.packs.javascript)
        augmentedConfig.packs["javascript"] = [];
      augmentedConfig.packs["javascript"].push(packString);
    }
  }
  logger.info(`Writing augmented user configuration file to ${configLocation}`);
  logger.startGroup("Augmented user configuration file contents");
  logger.info(yaml.dump(augmentedConfig));
  logger.endGroup();

  fs.writeFileSync(configLocation, yaml.dump(augmentedConfig));
  return configLocation;
}

function cloneObject(obj: any) {
  return JSON.parse(JSON.stringify(obj));
}
