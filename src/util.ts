import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

import * as core from "@actions/core";
import del from "del";
import getFolderSize from "get-folder-size";
import * as semver from "semver";

import { getApiClient, GitHubApiDetails } from "./api-client";
import * as apiCompatibility from "./api-compatibility.json";
import { CodeQL, CODEQL_VERSION_NEW_TRACING } from "./codeql";
import {
  Config,
  getLanguagesInRepo,
  getRawLanguages,
  parsePacksSpecification,
  prettyPrintPack,
} from "./config-utils";
import { Feature, FeatureEnablement } from "./feature-flags";
import { KOTLIN_SWIFT_BYPASS, Language } from "./languages";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import { CODEQL_ACTION_TEST_MODE } from "./shared-environment";

/**
 * Specifies bundle versions that are known to be broken
 * and will not be used if found in the toolcache.
 */
const BROKEN_VERSIONS = ["0.0.0-20211207"];

/**
 * The URL for github.com.
 */
export const GITHUB_DOTCOM_URL = "https://github.com";

/**
 * Default name of the debugging artifact.
 */
export const DEFAULT_DEBUG_ARTIFACT_NAME = "debug-artifacts";

/**
 * Default name of the database in the debugging artifact.
 */
export const DEFAULT_DEBUG_DATABASE_NAME = "db";

/**
 * Environment variable that is set to "true" when the CodeQL Action has invoked
 * the Go autobuilder.
 */
export const DID_AUTOBUILD_GO_ENV_VAR_NAME =
  "CODEQL_ACTION_DID_AUTOBUILD_GOLANG";

export interface SarifFile {
  version?: string | null;
  runs: SarifRun[];
}

export interface SarifRun {
  tool?: {
    driver?: {
      name?: string;
      semanticVersion?: string;
    };
  };
  automationDetails?: {
    id?: string;
  };
  artifacts?: string[];
  results?: SarifResult[];
}

export interface SarifResult {
  ruleId?: string;
  message?: {
    text?: string;
  };
  locations: Array<{
    physicalLocation: {
      artifactLocation: {
        uri: string;
      };
      region?: {
        startLine?: number;
      };
    };
  }>;
  partialFingerprints: {
    primaryLocationLineHash?: string;
  };
}

/**
 * Get the extra options for the codeql commands.
 */
