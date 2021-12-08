import * as fs from "fs";
import * as path from "path";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import { IHeaders } from "@actions/http-client/interfaces";
import { default as deepEqual } from "fast-deep-equal";
import { default as queryString } from "query-string";
import * as semver from "semver";

import { isRunningLocalAction, getRelativeScriptPath } from "./actions-util";
import * as api from "./api-client";
import { PackWithVersion } from "./config-utils";
import * as defaults from "./defaults.json"; // Referenced from codeql-action-sync-tool!
import { errorMatchers } from "./error-matcher";
import { isTracedLanguage, Language } from "./languages";
import { Logger } from "./logging";
import * as toolcache from "./toolcache";
import { toolrunnerErrorCatcher } from "./toolrunner-error-catcher";
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
  constructor(cmd: string, args: string[], exitCode: number, error: string) {
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
    databasePath: string,
    languages: Language[],
    sourceRoot: string,
    processName: string | undefined,
    processLevel: number | undefined
  ): Promise<void>;
  /**
   * Runs the autobuilder for the given language.
   */
  runAutobuild(language: Language): Promise<void>;
  /**
   * Extract code for a scanned language using 'codeql database trace-command'
   * and running the language extractor.
   */
  extractScannedLanguage(database: string, language: Language): Promise<void>;
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
   * Run 'codeql resolve queries'.
   */
  resolveQueries(
    queries: string[],
    extraSearchPath: string | undefined
  ): Promise<ResolveQueriesOutput>;

  /**
   * Run 'codeql pack download'.
   */
  packDownload(packs: PackWithVersion[]): Promise<PackDownloadOutput>;

  /**
   * Run 'codeql database cleanup'.
   */
  databaseCleanup(databasePath: string, cleanupLevel: string): Promise<void>;
  /**
   * Run 'codeql database bundle'.
   */
  databaseBundle(databasePath: string, outputFilePath: string): Promise<void>;
  /**
   * Run 'codeql database run-queries'.
   */
  databaseRunQueries(
    databasePath: string,
    extraSearchPath: string | undefined,
    querySuitePath: string,
    memoryFlag: string,
    threadsFlag: string
  ): Promise<void>;
  /**
   * Run 'codeql database interpret-results'.
   */
  databaseInterpretResults(
    databasePath: string,
    querySuitePaths: string[],
    sarifFile: string,
    addSnippetsFlag: string,
    threadsFlag: string,
    automationDetailsId: string | undefined
  ): Promise<string>;
  /**
   * Run 'codeql database print-baseline'.
   */
  databasePrintBaseline(databasePath: string): Promise<string>;
}

