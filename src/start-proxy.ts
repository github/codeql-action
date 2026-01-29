import * as core from "@actions/core";
import * as toolcache from "@actions/tool-cache";

import { getApiClient } from "./api-client";
import * as artifactScanner from "./artifact-scanner";
import { Config } from "./config-utils";
import * as defaults from "./defaults.json";
import { KnownLanguage } from "./languages";
import { Logger } from "./logging";
import {
  ActionName,
  createStatusReportBase,
  getActionsStatus,
  sendStatusReport,
  StatusReportBase,
} from "./status-report";
import * as util from "./util";
import { ConfigurationError, getErrorMessage, isDefined } from "./util";

/**
 * Enumerates specific error types, along with suitable error messages, for errors
 * that we want to track in status reports.
 */
export enum StartProxyErrorType {
  DownloadFailed = "Failed to download proxy archive.",
  ExtractionFailed = "Failed to extract proxy archive.",
}

/**
 * We want to avoid accidentally leaking secrets that may be contained in exception
 * messages in the `start-proxy` action. Consequently, we don't report the messages
 * of arbitrary exceptions. This type of error ensures that the message is one from
 * `StartProxyErrorType` and therefore safe to include in a status report.
 */
export class StartProxyError extends Error {
  constructor(errorType: StartProxyErrorType) {
    super(errorType);
  }
}

interface StartProxyStatus extends StatusReportBase {
  // A comma-separated list of registry types which are configured for CodeQL.
  // This only includes registry types we support, not all that are configured.
  registry_types: string;
}

/**
 * Sends a status report for the `start-proxy` action indicating a successful outcome.
 *
 * @param startedAt When the action was started.
 * @param config The configuration used.
 * @param registry_types The types of registries that are configured.
 * @param logger The logger to use.
 */
export async function sendSuccessStatusReport(
  startedAt: Date,
  config: Partial<Config>,
  registry_types: string[],
  logger: Logger,
) {
  const statusReportBase = await createStatusReportBase(
    ActionName.StartProxy,
    "success",
    startedAt,
    config,
    await util.checkDiskUsage(logger),
    logger,
  );
  if (statusReportBase !== undefined) {
    const statusReport: StartProxyStatus = {
      ...statusReportBase,
      registry_types: registry_types.join(","),
    };
    await sendStatusReport(statusReport);
  }
}

/**
 * Returns an error message for `error` that can safely be reported in a status report,
 * i.e. that does not contain sensitive information.
 *
 * @param error The error for which to get an error message.
 */
export function getSafeErrorMessage(error: Error): string {
  // If the error is a `StartProxyError`, the constructor ensures that the
  // message comes from `StartProxyErrorType`.
  if (error instanceof StartProxyError) {
    return error.message;
  }

  // Otherwise, omit the actual error message.
  return `Error from start-proxy Action omitted (${typeof error}).`;
}

/**
 * Sends a status report for the `start-proxy` action indicating a failure.
 *
 * @param logger The logger to use.
 * @param startedAt When the action was started.
 * @param language The language provided as input, if any.
 * @param unwrappedError The exception that was thrown.
 */
export async function sendFailedStatusReport(
  logger: Logger,
  startedAt: Date,
  language: KnownLanguage | undefined,
  unwrappedError: unknown,
) {
  const error = util.wrapError(unwrappedError);
  core.setFailed(`start-proxy action failed: ${error.message}`);

  const statusReportMessage = getSafeErrorMessage(error);

  // We skip sending the error message and stack trace here to avoid the possibility
  // of leaking any sensitive information into the telemetry.
  const errorStatusReportBase = await createStatusReportBase(
    ActionName.StartProxy,
    getActionsStatus(error),
    startedAt,
    {
      languages: language && [language],
    },
    await util.checkDiskUsage(logger),
    logger,
    statusReportMessage,
  );
  if (errorStatusReportBase !== undefined) {
    await sendStatusReport(errorStatusReportBase);
  }
}

export const UPDATEJOB_PROXY = "update-job-proxy";
export const UPDATEJOB_PROXY_VERSION = "v2.0.20250624110901";
const UPDATEJOB_PROXY_URL_PREFIX =
  "https://github.com/github/codeql-action/releases/download/codeql-bundle-v2.22.0/";

export type Credential = {
  type: string;
  host?: string;
  url?: string;
  username?: string;
  password?: string;
  token?: string;
};

/*
 * Language aliases supported by the start-proxy Action.
 *
 * In general, the CodeQL CLI is the source of truth for language aliases, and to
 * allow us to more easily support new languages, we want to avoid hardcoding these
 * aliases in the Action itself.  However this is difficult to do in the start-proxy
 * Action since this Action does not use CodeQL, so we're accepting some hardcoding
 * for this Action.
 */