export function getExtraOptionsEnvParam(): object {
  const varName = "CODEQL_ACTION_EXTRA_OPTIONS";
  const raw = process.env[varName];
  if (raw === undefined || raw.length === 0) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${varName} environment variable is set, but does not contain valid JSON: ${message}`
    );
  }
}

/**
 * Get the array of all the tool names contained in the given sarif contents.
 *
 * Returns an array of unique string tool names.
 */
export function getToolNames(sarif: SarifFile): string[] {
  const toolNames = {};

  for (const run of sarif.runs || []) {
    const tool = run.tool || {};
    const driver = tool.driver || {};
    if (typeof driver.name === "string" && driver.name.length > 0) {
      toolNames[driver.name] = true;
    }
  }

  return Object.keys(toolNames);
}

// Creates a random temporary directory, runs the given body, and then deletes the directory.
// Mostly intended for use within tests.
export async function withTmpDir<T>(
  body: (tmpDir: string) => Promise<T>
): Promise<T> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeql-action-"));
  const result = await body(tmpDir);
  await del(tmpDir, { force: true });
  return result;
}

/**
 * Gets an OS-specific amount of memory (in MB) to reserve for OS processes
 * when the user doesn't explicitly specify a memory setting.
 * This is a heuristic to avoid OOM errors (exit code 137 / SIGKILL)
 * from committing too much of the available memory to CodeQL.
 * @returns number
 */
function getSystemReservedMemoryMegaBytes(): number {
  // Windows needs more memory for OS processes.
  return 1024 * (process.platform === "win32" ? 1.5 : 1);
}

/**
 * Get the value of the codeql `--ram` flag as configured by the `ram` input.
 * If no value was specified, the total available memory will be used minus a
 * threshold reserved for the OS.
 *
 * @returns {number} the amount of RAM to use, in megabytes
 */
export function getMemoryFlagValue(userInput: string | undefined): number {
  let memoryToUseMegaBytes: number;
  if (userInput) {
    memoryToUseMegaBytes = Number(userInput);
    if (Number.isNaN(memoryToUseMegaBytes) || memoryToUseMegaBytes <= 0) {
      throw new Error(`Invalid RAM setting "${userInput}", specified.`);
    }
  } else {
    const totalMemoryBytes = os.totalmem();
    const totalMemoryMegaBytes = totalMemoryBytes / (1024 * 1024);
    const reservedMemoryMegaBytes = getSystemReservedMemoryMegaBytes();
    memoryToUseMegaBytes = totalMemoryMegaBytes - reservedMemoryMegaBytes;
  }
  return Math.floor(memoryToUseMegaBytes);
}

/**
 * Get the codeql `--ram` flag as configured by the `ram` input. If no value was
 * specified, the total available memory will be used minus a threshold
 * reserved for the OS.
 *
 * @returns string
 */
export function getMemoryFlag(userInput: string | undefined): string {
  return `--ram=${getMemoryFlagValue(userInput)}`;
}

/**
 * Get the codeql flag to specify whether to add code snippets to the sarif file.
 *
 * @returns string
 */
export function getAddSnippetsFlag(
  userInput: string | boolean | undefined
): string {
  if (typeof userInput === "string") {
    // have to process specifically because any non-empty string is truthy
    userInput = userInput.toLowerCase() === "true";
  }
  return userInput ? "--sarif-add-snippets" : "--no-sarif-add-snippets";
}

/**
 * Get the value of the codeql `--threads` flag specified for the `threads`
 * input. If no value was specified, all available threads will be used.
 *
 * The value will be capped to the number of available CPUs.
 *
 * @returns {number}
 */
export function getThreadsFlagValue(
  userInput: string | undefined,
  logger: Logger
): number {
  let numThreads: number;
  const maxThreads = os.cpus().length;
  if (userInput) {
    numThreads = Number(userInput);
    if (Number.isNaN(numThreads)) {
      throw new Error(`Invalid threads setting "${userInput}", specified.`);
    }
    if (numThreads > maxThreads) {
      logger.info(
        `Clamping desired number of threads (${numThreads}) to max available (${maxThreads}).`
      );
      numThreads = maxThreads;
    }
    const minThreads = -maxThreads;
    if (numThreads < minThreads) {
      logger.info(
        `Clamping desired number of free threads (${numThreads}) to max available (${minThreads}).`
      );
      numThreads = minThreads;
    }
  } else {
    // Default to using all threads
    numThreads = maxThreads;
  }
  return numThreads;
}

/**
 * Get the codeql `--threads` flag specified for the `threads` input.
 * If no value was specified, all available threads will be used.
 *
 * The value will be capped to the number of available CPUs.
 *
 * @returns string
 */
export function getThreadsFlag(
  userInput: string | undefined,
  logger: Logger
): string {
  return `--threads=${getThreadsFlagValue(userInput, logger)}`;
}

/**
 * Get the path where the CodeQL database for the given language lives.
 */
export function getCodeQLDatabasePath(config: Config, language: Language) {
  return path.resolve(config.dbLocation, language);
}

/**
 * Parses user input of a github.com or GHES URL to a canonical form.
 * Removes any API prefix or suffix if one is present.
 */
export function parseGitHubUrl(inputUrl: string): string {
  const originalUrl = inputUrl;
  if (inputUrl.indexOf("://") === -1) {
    inputUrl = `https://${inputUrl}`;
  }
  if (!inputUrl.startsWith("http://") && !inputUrl.startsWith("https://")) {
    throw new Error(`"${originalUrl}" is not a http or https URL`);
  }

  let url: URL;
  try {
    url = new URL(inputUrl);
  } catch (e) {
    throw new Error(`"${originalUrl}" is not a valid URL`);
  }

  // If we detect this is trying to be to github.com
  // then return with a fixed canonical URL.
  if (url.hostname === "github.com" || url.hostname === "api.github.com") {
    return GITHUB_DOTCOM_URL;
  }

  // Remove the API prefix if it's present
  if (url.pathname.indexOf("/api/v3") !== -1) {
    url.pathname = url.pathname.substring(0, url.pathname.indexOf("/api/v3"));
  }
  // Also consider subdomain isolation on GHES
  if (url.hostname.startsWith("api.")) {
    url.hostname = url.hostname.substring(4);
  }

  // Normalise path to having a trailing slash for consistency
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  return url.toString();
}

