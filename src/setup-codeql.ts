import * as fs from "fs";
import { OutgoingHttpHeaders } from "http";
import * as path from "path";

import * as toolcache from "@actions/tool-cache";
import { default as deepEqual } from "fast-deep-equal";
import * as semver from "semver";
import { v4 as uuidV4 } from "uuid";

import { isDynamicWorkflow, isRunningLocalAction } from "./actions-util";
import * as api from "./api-client";
import * as defaults from "./defaults.json";
import {
  CODEQL_VERSION_ZSTD_BUNDLE,
  CodeQLDefaultVersionInfo,
  Feature,
  FeatureEnablement,
} from "./feature-flags";
import { Logger } from "./logging";
import * as tar from "./tar";
import {
  downloadAndExtract,
  getToolcacheDirectory,
  ToolsDownloadStatusReport,
  writeToolcacheMarkerFile,
} from "./tools-download";
import * as util from "./util";
import { isGoodVersion } from "./util";

export enum ToolsSource {
  Unknown = "UNKNOWN",
  Local = "LOCAL",
  Toolcache = "TOOLCACHE",
  Download = "DOWNLOAD",
}

export const CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";
const CODEQL_NIGHTLIES_REPOSITORY_OWNER = "dsp-testing";
const CODEQL_NIGHTLIES_REPOSITORY_NAME = "codeql-cli-nightlies";

const CODEQL_BUNDLE_VERSION_ALIAS: string[] = ["linked", "latest"];
const CODEQL_NIGHTLY_TOOLS_INPUTS = ["nightly", "nightly-latest"];
const CODEQL_TOOLCACHE_INPUT = "toolcache";

function getCodeQLBundleExtension(
  compressionMethod: tar.CompressionMethod,
): string {
  switch (compressionMethod) {
    case "gzip":
      return ".tar.gz";
    case "zstd":
      return ".tar.zst";
    default:
      util.assertNever(compressionMethod);
  }
}