const LANGUAGE_ALIASES: { [lang: string]: KnownLanguage } = {
  c: KnownLanguage.cpp,
  "c++": KnownLanguage.cpp,
  "c#": KnownLanguage.csharp,
  kotlin: KnownLanguage.java,
  typescript: KnownLanguage.javascript,
  "javascript-typescript": KnownLanguage.javascript,
  "java-kotlin": KnownLanguage.java,
};

/**
 * Parse the start-proxy language input into its canonical CodeQL language name.
 *
 * Exported for testing. Do not use this outside of the start-proxy Action
 * to avoid complicating the process of adding new CodeQL languages.
 */
export function parseLanguage(language: string): KnownLanguage | undefined {
  // Normalize to lower case
  language = language.trim().toLowerCase();

  // See if it's an exact match
  if (language in KnownLanguage) {
    return language as KnownLanguage;
  }

  // Check language aliases
  if (language in LANGUAGE_ALIASES) {
    return LANGUAGE_ALIASES[language];
  }

  return undefined;
}

function isPAT(value: string) {
  return artifactScanner.isAuthToken(value, [
    artifactScanner.GITHUB_PAT_CLASSIC_PATTERN,
    artifactScanner.GITHUB_PAT_FINE_GRAINED_PATTERN,
  ]);
}

const LANGUAGE_TO_REGISTRY_TYPE: Partial<Record<KnownLanguage, string[]>> = {
  java: ["maven_repository"],
  csharp: ["nuget_feed"],
  javascript: ["npm_registry"],
  python: ["python_index"],
  ruby: ["rubygems_server"],
  rust: ["cargo_registry"],
  go: ["goproxy_server", "git_source"],
} as const;

// getCredentials returns registry credentials from action inputs.
// It prefers `registries_credentials` over `registry_secrets`.
// If neither is set, it returns an empty array.
export function getCredentials(
  logger: Logger,
  registrySecrets: string | undefined,
  registriesCredentials: string | undefined,
  language: KnownLanguage | undefined,
): Credential[] {
  const registryTypeForLanguage = language
    ? LANGUAGE_TO_REGISTRY_TYPE[language]
    : undefined;

  let credentialsStr: string;
  if (registriesCredentials !== undefined) {
    logger.info(`Using registries_credentials input.`);
    credentialsStr = Buffer.from(registriesCredentials, "base64").toString();
  } else if (registrySecrets !== undefined) {
    logger.info(`Using registry_secrets input.`);
    credentialsStr = registrySecrets;
  } else {
    logger.info(`No credentials defined.`);
    return [];
  }

  // Parse and validate the credentials
  let parsed: Credential[];
  try {
    parsed = JSON.parse(credentialsStr) as Credential[];
  } catch {
    // Don't log the error since it might contain sensitive information.
    logger.error("Failed to parse the credentials data.");
    throw new ConfigurationError("Invalid credentials format.");
  }

  // Check that the parsed data is indeed an array.
  if (!Array.isArray(parsed)) {
    throw new ConfigurationError(
      "Expected credentials data to be an array of configurations, but it is not.",
    );
  }

  const out: Credential[] = [];
  for (const e of parsed) {
    if (e === null || typeof e !== "object") {
      throw new ConfigurationError("Invalid credentials - must be an object");
    }

    // Mask credentials to reduce chance of accidental leakage in logs.
    if (isDefined(e.password)) {
      core.setSecret(e.password);
    }
    if (isDefined(e.token)) {
      core.setSecret(e.token);
    }

    if (!isDefined(e.url) && !isDefined(e.host)) {
      // The proxy needs one of these to work. If both are defined, the url has the precedence.
      throw new ConfigurationError(
        "Invalid credentials - must specify host or url",
      );
    }

    // Filter credentials based on language if specified. `type` is the registry type.
    // E.g., "maven_feed" for Java/Kotlin, "nuget_repository" for C#.
    if (
      registryTypeForLanguage &&
      !registryTypeForLanguage.some((t) => t === e.type)
    ) {
      continue;
    }

    const isPrintable = (str: string | undefined): boolean => {
      return str ? /^[\x20-\x7E]*$/.test(str) : true;
    };

    if (
      !isPrintable(e.type) ||
      !isPrintable(e.host) ||
      !isPrintable(e.url) ||
      !isPrintable(e.username) ||
      !isPrintable(e.password) ||
      !isPrintable(e.token)
    ) {
      throw new ConfigurationError(
        "Invalid credentials - fields must contain only printable characters",
      );
    }

    // If the password or token looks like a GitHub PAT, warn if no username is configured.
    if (
      !isDefined(e.username) &&
      ((isDefined(e.password) && isPAT(e.password)) ||
        (isDefined(e.token) && isPAT(e.token)))
    ) {
      logger.warning(
        `A ${e.type} private registry is configured for ${e.host || e.url} using a GitHub Personal Access Token (PAT), but no username was provided. ` +
          `This may not work correctly. When configuring a private registry using a PAT, select "Username and password" and enter the username of the user ` +
          `who generated the PAT.`,
      );
    }

    out.push({
      type: e.type,
      host: e.host,
      url: e.url,
      username: e.username,
      password: e.password,
      token: e.token,
    });
  }
  return out;
}