const GITHUB_ENTERPRISE_VERSION_HEADER = "x-github-enterprise-version";
const CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR =
  "CODEQL_ACTION_WARNED_ABOUT_VERSION";

let hasBeenWarnedAboutVersion = false;

export enum GitHubVariant {
  DOTCOM,
  GHES,
  GHAE,
}
export type GitHubVersion =
  | { type: GitHubVariant.DOTCOM }
  | { type: GitHubVariant.GHAE }
  | { type: GitHubVariant.GHES; version: string };

export async function getGitHubVersion(
  apiDetails: GitHubApiDetails
): Promise<GitHubVersion> {
  // We can avoid making an API request in the standard dotcom case
  if (parseGitHubUrl(apiDetails.url) === GITHUB_DOTCOM_URL) {
    return { type: GitHubVariant.DOTCOM };
  }

  // Doesn't strictly have to be the meta endpoint as we're only
  // using the response headers which are available on every request.
  const apiClient = getApiClient();
  const response = await apiClient.meta.get();

  // This happens on dotcom, although we expect to have already returned in that
  // case. This can also serve as a fallback in cases we haven't foreseen.
  if (response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === undefined) {
    return { type: GitHubVariant.DOTCOM };
  }

  if (response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === "GitHub AE") {
    return { type: GitHubVariant.GHAE };
  }

  const version = response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] as string;
  return { type: GitHubVariant.GHES, version };
}

export function checkGitHubVersionInRange(
  version: GitHubVersion,
  logger: Logger
) {
  if (hasBeenWarnedAboutVersion || version.type !== GitHubVariant.GHES) {
    return;
  }

  const disallowedAPIVersionReason = apiVersionInRange(
    version.version,
    apiCompatibility.minimumVersion,
    apiCompatibility.maximumVersion
  );

  if (
    disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_OLD
  ) {
    logger.warning(
      `The CodeQL Action version you are using is too old to be compatible with GitHub Enterprise ${version.version}. If you experience issues, please upgrade to a more recent version of the CodeQL Action.`
    );
  }
  if (
    disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_NEW
  ) {
    logger.warning(
      `GitHub Enterprise ${version.version} is too old to be compatible with this version of the CodeQL Action. If you experience issues, please upgrade to a more recent version of GitHub Enterprise or use an older version of the CodeQL Action.`
    );
  }
  hasBeenWarnedAboutVersion = true;
  core.exportVariable(CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR, true);
}

export enum DisallowedAPIVersionReason {
  ACTION_TOO_OLD,
  ACTION_TOO_NEW,
}

export function apiVersionInRange(
  version: string,
  minimumVersion: string,
  maximumVersion: string
): DisallowedAPIVersionReason | undefined {
  if (!semver.satisfies(version, `>=${minimumVersion}`)) {
    return DisallowedAPIVersionReason.ACTION_TOO_NEW;
  }
  if (!semver.satisfies(version, `<=${maximumVersion}`)) {
    return DisallowedAPIVersionReason.ACTION_TOO_OLD;
  }
  return undefined;
}