function getCodeQLBundleName(compressionMethod: tar.CompressionMethod): string {
  const extension = getCodeQLBundleExtension(compressionMethod);

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
  compressionMethod: tar.CompressionMethod,
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
  const codeQLBundleName = getCodeQLBundleName(compressionMethod);
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
            `Found CodeQL bundle ${codeQLBundleName} in ${repository} on ${apiURL} with URL ${asset.url}.`,
          );
          return asset.url;
        }
      }
    } catch (e) {
      logger.info(
        `Looked for CodeQL bundle ${codeQLBundleName} in ${repository} on ${apiURL} but got error ${e}.`,
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

export function tryGetTagNameFromUrl(
  url: string,
  logger: Logger,
): string | undefined {
  const matches = [...url.matchAll(/\/(codeql-bundle-[^/]*)\//g)];
  if (matches.length === 0) {
    logger.debug(`Could not determine tag name for URL ${url}.`);
    return undefined;
  }
  // Example: https://github.com/org/codeql-bundle-testing/releases/download/codeql-bundle-v2.19.0/codeql-bundle-linux64.tar.zst
  // We require a trailing forward slash to be part of the match, so the last match gives us the tag
  // name. An alternative approach would be to also match against `/releases/`, but this approach
  // assumes less about the structure of the URL.
  const match = matches[matches.length - 1];

  if (match === null || match.length !== 2) {
    logger.debug(
      `Could not determine tag name for URL ${url}. Matched ${JSON.stringify(
        match,
      )}.`,
    );
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
      compressionMethod: tar.CompressionMethod;
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
      compressionMethod: tar.CompressionMethod;
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
    !isReservedToolsValue(toolsInput) &&
    !toolsInput.startsWith("http")
  ) {
    logger.info(`Using CodeQL CLI from local path ${toolsInput}`);
    const compressionMethod = tar.inferCompressionMethod(toolsInput);
    if (compressionMethod === undefined) {
      throw new util.ConfigurationError(
        `Could not infer compression method from path ${toolsInput}. Please specify a path ` +
          "ending in '.tar.gz' or '.tar.zst'.",
      );
    }
    return {
      codeqlTarPath: toolsInput,
      compressionMethod,
      sourceType: "local",
      toolsVersion: "local",
    };
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

  if (
    toolsInput !== undefined &&
    CODEQL_NIGHTLY_TOOLS_INPUTS.includes(toolsInput)
  ) {
    logger.info(
      `Using the latest CodeQL CLI nightly, as requested by 'tools: ${toolsInput}'.`,
    );
    toolsInput = await getNightlyToolsUrl(logger);
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
    cliVersion = defaults.cliVersion;
    tagName = defaults.bundleVersion;

    logger.info(
      `'tools: ${toolsInput}' was requested, so using CodeQL version ${cliVersion}, the version shipped with the Action.`,
    );

    if (toolsInput === "latest") {
      logger.warning(
        "`tools: latest` has been renamed to `tools: linked`, but the old name is still supported. No action is required.",
      );
    }
  } else if (
    toolsInput !== undefined &&
    toolsInput === CODEQL_TOOLCACHE_INPUT
  ) {
    let latestToolcacheVersion: string | undefined;

    // We only allow `toolsInput === "toolcache"` for `dynamic` events. In general, using `toolsInput === "toolcache"`
    // can lead to alert wobble and so it shouldn't be used for an analysis where results are intended to be uploaded.
    // We also allow this in test mode.
    const allowToolcacheValueFF = await features.getValue(
      Feature.AllowToolcacheInput,
    );
    const allowToolcacheValue =
      allowToolcacheValueFF && (isDynamicWorkflow() || util.isInTestMode());
    if (allowToolcacheValue) {
      // If `toolsInput === "toolcache"`, try to find the latest version of the CLI that's available in the toolcache
      // and use that. We perform this check here since we can set `cliVersion` directly and don't want to default to
      // the linked version.
      logger.info(
        `Attempting to use the latest CodeQL CLI version in the toolcache, as requested by 'tools: ${toolsInput}'.`,
      );

      latestToolcacheVersion = getLatestToolcacheVersion(logger);
      if (latestToolcacheVersion) {
        cliVersion = latestToolcacheVersion;
      }
    }

    if (latestToolcacheVersion === undefined) {
      if (allowToolcacheValue) {
        logger.info(
          `Found no CodeQL CLI in the toolcache, ignoring 'tools: ${toolsInput}'...`,
        );
      } else {
        if (allowToolcacheValueFF) {
          logger.warning(
            `Ignoring 'tools: ${toolsInput}' because the workflow was not triggered dynamically.`,
          );
        } else {
          logger.info(
            `Ignoring 'tools: ${toolsInput}' because the feature is not enabled.`,
          );
        }
      }

      cliVersion = defaultCliVersion.cliVersion;
      tagName = defaultCliVersion.tagName;
    }
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

  let compressionMethod: tar.CompressionMethod;

  if (!url) {
    compressionMethod =
      cliVersion !== undefined &&
      (await useZstdBundle(cliVersion, tarSupportsZstd))
        ? "zstd"
        : "gzip";

    url = await getCodeQLBundleDownloadURL(
      tagName!,
      apiDetails,
      compressionMethod,
      logger,
    );
  } else {
    const method = tar.inferCompressionMethod(url);
    if (method === undefined) {
      throw new util.ConfigurationError(
        `Could not infer compression method from URL ${url}. Please specify a URL ` +
          "ending in '.tar.gz' or '.tar.zst'.",
      );
    }
    compressionMethod = method;
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
    compressionMethod,
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
  compressionMethod: tar.CompressionMethod,
  maybeBundleVersion: string | undefined,
  maybeCliVersion: string | undefined,
  apiDetails: api.GitHubApiDetails,
  tarVersion: tar.TarVersion | undefined,
  tempDir: string,
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
  let authorization: string | undefined = undefined;

  // We don't want to send an authorization header if there's already a token provided in the URL.
  if (searchParams.has("token")) {
    logger.debug("CodeQL tools URL contains an authorization token.");
  } else {
    authorization = api.getAuthorizationHeaderFor(
      logger,
      apiDetails,
      codeqlURL,
    );
  }

  const toolcacheInfo = getToolcacheDestinationInfo(
    maybeBundleVersion,
    maybeCliVersion,
    logger,
  );

  const extractedBundlePath =
    toolcacheInfo?.path ?? getTempExtractionDir(tempDir);

  const statusReport = await downloadAndExtract(
    codeqlURL,
    compressionMethod,
    extractedBundlePath,
    authorization,
    { "User-Agent": "CodeQL Action", ...headers },
    tarVersion,
    logger,
  );

  if (!toolcacheInfo) {
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

  writeToolcacheMarkerFile(toolcacheInfo.path, logger);

  return {
    codeqlFolder: extractedBundlePath,
    statusReport,
    toolsVersion: maybeCliVersion ?? toolcacheInfo.version,
  };
};

function getToolcacheDestinationInfo(
  maybeBundleVersion: string | undefined,
  maybeCliVersion: string | undefined,
  logger: Logger,
): { path: string; version: string } | undefined {
  if (maybeBundleVersion) {
    const version = getCanonicalToolcacheVersion(
      maybeCliVersion,
      maybeBundleVersion,
      logger,
    );

    return {
      path: getToolcacheDirectory(version),
      version,
    };
  }

  return undefined;
}

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
): string {
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
) {
  if (!(await util.isBinaryAccessible("tar", logger))) {
    throw new util.ConfigurationError(
      "Could not find tar in PATH, so unable to extract CodeQL bundle.",
    );
  }
  const zstdAvailability = await tar.isZstdAvailable(logger);

  const source = await getCodeQLSource(
    toolsInput,
    defaultCliVersion,
    apiDetails,
    variant,
    zstdAvailability.available,
    features,
    logger,
  );

  let codeqlFolder: string;
  let toolsVersion = source.toolsVersion;
  let toolsDownloadStatusReport: ToolsDownloadStatusReport | undefined;
  let toolsSource: ToolsSource;
  switch (source.sourceType) {
    case "local": {
      codeqlFolder = await tar.extract(
        source.codeqlTarPath,
        getTempExtractionDir(tempDir),
        source.compressionMethod,
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
        source.compressionMethod,
        source.bundleVersion,
        source.cliVersion,
        apiDetails,
        zstdAvailability.version,
        tempDir,
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
  tarSupportsZstd: boolean,
): Promise<boolean> {
  return (
    // In testing, gzip performs better than zstd on Windows.
    process.platform !== "win32" &&
    tarSupportsZstd &&
    semver.gte(cliVersion, CODEQL_VERSION_ZSTD_BUNDLE)
  );
}

function getTempExtractionDir(tempDir: string) {
  return path.join(tempDir, uuidV4());
}

/**
 * Get the URL of the latest nightly CodeQL bundle.
 */
async function getNightlyToolsUrl(logger: Logger) {
  const zstdAvailability = await tar.isZstdAvailable(logger);
  // The nightly is guaranteed to have a zstd bundle
  const compressionMethod = (await useZstdBundle(
    CODEQL_VERSION_ZSTD_BUNDLE,
    zstdAvailability.available,
  ))
    ? "zstd"
    : "gzip";

  try {
    // Since nightlies are prereleases, we can't just download the latest release
    // on the repository. So instead we need to find the latest pre-release
    // version and construct the download URL from that.
    const release = await api.getApiClient().rest.repos.listReleases({
      owner: CODEQL_NIGHTLIES_REPOSITORY_OWNER,
      repo: CODEQL_NIGHTLIES_REPOSITORY_NAME,
      per_page: 1,
      page: 1,
      prerelease: true,
    });
    const latestRelease = release.data[0];
    if (!latestRelease) {
      throw new Error("Could not find the latest nightly release.");
    }
    return `https://github.com/${CODEQL_NIGHTLIES_REPOSITORY_OWNER}/${CODEQL_NIGHTLIES_REPOSITORY_NAME}/releases/download/${latestRelease.tag_name}/${getCodeQLBundleName(compressionMethod)}`;
  } catch (e) {
    throw new Error(
      `Failed to retrieve the latest nightly release: ${util.wrapError(e)}`,
    );
  }
}

/**
 * Gets the latest version of the CodeQL CLI that is available in the toolcache, or `undefined`
 * if no CodeQL CLI is available in the toolcache.
 *
 * @param logger The logger to use.
 * @returns The latest version of the CodeQL CLI that is available in the toolcache, or `undefined` if there is none.
 */
export function getLatestToolcacheVersion(logger: Logger): string | undefined {
  const allVersions = toolcache
    .findAllVersions("CodeQL")
    .sort((a, b) => semver.compare(b, a));
  logger.debug(
    `Found the following versions of the CodeQL tools in the toolcache: ${JSON.stringify(
      allVersions,
    )}.`,
  );

  if (allVersions.length > 0) {
    const latestToolcacheVersion = allVersions[0];
    logger.info(
      `CLI version ${latestToolcacheVersion} is the latest version in the toolcache.`,
    );
    return latestToolcacheVersion;
  }

  return undefined;
}

function isReservedToolsValue(tools: string): boolean {
  return (
    CODEQL_BUNDLE_VERSION_ALIAS.includes(tools) ||
    CODEQL_NIGHTLY_TOOLS_INPUTS.includes(tools) ||
    tools === CODEQL_TOOLCACHE_INPUT
  );
}
