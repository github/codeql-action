import * as fs from "fs";
import { OutgoingHttpHeaders } from "http";
import * as path from "path";
import { performance } from "perf_hooks";

import * as toolcache from "@actions/tool-cache";
import { default as deepEqual } from "fast-deep-equal";
import * as semver from "semver";

import { CommandInvocationError, isRunningLocalAction } from "./actions-util";
import * as api from "./api-client";
import * as defaults from "./defaults.json";
import {
  CODEQL_VERSION_ZSTD_BUNDLE,
  CodeQLDefaultVersionInfo,
  Feature,
  FeatureEnablement,
} from "./feature-flags";
import { formatDuration, Logger } from "./logging";
import * as tar from "./tar";
import {
  downloadAndExtract,
  ToolsDownloadStatusReport,
} from "./tools-download";
import * as util from "./util";
import { cleanUpGlob, isGoodVersion } from "./util";

export enum ToolsSource {
  Unknown = "UNKNOWN",
  Local = "LOCAL",
  Toolcache = "TOOLCACHE",
  Download = "DOWNLOAD",
}

export const CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";

const CODEQL_BUNDLE_VERSION_ALIAS: string[] = ["linked", "latest"];

function getCodeQLBundleExtension(useZstd: boolean): string {
  return useZstd ? ".tar.zst" : ".tar.gz";
}

function getCodeQLBundleName(useZstd: boolean): string {
  const extension = getCodeQLBundleExtension(useZstd);

  let platform: string;
  if (process.platform === "win32") {
    platform = "win64";
  } else if (process.platform === "linux") {
    platform = "linux64";
  } else if (process.platform === "darwin") {
    platform = "osx64";
  } else {
    return `codeql-bundle${extension}`;
  }
  return `codeql-bundle-${platform}${extension}`;
}

export function getCodeQLActionRepository(logger: Logger): string {
  if (isRunningLocalAction()) {
    // This handles the case where the Action does not come from an Action repository,
    // e.g. our integration tests which use the Action code from the current checkout.
    // In these cases, the GITHUB_ACTION_REPOSITORY environment variable is not set.
    logger.info(
      "The CodeQL Action is checked out locally. Using the default CodeQL Action repository.",
    );
    return CODEQL_DEFAULT_ACTION_REPOSITORY;
  }

  return util.getRequiredEnvParam("GITHUB_ACTION_REPOSITORY");
}

async function getCodeQLBundleDownloadURL(
  tagName: string,
  apiDetails: api.GitHubApiDetails,
  useZstd: boolean,
  logger: Logger,
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
    },
  );
  const codeQLBundleName = getCodeQLBundleName(useZstd);
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
      const release = await api.getApiClient().rest.repos.getReleaseByTag({
        owner: repositoryOwner,
        repo: repositoryName,
        tag: tagName,
      });
      for (const asset of release.data.assets) {
        if (asset.name === codeQLBundleName) {
          logger.info(
            `Found CodeQL bundle in ${downloadSource[1]} on ${downloadSource[0]} with URL ${asset.url}.`,
          );
          return asset.url;
        }
      }
    } catch (e) {
      logger.info(
        `Looked for CodeQL bundle in ${downloadSource[1]} on ${downloadSource[0]} but got error ${e}.`,
      );
    }
  }
  return `https://github.com/${CODEQL_DEFAULT_ACTION_REPOSITORY}/releases/download/${tagName}/${codeQLBundleName}`;
}

function tryGetBundleVersionFromTagName(
  tagName: string,
  logger: Logger,
): string | undefined {
  const match = tagName.match(/^codeql-bundle-(.*)$/);
  if (match === null || match.length < 2) {
    logger.debug(`Could not determine bundle version from tag ${tagName}.`);
    return undefined;
  }
  return match[1];
}