/**
 * This error is used to indicate a runtime failure of an exhaustivity check enforced at compile time.
 */
class ExhaustivityCheckingError extends Error {
  constructor(public expectedExhaustiveValue: never) {
    super("Internal error: exhaustivity checking failure");
  }
}

/**
 * Used to perform compile-time exhaustivity checking on a value.  This function will not be executed at runtime unless
 * the type system has been subverted.
 */
export function assertNever(value: never): never {
  throw new ExhaustivityCheckingError(value);
}

/**
 * Environment variables to be set by codeql-action and used by the
 * CLI.
 */
export enum EnvVar {
  /**
   * Semver of the codeql-action as specified in package.json.
   */
  VERSION = "CODEQL_ACTION_VERSION",

  /**
   * If set to a truthy value, then the codeql-action might combine SARIF
   * output from several `interpret-results` runs for the same Language.
   */
  FEATURE_SARIF_COMBINE = "CODEQL_ACTION_FEATURE_SARIF_COMBINE",

  /**
   * If set to the "true" string, then the codeql-action will upload SARIF,
   * not the cli.
   */
  FEATURE_WILL_UPLOAD = "CODEQL_ACTION_FEATURE_WILL_UPLOAD",

  /**
   * If set to the "true" string, then the codeql-action is using its
   * own deprecated and non-standard way of scanning for multiple
   * languages.
   */
  FEATURE_MULTI_LANGUAGE = "CODEQL_ACTION_FEATURE_MULTI_LANGUAGE",

  /**
   * If set to the "true" string, then the codeql-action is using its
   * own sandwiched workflow mechanism
   */
  FEATURE_SANDWICH = "CODEQL_ACTION_FEATURE_SANDWICH",
}

/**
 * Set some initial environment variables that we can set even without
 * knowing what version of CodeQL we're running.
 */
export function initializeEnvironment(version: string) {
  core.exportVariable(EnvVar.VERSION, version);
  core.exportVariable(EnvVar.FEATURE_SARIF_COMBINE, "true");
  core.exportVariable(EnvVar.FEATURE_WILL_UPLOAD, "true");
}

/**
 * Enrich the environment variables with further flags that we cannot
 * know the value of until we know what version of CodeQL we're running.
 */
export async function enrichEnvironment(codeql: CodeQL) {
  if (await codeQlVersionAbove(codeql, CODEQL_VERSION_NEW_TRACING)) {
    core.exportVariable(EnvVar.FEATURE_MULTI_LANGUAGE, "false");
    core.exportVariable(EnvVar.FEATURE_SANDWICH, "false");
  } else {
    core.exportVariable(EnvVar.FEATURE_MULTI_LANGUAGE, "true");
    core.exportVariable(EnvVar.FEATURE_SANDWICH, "true");
  }
}

/**
 * Get an environment parameter, but throw an error if it is not set.
 */
export function getRequiredEnvParam(paramName: string): string {
  const value = process.env[paramName];
  if (value === undefined || value.length === 0) {
    throw new Error(`${paramName} environment variable must be set`);
  }
  return value;
}

