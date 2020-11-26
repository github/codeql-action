import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as core from "@actions/core";
import * as semver from "semver";

import * as apiCompatibility from "./api-compatibility.json";
import { Language } from "./languages";
import { Logger } from "./logging";
import { getApiClient, GitHubApiDetails } from "./api-client";

/**
 * Are we running on actions, or not.
 */
export type Mode = "actions" | "runner";

/**
 * The URL for github.com.
 */
export const GITHUB_DOTCOM_URL = "https://github.com";

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
    throw new Error(
      `${varName} environment variable is set, but does not contain valid JSON: ${e.message}`
    );
  }
}

export function isLocalRun(): boolean {
  return (
    !!process.env.CODEQL_LOCAL_RUN &&
    process.env.CODEQL_LOCAL_RUN !== "false" &&
    process.env.CODEQL_LOCAL_RUN !== "0"
  );
}

/**
 * Get the array of all the tool names contained in the given sarif contents.
 *
 * Returns an array of unique string tool names.
 */
export function getToolNames(sarifContents: string): string[] {
  const sarif = JSON.parse(sarifContents);
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
  const realSubdir = path.join(tmpDir, "real");
  fs.mkdirSync(realSubdir);
  const symlinkSubdir = path.join(tmpDir, "symlink");
  fs.symlinkSync(realSubdir, symlinkSubdir, "dir");
  const result = await body(symlinkSubdir);
  fs.rmdirSync(tmpDir, { recursive: true });
  return result;
}

/**
 * Get the codeql `--ram` flag as configured by the `ram` input. If no value was
 * specified, the total available memory will be used minus 256 MB.
 *
 * @returns string
 */
export function getMemoryFlag(userInput: string | undefined): string {
  let memoryToUseMegaBytes: number;
  if (userInput) {
    memoryToUseMegaBytes = Number(userInput);
    if (Number.isNaN(memoryToUseMegaBytes) || memoryToUseMegaBytes <= 0) {
      throw new Error(`Invalid RAM setting "${userInput}", specified.`);
    }
  } else {
    const totalMemoryBytes = os.totalmem();
    const totalMemoryMegaBytes = totalMemoryBytes / (1024 * 1024);
    const systemReservedMemoryMegaBytes = 256;
    memoryToUseMegaBytes = totalMemoryMegaBytes - systemReservedMemoryMegaBytes;
  }
  return `--ram=${Math.floor(memoryToUseMegaBytes)}`;
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
 * Get the codeql `--threads` value specified for the `threads` input.
 * If not value was specified, all available threads will be used.
 *
 * The value will be capped to the number of available CPUs.
 *
 * @returns string
 */
export function getThreadsFlag(
  userInput: string | undefined,
  logger: Logger
): string {
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
  return `--threads=${numThreads}`;
}

/**
 * Get the directory where CodeQL databases should be placed.
 */
export function getCodeQLDatabasesDir(tempDir: string) {
  return path.resolve(tempDir, "codeql_databases");
}

/**
 * Get the path where the CodeQL database for the given language lives.
 */
export function getCodeQLDatabasePath(tempDir: string, language: Language) {
  return path.resolve(getCodeQLDatabasesDir(tempDir), language);
}

/**
 * Parses user input of a github.com or GHES URL to a canonical form.
 * Removes any API prefix or suffix if one is present.
 */
export function parseGithubUrl(inputUrl: string): string {
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

export type GHESVersion = { type: "dotcom" } | { type: "ghes"; version: string };

export async function getGHESVersion(apiDetails: GitHubApiDetails): Promise<GHESVersion> {
  // Doesn't strictly have to be the meta endpoint as we're only
  // using the response headers which are available on every request.
  const apiClient = getApiClient(apiDetails);
  const response = await apiClient.meta.get();
  
  // This happens on dotcom
  if (
    response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === undefined
  ) {
    return { type: "dotcom" };
  }

  const version = response.headers[
    GITHUB_ENTERPRISE_VERSION_HEADER
  ] as string;
  return { type: "ghes", version };
}

export function checkGHESVersionInRange(version: GHESVersion, mode: Mode, logger: Logger) {
  if (hasBeenWarnedAboutVersion || version.type !== "ghes") {
    return;
  }

  const disallowedAPIVersionReason = apiVersionInRange(
    version.version,
    apiCompatibility.minimumVersion,
    apiCompatibility.maximumVersion
  );

  const toolName = mode === "actions" ? "Action" : "Runner";

  if (
    disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_OLD
  ) {
    logger.warning(
      `The CodeQL ${toolName} version you are using is too old to be compatible with GitHub Enterprise ${version}. If you experience issues, please upgrade to a more recent version of the CodeQL ${toolName}.`
    );
  }
  if (
    disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_NEW
  ) {
    logger.warning(
      `GitHub Enterprise ${version} is too old to be compatible with this version of the CodeQL ${toolName}. If you experience issues, please upgrade to a more recent version of GitHub Enterprise or use an older version of the CodeQL ${toolName}.`
    );
  }
  hasBeenWarnedAboutVersion = true;
  if (mode === "actions") {
    core.exportVariable(CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR, true);
  }
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