function tryGetTagNameFromUrl(url: string, logger: Logger): string | undefined {
  const match = url.match(/\/(codeql-bundle-.*)\//);
  if (match === null || match.length < 2) {
    logger.debug(`Could not determine tag name for URL ${url}.`);
    return undefined;
  }
  return match[1];
}

export function tryGetBundleVersionFromUrl(
  url: string,
  logger: Logger,
): string | undefined {
  const tagName = tryGetTagNameFromUrl(url, logger);
  if (tagName === undefined) {
    return undefined;
  }
  return tryGetBundleVersionFromTagName(tagName, logger);
}

export function convertToSemVer(version: string, logger: Logger): string {
  if (!semver.valid(version)) {
    logger.debug(
      `Bundle version ${version} is not in SemVer format. Will treat it as pre-release 0.0.0-${version}.`,
    );
    version = `0.0.0-${version}`;
  }

  const s = semver.clean(version);
  if (!s) {
    throw new Error(`Bundle version ${version} is not in SemVer format.`);
  }

  return s;
}

type CodeQLToolsSource =
  | {
      codeqlTarPath: string;
      sourceType: "local";
      /** Human-readable description of the source of the tools for telemetry purposes. */
      toolsVersion: "local";
    }
  | {
      codeqlFolder: string;
      sourceType: "toolcache";
      /** Human-readable description of the source of the tools for telemetry purposes. */
      toolsVersion: string;
    }
  | {
      /** Bundle version of the tools, if known. */
      bundleVersion?: string;
      /** CLI version of the tools, if known. */
      cliVersion?: string;
      codeqlURL: string;
      sourceType: "download";
      /** Human-readable description of the source of the tools for telemetry purposes. */
      toolsVersion: string;
    };

/**
 * Look for a version of the CodeQL tools in the cache which could override the requested CLI version.
 */
async function findOverridingToolsInCache(
  humanReadableVersion: string,
  logger: Logger,
): Promise<CodeQLToolsSource | undefined> {
  const candidates = toolcache
    .findAllVersions("CodeQL")
    .filter(isGoodVersion)
    .map((version) => ({
      folder: toolcache.find("CodeQL", version),
      version,
    }))
    .filter(({ folder }) => fs.existsSync(path.join(folder, "pinned-version")));

  if (candidates.length === 1) {
    const candidate = candidates[0];
    logger.debug(
      `CodeQL tools version ${candidate.version} in toolcache overriding version ${humanReadableVersion}.`,
    );
    return {
      codeqlFolder: candidate.folder,
      sourceType: "toolcache",
      toolsVersion: candidate.version,
    };
  } else if (candidates.length === 0) {
    logger.debug(
      "Did not find any candidate pinned versions of the CodeQL tools in the toolcache.",
    );
  } else {
    logger.debug(
      "Could not use CodeQL tools from the toolcache since more than one candidate pinned " +
        "version was found in the toolcache.",
    );
  }
  return undefined;
}

export async function getCodeQLSource(
  toolsInput: string | undefined,
  defaultCliVersion: CodeQLDefaultVersionInfo,
  apiDetails: api.GitHubApiDetails,
  variant: util.GitHubVariant,
  tarSupportsZstd: boolean,
  features: FeatureEnablement,
  logger: Logger,
): Promise<CodeQLToolsSource> {
  if (
    toolsInput &&
    !CODEQL_BUNDLE_VERSION_ALIAS.includes(toolsInput) &&
    !toolsInput.startsWith("http")
  ) {
    logger.info(`Using CodeQL CLI from local path ${toolsInput}`);
    return {
      codeqlTarPath: toolsInput,
      sourceType: "local",
      toolsVersion: "local",
    };
  }

  /**
   * Whether the tools shipped with the Action, i.e. those in `defaults.json`, have been forced.
   *
   * We use the special value of 'linked' to prioritize the version in `defaults.json` over the
   * version specified by the feature flags on Dotcom and over any pinned cached version on
   * Enterprise Server.
   *
   * Previously we have been using 'latest' to force the shipped tools, but this was not clear
   * enough for the users, so it has been changed to `linked`. We're keeping around `latest` for
   * backwards compatibility.
   */
  const forceShippedTools =
    toolsInput && CODEQL_BUNDLE_VERSION_ALIAS.includes(toolsInput);
  if (forceShippedTools) {
    logger.info(
      `Overriding the version of the CodeQL tools by ${defaultCliVersion.cliVersion}, the version shipped with the Action since ` +
        `tools: ${toolsInput} was requested.`,
    );

    if (toolsInput === "latest") {
      logger.warning(
        "`tools: latest` has been renamed to `tools: linked`, but the old name is still supported for now. No action is required.",
      );
    }
  }

  /** CLI version number, for example 2.12.6. */
  let cliVersion: string | undefined;
  /** Tag name of the CodeQL bundle, for example `codeql-bundle-20230120`. */
  let tagName: string | undefined;
  /**
   * URL of the CodeQL bundle.
   *
   * This does not always include a tag name.
   */
  let url: string | undefined;

  if (forceShippedTools) {
    cliVersion = defaults.cliVersion;
    tagName = defaults.bundleVersion;
  } else if (toolsInput !== undefined) {
    // If a tools URL was provided, then use that.
    tagName = tryGetTagNameFromUrl(toolsInput, logger);
    url = toolsInput;

    if (tagName) {
      const bundleVersion = tryGetBundleVersionFromTagName(tagName, logger);
      // If the bundle version is a semantic version, it is a CLI version number.
      if (bundleVersion && semver.valid(bundleVersion)) {
        cliVersion = convertToSemVer(bundleVersion, logger);
      }
    }
  } else {
    // Otherwise, use the default CLI version passed in.
    cliVersion = defaultCliVersion.cliVersion;
    tagName = defaultCliVersion.tagName;
  }

  const bundleVersion =
    tagName && tryGetBundleVersionFromTagName(tagName, logger);
  const humanReadableVersion =
    cliVersion ??
    (bundleVersion && convertToSemVer(bundleVersion, logger)) ??
    tagName ??
    url ??
    "unknown";

  logger.debug(
    "Attempting to obtain CodeQL tools. " +
      `CLI version: ${cliVersion ?? "unknown"}, ` +
      `bundle tag name: ${tagName ?? "unknown"}, ` +
      `URL: ${url ?? "unspecified"}.`,
  );

  let codeqlFolder: string | undefined;

  if (cliVersion) {
    // If we find the specified CLI version, we always use that.
    codeqlFolder = toolcache.find("CodeQL", cliVersion);

    // Fall back to matching `x.y.z-<tagName>`.
    if (!codeqlFolder) {
      logger.debug(
        "Didn't find a version of the CodeQL tools in the toolcache with a version number " +
          `exactly matching ${cliVersion}.`,
      );
      const allVersions = toolcache.findAllVersions("CodeQL");
      logger.debug(
        `Found the following versions of the CodeQL tools in the toolcache: ${JSON.stringify(
          allVersions,
        )}.`,
      );
      // If there is exactly one version of the CodeQL tools in the toolcache, and that version is
      // the form `x.y.z-<tagName>`, then use it.
      const candidateVersions = allVersions.filter((version) =>
        version.startsWith(`${cliVersion}-`),
      );
      if (candidateVersions.length === 1) {
        logger.debug(
          `Exactly one version of the CodeQL tools starting with ${cliVersion} found in the ` +
            "toolcache, using that.",
        );
        codeqlFolder = toolcache.find("CodeQL", candidateVersions[0]);
      } else if (candidateVersions.length === 0) {
        logger.debug(
          `Didn't find any versions of the CodeQL tools starting with ${cliVersion} ` +
            `in the toolcache. Trying next fallback method.`,
        );
      } else {
        logger.warning(
          `Found ${candidateVersions.length} versions of the CodeQL tools starting with ` +
            `${cliVersion} in the toolcache, but at most one was expected.`,
        );
        logger.debug("Trying next fallback method.");
      }
    }
  }

  // Fall back to matching `0.0.0-<bundleVersion>`.
  if (!codeqlFolder && tagName) {
    const fallbackVersion = await tryGetFallbackToolcacheVersion(
      cliVersion,
      tagName,
      logger,
    );
    if (fallbackVersion) {
      codeqlFolder = toolcache.find("CodeQL", fallbackVersion);
    } else {
      logger.debug(
        "Could not determine a fallback toolcache version number for CodeQL tools version " +
          `${humanReadableVersion}.`,
      );
    }
  }

  if (codeqlFolder) {
    logger.info(
      `Found CodeQL tools version ${humanReadableVersion} in the toolcache.`,
    );
  } else {
    logger.info(
      `Did not find CodeQL tools version ${humanReadableVersion} in the toolcache.`,
    );
  }

  if (codeqlFolder) {
    if (cliVersion) {
      logger.info(
        `Using CodeQL CLI version ${cliVersion} from toolcache at ${codeqlFolder}`,
      );
    } else {
      logger.info(`Using CodeQL CLI from toolcache at ${codeqlFolder}`);
    }
    return {
      codeqlFolder,
      sourceType: "toolcache",
      toolsVersion: cliVersion ?? humanReadableVersion,
    };
  }

  // If we don't find the requested version on Enterprise, we may allow a
  // different version to save download time if the version hasn't been
  // specified explicitly (in which case we always honor it).
  if (
    variant !== util.GitHubVariant.DOTCOM &&
    !forceShippedTools &&
    !toolsInput
  ) {
    const result = await findOverridingToolsInCache(
      humanReadableVersion,
      logger,
    );
    if (result !== undefined) {
      return result;
    }
  }

  if (!url) {
    url = await getCodeQLBundleDownloadURL(
      tagName!,
      apiDetails,
      cliVersion !== undefined &&
        (await useZstdBundle(cliVersion, features, tarSupportsZstd)),
      logger,
    );
  }

  if (cliVersion) {
    logger.info(`Using CodeQL CLI version ${cliVersion} sourced from ${url} .`);
  } else {
    logger.info(`Using CodeQL CLI sourced from ${url} .`);
  }
  return {
    bundleVersion: tagName && tryGetBundleVersionFromTagName(tagName, logger),
    cliVersion,
    codeqlURL: url,
    sourceType: "download",
    toolsVersion: cliVersion ?? humanReadableVersion,
  };
}

/**
 * Gets a fallback version number to use when looking for CodeQL in the toolcache if we didn't find
 * the `x.y.z` version. This is to support old versions of the toolcache.
 */
export async function tryGetFallbackToolcacheVersion(
  cliVersion: string | undefined,
  tagName: string,
  logger: Logger,
): Promise<string | undefined> {
  const bundleVersion = tryGetBundleVersionFromTagName(tagName, logger);
  if (!bundleVersion) {
    return undefined;
  }
  const fallbackVersion = convertToSemVer(bundleVersion, logger);
  logger.debug(
    `Computed a fallback toolcache version number of ${fallbackVersion} for CodeQL version ` +
      `${cliVersion ?? tagName}.`,
  );
  return fallbackVersion;
}

// Exported using `export const` for testing purposes. Specifically, we want to
// be able to stub this function and have other functions in this file use that stub.
export const downloadCodeQL = async function (
  codeqlURL: string,
  maybeBundleVersion: string | undefined,
  maybeCliVersion: string | undefined,
  apiDetails: api.GitHubApiDetails,
  tarVersion: tar.TarVersion | undefined,
  tempDir: string,
  features: FeatureEnablement,
  logger: Logger,
): Promise<{
  codeqlFolder: string;
  statusReport: ToolsDownloadStatusReport;
  toolsVersion: string;
}> {
  const parsedCodeQLURL = new URL(codeqlURL);
  const searchParams = new URLSearchParams(parsedCodeQLURL.search);
  const headers: OutgoingHttpHeaders = {
    accept: "application/octet-stream",
  };
  // We only want to provide an authorization header if we are downloading
  // from the same GitHub instance the Action is running on.
  // This avoids leaking Enterprise tokens to dotcom.
  // We also don't want to send an authorization header if there's already a token provided in the URL.
  let authorization: string | undefined = undefined;
  if (searchParams.has("token")) {
    logger.debug("CodeQL tools URL contains an authorization token.");
  } else if (
    codeqlURL.startsWith(`${apiDetails.url}/`) ||
    (apiDetails.apiURL && codeqlURL.startsWith(`${apiDetails.apiURL}/`))
  ) {
    logger.debug("Providing an authorization token to download CodeQL tools.");
    authorization = `token ${apiDetails.auth}`;
  } else {
    logger.debug("Downloading CodeQL tools without an authorization token.");
  }

  const { extractedBundlePath, statusReport } = await downloadAndExtract(
    codeqlURL,
    authorization,
    { "User-Agent": "CodeQL Action", ...headers },
    tarVersion,
    tempDir,
    features,
    logger,
  );

  const bundleVersion =
    maybeBundleVersion ?? tryGetBundleVersionFromUrl(codeqlURL, logger);

  if (bundleVersion === undefined) {
    logger.debug(
      "Could not cache CodeQL tools because we could not determine the bundle version from the " +
        `URL ${codeqlURL}.`,
    );
    return {
      codeqlFolder: extractedBundlePath,
      statusReport,
      toolsVersion: maybeCliVersion ?? "unknown",
    };
  }

  logger.debug("Caching CodeQL bundle.");
  const toolcacheVersion = getCanonicalToolcacheVersion(
    maybeCliVersion,
    bundleVersion,
    logger,
  );
  const toolcacheStart = performance.now();
  const toolcachedBundlePath = await toolcache.cacheDir(
    extractedBundlePath,
    "CodeQL",
    toolcacheVersion,
  );

  logger.info(
    `Added CodeQL bundle to the tool cache (${formatDuration(
      performance.now() - toolcacheStart,
    )}).`,
  );

  // Defensive check: we expect `cacheDir` to copy the bundle to a new location.
  if (toolcachedBundlePath !== extractedBundlePath) {
    await cleanUpGlob(
      extractedBundlePath,
      "CodeQL bundle from temporary directory",
      logger,
    );
  }

  return {
    codeqlFolder: toolcachedBundlePath,
    statusReport,
    toolsVersion: maybeCliVersion ?? toolcacheVersion,
  };
};

export function getCodeQLURLVersion(url: string): string {
  const match = url.match(/\/codeql-bundle-(.*)\//);
  if (match === null || match.length < 2) {
    throw new util.ConfigurationError(
      `Malformed tools url: ${url}. Version could not be inferred`,
    );
  }
  return match[1];
}

/**
 * Returns the toolcache version number to use to store the bundle with the associated CLI version
 * and bundle version.
 *
 * This is the canonical version number, since toolcaches populated by different versions of the
 * CodeQL Action or different runner image creation scripts may store the bundle using a different
 * version number. Functions like `getCodeQLSource` that fetch the bundle from rather than save the
 * bundle to the toolcache should handle these different version numbers.
 */
function getCanonicalToolcacheVersion(
  cliVersion: string | undefined,
  bundleVersion: string,
  logger: Logger,
) {
  // If the CLI version is a pre-release or contains build metadata, then cache the
  // bundle as `0.0.0-<bundleVersion>` to avoid the bundle being interpreted as containing a stable
  // CLI release. In principle, it should be enough to just check that the CLI version isn't a
  // pre-release, but the version numbers of CodeQL nightlies have the format `x.y.z+<timestamp>`,
  // and we don't want these nightlies to override stable CLI versions in the toolcache.
  if (!cliVersion?.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
    return convertToSemVer(bundleVersion, logger);
  }
  // Bundles are now semantically versioned and can be looked up based on just the CLI version
  // number, so we can version them in the toolcache using just the CLI version number.
  return cliVersion;
}

export interface SetupCodeQLResult {
  codeqlFolder: string;
  toolsDownloadStatusReport?: ToolsDownloadStatusReport;
  toolsSource: ToolsSource;
  toolsVersion: string;
  zstdAvailability: tar.ZstdAvailability;
  zstdFailureReason?: string;
}

/**
 * Obtains the CodeQL bundle, installs it in the toolcache if appropriate, and extracts it.
 *
 * @returns the path to the extracted bundle, and the version of the tools
 */
export async function setupCodeQLBundle(
  toolsInput: string | undefined,
  apiDetails: api.GitHubApiDetails,
  tempDir: string,
  variant: util.GitHubVariant,
  defaultCliVersion: CodeQLDefaultVersionInfo,
  features: FeatureEnablement,
  logger: Logger,
): Promise<SetupCodeQLResult> {
  const zstdAvailability = await tar.isZstdAvailable(logger);
  let zstdFailureReason: string | undefined;

  // If we think the installed version of tar supports zstd, try to use zstd,
  // but be prepared to fall back to gzip in case we were wrong.
  if (zstdAvailability.available) {
    try {
      // To facilitate testing the fallback, fail here if a testing environment variable is set.
      if (process.env.CODEQL_ACTION_FORCE_ZSTD_FAILURE === "true") {
        throw new Error(
          "Failing since CODEQL_ACTION_FORCE_ZSTD_FAILURE is true.",
        );
      }
      return await setupCodeQLBundleWithCompressionMethod(
        toolsInput,
        apiDetails,
        tempDir,
        variant,
        defaultCliVersion,
        features,
        logger,
        zstdAvailability,
        true,
      );
    } catch (e) {
      zstdFailureReason = util.getErrorMessage(e) || "unknown error";
      if (e instanceof CommandInvocationError) {
        zstdFailureReason += ` Full error: ${e.stderr}`;
        logger.debug(`Invocation output the following to stderr: ${e.stderr}`);
      }
      logger.warning(
        `Failed to set up CodeQL tools with zstd. Falling back to gzipped version. Error: ${util.getErrorMessage(
          e,
        )}`,
      );
    }
  }

  const result = await setupCodeQLBundleWithCompressionMethod(
    toolsInput,
    apiDetails,
    tempDir,
    variant,
    defaultCliVersion,
    features,
    logger,
    zstdAvailability,
    false,
  );
  if (result.toolsDownloadStatusReport && zstdFailureReason) {
    result.toolsDownloadStatusReport.zstdFailureReason = zstdFailureReason;
  }
  return result;
}

async function setupCodeQLBundleWithCompressionMethod(
  toolsInput: string | undefined,
  apiDetails: api.GitHubApiDetails,
  tempDir: string,
  variant: util.GitHubVariant,
  defaultCliVersion: CodeQLDefaultVersionInfo,
  features: FeatureEnablement,
  logger: Logger,
  zstdAvailability: tar.ZstdAvailability,
  useTarIfAvailable: boolean,
) {
  const source = await getCodeQLSource(
    toolsInput,
    defaultCliVersion,
    apiDetails,
    variant,
    useTarIfAvailable,
    features,
    logger,
  );

  let codeqlFolder: string;
  let toolsVersion = source.toolsVersion;
  let toolsDownloadStatusReport: ToolsDownloadStatusReport | undefined;
  let toolsSource: ToolsSource;
  switch (source.sourceType) {
    case "local": {
      const compressionMethod = tar.inferCompressionMethod(
        source.codeqlTarPath,
      );
      codeqlFolder = await tar.extract(
        source.codeqlTarPath,
        compressionMethod,
        zstdAvailability.version,
        logger,
      );
      toolsSource = ToolsSource.Local;
      break;
    }
    case "toolcache":
      codeqlFolder = source.codeqlFolder;
      logger.debug(`CodeQL found in cache ${codeqlFolder}`);
      toolsSource = ToolsSource.Toolcache;
      break;
    case "download": {
      const result = await downloadCodeQL(
        source.codeqlURL,
        source.bundleVersion,
        source.cliVersion,
        apiDetails,
        zstdAvailability.version,
        tempDir,
        features,
        logger,
      );
      toolsVersion = result.toolsVersion;
      codeqlFolder = result.codeqlFolder;
      toolsDownloadStatusReport = result.statusReport;
      toolsSource = ToolsSource.Download;
      break;
    }
    default:
      util.assertNever(source);
  }
  return {
    codeqlFolder,
    toolsDownloadStatusReport,
    toolsSource,
    toolsVersion,
    zstdAvailability,
  };
}

async function useZstdBundle(
  cliVersion: string,
  features: FeatureEnablement,
  tarSupportsZstd: boolean,
): Promise<boolean> {
  return (
    // In testing, gzip performs better than zstd on Windows.
    process.platform !== "win32" &&
    tarSupportsZstd &&
    semver.gte(cliVersion, CODEQL_VERSION_ZSTD_BUNDLE) &&
    !!(await features.getValue(Feature.ZstdBundle))
  );
}