export class HTTPError extends Error {
  public status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * An Error class that indicates an error that occurred due to
 * a misconfiguration of the action or the CodeQL CLI.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function isHTTPError(arg: any): arg is HTTPError {
  return arg?.status !== undefined && Number.isInteger(arg.status);
}

let cachedCodeQlVersion: undefined | string = undefined;

export function cacheCodeQlVersion(version: string): void {
  if (cachedCodeQlVersion !== undefined) {
    throw new Error("cacheCodeQlVersion() should be called only once");
  }
  cachedCodeQlVersion = version;
}

export function getCachedCodeQlVersion(): undefined | string {
  return cachedCodeQlVersion;
}

export async function codeQlVersionAbove(
  codeql: CodeQL,
  requiredVersion: string
): Promise<boolean> {
  return semver.gte(await codeql.getVersion(), requiredVersion);
}

// Create a bundle for the given DB, if it doesn't already exist
export async function bundleDb(
  config: Config,
  language: Language,
  codeql: CodeQL,
  dbName: string
) {
  const databasePath = getCodeQLDatabasePath(config, language);
  const databaseBundlePath = path.resolve(config.dbLocation, `${dbName}.zip`);
  // For a tiny bit of added safety, delete the file if it exists.
  // The file is probably from an earlier call to this function, either
  // as part of this action step or a previous one, but it could also be
  // from somewhere else or someone trying to make the action upload a
  // non-database file.
  if (fs.existsSync(databaseBundlePath)) {
    await del(databaseBundlePath, { force: true });
  }
  await codeql.databaseBundle(databasePath, databaseBundlePath, dbName);
  return databaseBundlePath;
}

export async function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isGoodVersion(versionSpec: string) {
  return !BROKEN_VERSIONS.includes(versionSpec);
}

export const ML_POWERED_JS_QUERIES_PACK_NAME =
  "codeql/javascript-experimental-atm-queries";

/**
 * Gets the ML-powered JS query pack to add to the analysis if a repo is opted into the ML-powered
 * queries beta.
 */
export async function getMlPoweredJsQueriesPack(
  codeQL: CodeQL
): Promise<string> {
  let version;
  if (await codeQlVersionAbove(codeQL, "2.11.3")) {
    version = "~0.4.0";
  } else if (await codeQlVersionAbove(codeQL, "2.9.3")) {
    version = `~0.3.0`;
  } else if (await codeQlVersionAbove(codeQL, "2.8.4")) {
    version = `~0.2.0`;
  } else {
    version = `~0.1.0`;
  }
  return prettyPrintPack({
    name: ML_POWERED_JS_QUERIES_PACK_NAME,
    version,
  });
}

/**
 * Get information about ML-powered JS queries to populate status reports with.
 *
 * This will be:
 *
 * - The version string if the analysis is using a single version of the ML-powered query pack.
 * - "latest" if the version string of the ML-powered query pack is undefined. This is unlikely to
 *   occur in practice (see comment below).
 * - "false" if the analysis won't run any ML-powered JS queries.
 * - "other" in all other cases.
 *
 * Our goal of the status report here is to allow us to compare the occurrence of timeouts and other
 * errors with ML-powered queries turned on and off. We also want to be able to compare minor
 * version bumps caused by us bumping the version range of `ML_POWERED_JS_QUERIES_PACK` in a new
 * version of the CodeQL Action. For instance, we might want to compare the `~0.1.0` and `~0.0.2`
 * version strings.
 *
 * This function lives here rather than in `init-action.ts` so it's easier to test, since tests for
 * `init-action.ts` would each need to live in their own file. See `analyze-action-env.ts` for an
 * explanation as to why this is.
 */
export function getMlPoweredJsQueriesStatus(config: Config): string {
  const mlPoweredJsQueryPacks = (config.packs.javascript || [])
    .map((p) => parsePacksSpecification(p))
    .filter(
      (pack) =>
        pack.name === "codeql/javascript-experimental-atm-queries" && !pack.path
    );
  switch (mlPoweredJsQueryPacks.length) {
    case 1:
      // We should always specify an explicit version string in `getMlPoweredJsQueriesPack`,
      // otherwise we won't be able to make changes to the pack unless those changes are compatible
      // with each version of the CodeQL Action. Therefore in practice we should only hit the
      // `latest` case here when customers have explicitly added the ML-powered query pack to their
      // CodeQL config.
      return mlPoweredJsQueryPacks[0].version || "latest";
    case 0:
      return "false";
    default:
      return "other";
  }
}

/**
 * Prompt the customer to upgrade to CodeQL Action v2, if appropriate.
 *
 * Check whether a customer is running v1. If they are, and we can determine that the GitHub
 * instance supports v2, then log an error that v1 is deprecated and prompt the customer to
 * upgrade to v2.
 */
export async function checkActionVersion(version: string) {
  if (!semver.satisfies(version, ">=2")) {
    core.error(
      "This version of the CodeQL Action was deprecated on January 18th, 2023, and is no longer " +
        "updated or supported. For better performance, improved security, and new features, " +
        "upgrade to v2. For more information, see " +
        "https://github.blog/changelog/2023-01-18-code-scanning-codeql-action-v1-is-now-deprecated/"
    );
  }
}

/*
 * Returns whether we are in test mode.
 *
 * In test mode, we don't upload SARIF results or status reports to the GitHub API.
 */
export function isInTestMode(): boolean {
  return process.env[CODEQL_ACTION_TEST_MODE] === "true";
}

/**
 * @returns true if the action should generate a conde-scanning config file
 * that gets passed to the CLI.
 */
export async function useCodeScanningConfigInCli(
  codeql: CodeQL,
  featureEnablement: FeatureEnablement
): Promise<boolean> {
  return await featureEnablement.getValue(Feature.CliConfigFileEnabled, codeql);
}

export async function logCodeScanningConfigInCli(
  codeql: CodeQL,
  featureEnablement: FeatureEnablement,
  logger: Logger
) {
  if (await useCodeScanningConfigInCli(codeql, featureEnablement)) {
    logger.info(
      "Code Scanning configuration file being processed in the codeql CLI."
    );
  } else {
    logger.info(
      "Code Scanning configuration file being processed in the codeql-action."
    );
  }
}

/*
 * Returns whether the path in the argument represents an existing directory.
 */
export function doesDirectoryExist(dirPath: string): boolean {
  try {
    const stats = fs.lstatSync(dirPath);
    return stats.isDirectory();
  } catch (e) {
    return false;
  }
}

/**
 * Returns a recursive list of files in a given directory.
 */
export function listFolder(dir: string): string[] {
  if (!doesDirectoryExist(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    if (entry.isFile()) {
      files.push(path.resolve(dir, entry.name));
    } else if (entry.isDirectory()) {
      files = files.concat(listFolder(path.resolve(dir, entry.name)));
    }
  }
  return files;
}

/**
 * Get the size a folder in bytes. This will log any filesystem errors
 * as a warning and then return undefined.
 *
 * @param cacheDir A directory to get the size of.
 * @param logger A logger to log any errors to.
 * @returns The size in bytes of the folder, or undefined if errors occurred.
 */
export async function tryGetFolderBytes(
  cacheDir: string,
  logger: Logger
): Promise<number | undefined> {
  try {
    return await promisify<string, number>(getFolderSize)(cacheDir);
  } catch (e) {
    logger.warning(`Encountered an error while getting size of folder: ${e}`);
    return undefined;
  }
}

let hadTimeout = false;

/**
 * Run a promise for a given amount of time, and if it doesn't resolve within
 * that time, call the provided callback and then return undefined. Due to the
 * limitation outlined below, using this helper function is not recommended
 * unless there is no other option for adding a timeout (e.g. the code that
 * would need the timeout added is an external library).
 *
 * Important: This does NOT cancel the original promise, so that promise will
 * continue in the background even after the timeout has expired. If the
 * original promise hangs, then this will prevent the process terminating.
 * If a timeout has occurred then the global hadTimeout variable will get set
 * to true, and the caller is responsible for forcing the process to exit
 * if this is the case by calling the `checkForTimeout` function at the end
 * of execution.
 *
 * @param timeoutMs The timeout in milliseconds.
 * @param promise The promise to run.
 * @param onTimeout A callback to call if the promise times out.
 * @returns The result of the promise, or undefined if the promise times out.
 */
export async function withTimeout<T>(
  timeoutMs: number,
  promise: Promise<T>,
  onTimeout: () => void
): Promise<T | undefined> {
  let finished = false;
  const mainTask = async () => {
    const result = await promise;
    finished = true;
    return result;
  };
  const timeout: Promise<undefined> = new Promise((resolve) => {
    setTimeout(() => {
      if (!finished) {
        // Workaround: While the promise racing below will allow the main code
        // to continue, the process won't normally exit until the asynchronous
        // task in the background has finished. We set this variable to force
        // an exit at the end of our code when `checkForTimeout` is called.
        hadTimeout = true;
        onTimeout();
      }
      resolve(undefined);
    }, timeoutMs);
  });

  return await Promise.race([mainTask(), timeout]);
}

/**
 * Check if the global hadTimeout variable has been set, and if so then
 * exit the process to ensure any background tasks that are still running
 * are killed. This should be called at the end of execution if the
 * `withTimeout` function has been used.
 */
export async function checkForTimeout() {
  if (hadTimeout === true) {
    core.info(
      "A timeout occurred, force exiting the process after 30 seconds to prevent hanging."
    );
    await delay(30_000);
    process.exit();
  }
}

/**
 * This function implements a heuristic to determine whether the
 * runner we are on is hosted by GitHub. It does this by checking
 * the name of the runner against the list of known GitHub-hosted
 * runner names. It also checks for the presence of a toolcache
 * directory with the name hostedtoolcache which is present on
 * GitHub-hosted runners.
 *
 * @returns true iff the runner is hosted by GitHub
 */
export function isHostedRunner() {
  return (
    // Name of the runner on hosted Windows runners
    process.env["RUNNER_NAME"]?.includes("Hosted Agent") ||
    // Name of the runner on hosted POSIX runners
    process.env["RUNNER_NAME"]?.includes("GitHub Actions") ||
    // Segment of the path to the tool cache on all hosted runners
    process.env["RUNNER_TOOL_CACHE"]?.includes("hostedtoolcache")
  );
}

/**
 *
 * @param featuresEnablement The features enabled for the current run
 * @param languagesInput Languages input from the workflow
 * @param repository The owner/name of the repository
 * @param logger A logger
 * @returns A boolean indicating whether or not the toolcache should be bypassed and the latest codeql should be downloaded.
 */
export async function shouldBypassToolcache(
  featuresEnablement: FeatureEnablement,
  codeqlUrl: string | undefined,
  languagesInput: string | undefined,
  repository: RepositoryNwo,
  logger: Logger
): Promise<boolean> {
  // An explicit codeql url is specified, that means the toolcache will not be used.
  if (codeqlUrl) {
    return true;
  }

  // Check if the toolcache is disabled for all languages
  if (await featuresEnablement.getValue(Feature.BypassToolcacheEnabled)) {
    return true;
  }

  // Check if the toolcache is disabled for kotlin and swift.
  if (
    !(await featuresEnablement.getValue(
      Feature.BypassToolcacheKotlinSwiftEnabled
    ))
  ) {
    return false;
  }

  // Now check to see if kotlin or swift is one of the languages being analyzed.
  const { rawLanguages, autodetected } = await getRawLanguages(
    languagesInput,
    repository,
    logger
  );
  let bypass = rawLanguages.some((lang) => KOTLIN_SWIFT_BYPASS.includes(lang));
  if (bypass) {
    logger.info(
      `Bypassing toolcache for kotlin or swift. Languages: ${rawLanguages}`
    );
  } else if (!autodetected && rawLanguages.includes(Language.java)) {
    // special case: java was explicitly specified, but there might be
    // some kotlin in the repository, so we need to make a request for that.
    const langsInRepo = await getLanguagesInRepo(repository, logger);
    if (langsInRepo.includes("kotlin")) {
      logger.info(`Bypassing toolcache for kotlin.`);
      bypass = true;
    }
  }
  return bypass;
}

export function parseMatrixInput(
  matrixInput: string | undefined
): { [key: string]: string } | undefined {
  if (matrixInput === undefined || matrixInput === "null") {
    return undefined;
  }
  return JSON.parse(matrixInput);
}