/**
 * Gets the name of the proxy release asset for the current platform.
 */
export function getProxyPackage(): string {
  const platform =
    process.platform === "win32"
      ? "win64"
      : process.platform === "darwin"
        ? "osx64"
        : "linux64";
  return `${UPDATEJOB_PROXY}-${platform}.tar.gz`;
}

/**
 * Gets the fallback URL for downloading the proxy release asset.
 *
 * @param proxyPackage The asset name.
 * @returns The full URL to download the specified asset from the fallback release.
 */
export function getFallbackUrl(proxyPackage: string): string {
  return `${UPDATEJOB_PROXY_URL_PREFIX}${proxyPackage}`;
}

/**
 * Uses the GitHub API to obtain information about the CodeQL CLI bundle release
 * that is pointed at by `defaults.json`.
 *
 * @returns The response from the GitHub API.
 */
async function getLinkedRelease() {
  return getApiClient().rest.repos.getReleaseByTag({
    owner: "github",
    repo: "codeql-action",
    tag: defaults.bundleVersion,
  });
}

/**
 * Determines the URL of the proxy release asset that we should download if its not
 * already in the toolcache, and its version.
 *
 * @param logger The logger to use.
 * @returns Returns the download URL and version of the proxy package we plan to use.
 */
export async function getDownloadUrl(
  logger: Logger,
): Promise<{ url: string; version: string }> {
  const proxyPackage = getProxyPackage();

  try {
    // Try to retrieve information about the CLI bundle release pointed at by `defaults.json`.
    const cliRelease = await getLinkedRelease();

    // Search the release's assets to find the one we are looking for.
    for (const asset of cliRelease.data.assets) {
      if (asset.name === proxyPackage) {
        logger.info(
          `Found '${proxyPackage}' in release '${defaults.bundleVersion}' at '${asset.url}'`,
        );
        return {
          url: asset.url,
          // The `update-job-proxy` doesn't have a version as such. Since we now bundle it
          // with CodeQL CLI bundle releases, we use the corresponding CLI version to
          // differentiate between (potentially) different versions of `update-job-proxy`.
          version: defaults.cliVersion,
        };
      }
    }
  } catch (ex) {
    logger.warning(
      `Failed to retrieve information about the linked release: ${getErrorMessage(ex)}`,
    );
  }

  // Fallback to the hard-coded URL.
  logger.info(
    `Did not find '${proxyPackage}' in the linked release, falling back to hard-coded version.`,
  );
  return {
    url: getFallbackUrl(proxyPackage),
    version: UPDATEJOB_PROXY_VERSION,
  };
}

/**
 * Pretty-prints a `Credential` value to a string, but hides the actual password or token values.
 *
 * @param c The credential to convert to a string.
 */
export function credentialToStr(c: Credential): string {
  return `Type: ${c.type}; Host: ${c.host}; Url: ${c.url} Username: ${
    c.username
  }; Password: ${c.password !== undefined}; Token: ${c.token !== undefined}`;
}

/**
 * Attempts to download a file from `url` into the toolcache.
 *
 * @param logger The logger to use.
 * @param url The URL to download the proxy binary from.
 * @param authorization The authorization information to use.
 * @returns If successful, the path to the downloaded file.
 */
export async function downloadProxy(
  logger: Logger,
  url: string,
  authorization: string | undefined,
) {
  try {
    return toolcache.downloadTool(url, undefined, authorization, {
      accept: "application/octet-stream",
    });
  } catch (error) {
    logger.error(
      `Failed to download proxy archive from ${url}: ${getErrorMessage(error)}`,
    );
    throw new StartProxyError(StartProxyErrorType.DownloadFailed);
  }
}

/**
 * Attempts to extract the proxy binary from the `archive`.
 *
 * @param logger The logger to use.
 * @param archive The archive to extract.
 * @returns The path to the extracted file(s).
 */
export async function extractProxy(logger: Logger, archive: string) {
  try {
    return await toolcache.extractTar(archive);
  } catch (error) {
    logger.error(
      `Failed to extract proxy archive from ${archive}: ${getErrorMessage(error)}`,
    );
    throw new StartProxyError(StartProxyErrorType.ExtractionFailed);
  }
}