export interface ResolveLanguagesOutput {
  [language: string]: [string];
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

const CODEQL_BUNDLE_VERSION = defaults.bundleVersion;
const CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";

/**
 * The oldest version of CodeQL that the Action will run with. This should be
 * at least three minor versions behind the current version. The version flags
 * below can be used to conditionally enable certain features on versions newer
 * than this. Please record the reason we cannot support an older version.
 *
 * Reason: Changes to how the tracing environment is set up.
 */
const CODEQL_MINIMUM_VERSION = "2.3.1";

/**
 * Versions of CodeQL that version-flag certain functionality in the Action.
 * For convenience, please keep these in descending order. Once a version
 * flag is older than the oldest supported version above, it may be removed.
 */
const CODEQL_VERSION_RAM_FINALIZE = "2.5.8";
const CODEQL_VERSION_DIAGNOSTICS = "2.5.6";
const CODEQL_VERSION_METRICS = "2.5.5";
const CODEQL_VERSION_GROUP_RULES = "2.5.5";
const CODEQL_VERSION_SARIF_GROUP = "2.5.3";
export const CODEQL_VERSION_COUNTS_LINES = "2.6.2";
const CODEQL_VERSION_CUSTOM_QUERY_HELP = "2.7.1";

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

function getCodeQLBundleName(): string {
  let platform: string;
  if (process.platform === "win32") {
    platform = "win64";
  } else if (process.platform === "linux") {
    platform = "linux64";
  } else if (process.platform === "darwin") {
    platform = "osx64";
  } else {
    return "codeql-bundle.tar.gz";
  }
  return `codeql-bundle-${platform}.tar.gz`;
}

export function getCodeQLActionRepository(logger: Logger): string {
  if (!util.isActions()) {
    return CODEQL_DEFAULT_ACTION_REPOSITORY;
  } else {
    return getActionsCodeQLActionRepository(logger);
  }
}

function getActionsCodeQLActionRepository(logger: Logger): string {
  if (process.env["GITHUB_ACTION_REPOSITORY"] !== undefined) {
    return process.env["GITHUB_ACTION_REPOSITORY"];
  }

  // The Actions Runner used with GitHub Enterprise Server 2.22 did not set the GITHUB_ACTION_REPOSITORY variable.
  // This fallback logic can be removed after the end-of-support for 2.22 on 2021-09-23.

  if (isRunningLocalAction()) {
    // This handles the case where the Action does not come from an Action repository,
    // e.g. our integration tests which use the Action code from the current checkout.
    logger.info(
      "The CodeQL Action is checked out locally. Using the default CodeQL Action repository."
    );
    return CODEQL_DEFAULT_ACTION_REPOSITORY;
  }
  logger.info(
    "GITHUB_ACTION_REPOSITORY environment variable was not set. Falling back to legacy method of finding the GitHub Action."
  );
  const relativeScriptPathParts = getRelativeScriptPath().split(path.sep);
  return `${relativeScriptPathParts[0]}/${relativeScriptPathParts[1]}`;
}

async function getCodeQLBundleDownloadURL(
  apiDetails: api.GitHubApiDetails,
  variant: util.GitHubVariant,
  logger: Logger
): Promise<string> {
  const codeQLActionRepository = getCodeQLActionRepository(logger);
  const potentialDownloadSources = [
    // This GitHub instance, and this Action.
    [apiDetails.url, codeQLActionRepository],
    // This GitHub instance, and the canonical Action.
    [apiDetails.url, CODEQL_DEFAULT_ACTION_REPOSITORY],
    // GitHub.com, and the canonical Action.
    [util.GITHUB_DOTCOM_URL, CODEQL_DEFAULT_ACTION_REPOSITORY],
  ];
  // We now filter out any duplicates.
  // Duplicates will happen either because the GitHub instance is GitHub.com, or because the Action is not a fork.
  const uniqueDownloadSources = potentialDownloadSources.filter(
    (source, index, self) => {
      return !self.slice(0, index).some((other) => deepEqual(source, other));
    }
  );
  const codeQLBundleName = getCodeQLBundleName();
  if (variant === util.GitHubVariant.GHAE) {
    try {
      const release = await api
        .getApiClient(apiDetails)
        .request("GET /enterprise/code-scanning/codeql-bundle/find/{tag}", {
          tag: CODEQL_BUNDLE_VERSION,
        });
      const assetID = release.data.assets[codeQLBundleName];
      if (assetID !== undefined) {
        const download = await api
          .getApiClient(apiDetails)
          .request(
            "GET /enterprise/code-scanning/codeql-bundle/download/{asset_id}",
            { asset_id: assetID }
          );
        const downloadURL = download.data.url;
        logger.info(
          `Found CodeQL bundle at GitHub AE endpoint with URL ${downloadURL}.`
        );
        return downloadURL;
      } else {
        logger.info(
          `Attempted to fetch bundle from GitHub AE endpoint but the bundle ${codeQLBundleName} was not found in the assets ${JSON.stringify(
            release.data.assets
          )}.`
        );
      }
    } catch (e) {
      logger.info(
        `Attempted to fetch bundle from GitHub AE endpoint but got error ${e}.`
      );
    }
  }
  for (const downloadSource of uniqueDownloadSources) {
    const [apiURL, repository] = downloadSource;
    // If we've reached the final case, short-circuit the API check since we know the bundle exists and is public.
    if (
      apiURL === util.GITHUB_DOTCOM_URL &&
      repository === CODEQL_DEFAULT_ACTION_REPOSITORY
    ) {
      break;
    }
    const [repositoryOwner, repositoryName] = repository.split("/");
    try {
      const release = await api.getApiClient(apiDetails).repos.getReleaseByTag({
        owner: repositoryOwner,
        repo: repositoryName,
        tag: CODEQL_BUNDLE_VERSION,
      });
      for (const asset of release.data.assets) {
        if (asset.name === codeQLBundleName) {
          logger.info(
            `Found CodeQL bundle in ${downloadSource[1]} on ${downloadSource[0]} with URL ${asset.url}.`
          );
          return asset.url;
        }
      }
    } catch (e) {
      logger.info(
        `Looked for CodeQL bundle in ${downloadSource[1]} on ${downloadSource[0]} but got error ${e}.`
      );
    }
  }
  return `https://github.com/${CODEQL_DEFAULT_ACTION_REPOSITORY}/releases/download/${CODEQL_BUNDLE_VERSION}/${codeQLBundleName}`;
}

export async function setupCodeQL(
  codeqlURL: string | undefined,
  apiDetails: api.GitHubApiDetails,
  tempDir: string,
  toolCacheDir: string,
  variant: util.GitHubVariant,
  logger: Logger,
  checkVersion: boolean
): Promise<{ codeql: CodeQL; toolsVersion: string }> {
  try {
    // We use the special value of 'latest' to prioritize the version in the
    // defaults over any pinned cached version.
    const forceLatest = codeqlURL === "latest";
    if (forceLatest) {
      codeqlURL = undefined;
    }
    let codeqlFolder: string;
    let codeqlURLVersion: string;
    if (codeqlURL && !codeqlURL.startsWith("http")) {
      codeqlFolder = await toolcache.extractTar(codeqlURL, tempDir, logger);
      codeqlURLVersion = "local";
    } else {
      codeqlURLVersion = getCodeQLURLVersion(
        codeqlURL || `/${CODEQL_BUNDLE_VERSION}/`
      );
      const codeqlURLSemVer = convertToSemVer(codeqlURLVersion, logger);

      // If we find the specified version, we always use that.
      codeqlFolder = toolcache.find(
        "CodeQL",
        codeqlURLSemVer,
        toolCacheDir,
        logger
      );

      // If we don't find the requested version, in some cases we may allow a
      // different version to save download time if the version hasn't been
      // specified explicitly (in which case we always honor it).
      if (!codeqlFolder && !codeqlURL && !forceLatest) {
        const codeqlVersions = toolcache.findAllVersions(
          "CodeQL",
          toolCacheDir,
          logger
        );
        if (codeqlVersions.length === 1) {
          const tmpCodeqlFolder = toolcache.find(
            "CodeQL",
            codeqlVersions[0],
            toolCacheDir,
            logger
          );
          if (fs.existsSync(path.join(tmpCodeqlFolder, "pinned-version"))) {
            logger.debug(
              `CodeQL in cache overriding the default ${CODEQL_BUNDLE_VERSION}`
            );
            codeqlFolder = tmpCodeqlFolder;
          }
        }
      }

      if (codeqlFolder) {
        logger.debug(`CodeQL found in cache ${codeqlFolder}`);
      } else {
        if (!codeqlURL) {
          codeqlURL = await getCodeQLBundleDownloadURL(
            apiDetails,
            variant,
            logger
          );
        }

        const parsedCodeQLURL = new URL(codeqlURL);
        const parsedQueryString = queryString.parse(parsedCodeQLURL.search);
        const headers: IHeaders = { accept: "application/octet-stream" };
        // We only want to provide an authorization header if we are downloading
        // from the same GitHub instance the Action is running on.
        // This avoids leaking Enterprise tokens to dotcom.
        // We also don't want to send an authorization header if there's already a token provided in the URL.
        if (
          codeqlURL.startsWith(`${apiDetails.url}/`) &&
          parsedQueryString["token"] === undefined
        ) {
          logger.debug("Downloading CodeQL bundle with token.");
          headers.authorization = `token ${apiDetails.auth}`;
        } else {
          logger.debug("Downloading CodeQL bundle without token.");
        }
        logger.info(
          `Downloading CodeQL tools from ${codeqlURL}. This may take a while.`
        );
        const codeqlPath = await toolcache.downloadTool(
          codeqlURL,
          tempDir,
          headers
        );
        logger.debug(`CodeQL bundle download to ${codeqlPath} complete.`);

        const codeqlExtracted = await toolcache.extractTar(
          codeqlPath,
          tempDir,
          logger
        );
        codeqlFolder = await toolcache.cacheDir(
          codeqlExtracted,
          "CodeQL",
          codeqlURLSemVer,
          toolCacheDir,
          logger
        );
      }
    }
    let codeqlCmd = path.join(codeqlFolder, "codeql", "codeql");
    if (process.platform === "win32") {
      codeqlCmd += ".exe";
    } else if (process.platform !== "linux" && process.platform !== "darwin") {
      throw new Error(`Unsupported platform: ${process.platform}`);
    }

    cachedCodeQL = await getCodeQLForCmd(codeqlCmd, checkVersion);
    return { codeql: cachedCodeQL, toolsVersion: codeqlURLVersion };
  } catch (e) {
    logger.error(e instanceof Error ? e : new Error(String(e)));
    throw new Error("Unable to download and extract CodeQL CLI");
  }
}

export function getCodeQLURLVersion(url: string): string {
  const match = url.match(/\/codeql-bundle-(.*)\//);
  if (match === null || match.length < 2) {
    throw new Error(
      `Malformed tools url: ${url}. Version could not be inferred`
    );
  }
  return match[1];
}

export function convertToSemVer(version: string, logger: Logger): string {
  if (!semver.valid(version)) {
    logger.debug(
      `Bundle version ${version} is not in SemVer format. Will treat it as pre-release 0.0.0-${version}.`
    );
    version = `0.0.0-${version}`;
  }

  const s = semver.clean(version);
  if (!s) {
    throw new Error(`Bundle version ${version} is not in SemVer format.`);
  }

  return s;
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
export async function getCodeQLForTesting(): Promise<CodeQL> {
  return getCodeQLForCmd("codeql-for-testing", false);
}

async function getCodeQLForCmd(
  cmd: string,
  checkVersion: boolean
): Promise<CodeQL> {
  let cachedVersion: undefined | Promise<string> = undefined;
  const codeql = {
    getPath() {
      return cmd;
    },
    async getVersion() {
      if (cachedVersion === undefined)
        cachedVersion = runTool(cmd, ["version", "--format=terse"]);
      return await cachedVersion;
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

      await runTool(cmd, [
        "database",
        "trace-command",
        databasePath,
        ...getExtraOptionsFromEnv(["database", "trace-command"]),
        process.execPath,
        tracerEnvJs,
        envFile,
      ]);
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
      databasePath: string,
      languages: Language[],
      sourceRoot: string,
      processName: string | undefined,
      processLevel: number | undefined
    ) {
      const extraArgs = languages.map((language) => `--language=${language}`);
      if (languages.filter(isTracedLanguage).length > 0) {
        extraArgs.push("--begin-tracing");
        if (processName !== undefined) {
          extraArgs.push(`--trace-process-name=${processName}`);
        } else {
          extraArgs.push(`--trace-process-level=${processLevel || 3}`);
        }
      }
      await runTool(cmd, [
        "database",
        "init",
        "--db-cluster",
        databasePath,
        `--source-root=${sourceRoot}`,
        ...extraArgs,
        ...getExtraOptionsFromEnv(["database", "init"]),
      ]);
    },
    async runAutobuild(language: Language) {
      const cmdName =
        process.platform === "win32" ? "autobuild.cmd" : "autobuild.sh";
      const autobuildCmd = path.join(
        path.dirname(cmd),
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

      const runnerExecutable = process.env["CODEQL_RUNNER"] || "";
      // On Mac, prefixing with the runner executable is required to handle System Integrity Protection.
      if (runnerExecutable) {
        // Earlier steps (init) are expected to have written the runner executable path
        // to the tracing environment, and the current step is expected to have
        // correctly loaded that environment.
        await runTool(runnerExecutable, [autobuildCmd]);
      } else {
        // Fallback in case CODEQL_RUNNER wasn't correctly set or loaded.
        await runTool(autobuildCmd);
      }
    },
    async extractScannedLanguage(databasePath: string, language: Language) {
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
        ...getExtraOptionsFromEnv(["database", "finalize"]),
        databasePath,
      ];
      if (await util.codeQlVersionAbove(this, CODEQL_VERSION_RAM_FINALIZE))
        args.push(memoryFlag);
      await toolrunnerErrorCatcher(cmd, args, errorMatchers);
    },
    async resolveLanguages() {
      const codeqlArgs = ["resolve", "languages", "--format=json"];
      const output = await runTool(cmd, codeqlArgs);

      try {
        return JSON.parse(output);
      } catch (e) {
        throw new Error(
          `Unexpected output from codeql resolve languages: ${e}`
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
      querySuitePath: string,
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
      codeqlArgs.push(querySuitePath);
      await runTool(cmd, codeqlArgs);
    },
    async databaseInterpretResults(
      databasePath: string,
      querySuitePaths: string[],
      sarifFile: string,
      addSnippetsFlag: string,
      threadsFlag: string,
      automationDetailsId: string | undefined
    ): Promise<string> {
      const codeqlArgs = [
        "database",
        "interpret-results",
        threadsFlag,
        "--format=sarif-latest",
        "-v",
        `--output=${sarifFile}`,
        addSnippetsFlag,
        ...getExtraOptionsFromEnv(["database", "interpret-results"]),
      ];
      if (await util.codeQlVersionAbove(this, CODEQL_VERSION_DIAGNOSTICS))
        codeqlArgs.push("--print-diagnostics-summary");
      if (await util.codeQlVersionAbove(this, CODEQL_VERSION_METRICS))
        codeqlArgs.push("--print-metrics-summary");
      if (await util.codeQlVersionAbove(this, CODEQL_VERSION_GROUP_RULES))
        codeqlArgs.push("--sarif-group-rules-by-pack");
      if (await util.codeQlVersionAbove(this, CODEQL_VERSION_CUSTOM_QUERY_HELP))
        codeqlArgs.push("--sarif-add-query-help");
      if (
        automationDetailsId !== undefined &&
        (await util.codeQlVersionAbove(this, CODEQL_VERSION_SARIF_GROUP))
      ) {
        codeqlArgs.push("--sarif-category", automationDetailsId);
      }
      codeqlArgs.push(databasePath, ...querySuitePaths);
      // capture stdout, which contains analysis summaries
      return await runTool(cmd, codeqlArgs);
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
     */
    async packDownload(packs: PackWithVersion[]): Promise<PackDownloadOutput> {
      const codeqlArgs = [
        "pack",
        "download",
        "--format=json",
        ...getExtraOptionsFromEnv(["pack", "download"]),
        ...packs.map(packWithVersionToString),
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
      ];
      await runTool(cmd, codeqlArgs);
    },
    async databaseBundle(
      databasePath: string,
      outputFilePath: string
    ): Promise<void> {
      const args = [
        "database",
        "bundle",
        databasePath,
        `--output=${outputFilePath}`,
      ];
      await new toolrunner.ToolRunner(cmd, args).exec();
    },
  };
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

function packWithVersionToString(pack: PackWithVersion): string {
  return pack.version ? `${pack.packName}@${pack.version}` : pack.packName;
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

async function runTool(cmd: string, args: string[] = []) {
  let output = "";
  let error = "";
  const exitCode = await new toolrunner.ToolRunner(cmd, args, {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
      stderr: (data: Buffer) => {
        const toRead = Math.min(maxErrorSize - error.length, data.length);
        error += data.toString("utf8", 0, toRead);
      },
    },
    ignoreReturnCode: true,
  }).exec();
  if (exitCode !== 0)
    throw new CommandInvocationError(cmd, args, exitCode, error);
  return output;
}
