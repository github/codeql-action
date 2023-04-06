import * as fs from "fs";
import { OutgoingHttpHeaders } from "http";
import * as path from "path";
import { performance } from "perf_hooks";

import * as toolcache from "@actions/tool-cache";
import { default as deepEqual } from "fast-deep-equal";
import * as semver from "semver";
import { v4 as uuidV4 } from "uuid";

import { isRunningLocalAction } from "./actions-util";
import * as api from "./api-client";
// Note: defaults.json is referenced from the CodeQL Action sync tool and the Actions runner image
// creation scripts. Ensure that any changes to the format of this file are compatible with both of
// these dependents.
import * as defaults from "./defaults.json";
import { CodeQLDefaultVersionInfo } from "./feature-flags";
import { ToolsSource } from "./init";
import { Logger } from "./logging";
import * as util from "./util";
import { isGoodVersion, wrapError } from "./util";

export const CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";

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
  if (isRunningLocalAction()) {
    // This handles the case where the Action does not come from an Action repository,
    // e.g. our integration tests which use the Action code from the current checkout.
    // In these cases, the GITHUB_ACTION_REPOSITORY environment variable is not set.
    logger.info(
      "The CodeQL Action is checked out locally. Using the default CodeQL Action repository."
    );
    return CODEQL_DEFAULT_ACTION_REPOSITORY;
  }

  return util.getRequiredEnvParam("GITHUB_ACTION_REPOSITORY");
}

/**
 * Gets the tag name and, if known, the CodeQL CLI version for each CodeQL bundle release.
 *
 * CodeQL bundles are currently tagged in the form `codeql-bundle-yyyymmdd`, so it is not possible
 * to directly find the CodeQL bundle release for a particular CLI version or find the CodeQL CLI
 * version for a particular CodeQL bundle.
 *
 * To get around this, we add a `cli-version-x.y.z.txt` asset to each bundle release that specifies
 * the CLI version for that bundle release. We can then use the GitHub Releases for the CodeQL
 * Action as a source of truth.
 *
 * In the medium term, we should migrate to a tagging scheme that allows us to directly find the
 * CodeQL bundle release for a particular CLI version, for example `codeql-bundle-vx.y.z`.
 */
async function getCodeQLBundleReleasesDotcomOnly(
  logger: Logger
): Promise<Array<{ cliVersion?: string; tagName: string }>> {
  logger.debug(
    `Fetching CodeQL CLI version and CodeQL bundle tag name information for releases of the CodeQL tools.`
  );
  const apiClient = api.getApiClient();
  const codeQLActionRepository = getCodeQLActionRepository(logger);
  const releases = await apiClient.paginate(apiClient.repos.listReleases, {
    owner: codeQLActionRepository.split("/")[0],
    repo: codeQLActionRepository.split("/")[1],
  });
  logger.debug(`Found ${releases.length} releases.`);

  return releases.map((release) => ({
    cliVersion: tryGetCodeQLCliVersionForRelease(release, logger),
    tagName: release.tag_name,
  }));
}

function tryGetCodeQLCliVersionForRelease(
  release,
  logger: Logger
): string | undefined {
  const cliVersionsFromMarkerFiles = release.assets
    .map((asset) => asset.name.match(/cli-version-(.*)\.txt/)?.[1])
    .filter((v) => v)
    .map((v) => v as string);
  if (cliVersionsFromMarkerFiles.length > 1) {
    logger.warning(
      `Ignoring release ${release.tag_name} with multiple CLI version marker files.`
    );
    return undefined;
  } else if (cliVersionsFromMarkerFiles.length === 0) {
    logger.debug(
      `Failed to find the CodeQL CLI version for release ${release.tag_name}.`
    );
    return undefined;
  }
  return cliVersionsFromMarkerFiles[0];
}

export async function findCodeQLBundleTagDotcomOnly(
  cliVersion: string,
  logger: Logger
): Promise<string> {
  const filtered = (await getCodeQLBundleReleasesDotcomOnly(logger)).filter(
    (release) => release.cliVersion === cliVersion
  );
  if (filtered.length === 0) {
    throw new Error(
      `Failed to find a release of the CodeQL tools that contains CodeQL CLI ${cliVersion}.`
    );
  } else if (filtered.length > 1) {
    throw new Error(
      `Found multiple releases of the CodeQL tools that contain CodeQL CLI ${cliVersion}. ` +
        `Only one such release should exist.`
    );
  }
  return filtered[0].tagName;
}

export async function tryFindCliVersionDotcomOnly(
  tagName: string,
  logger: Logger
): Promise<string | undefined> {
  try {
    logger.debug(
      `Fetching the GitHub Release for the CodeQL bundle tagged ${tagName}.`
    );
    const apiClient = api.getApiClient();
    const codeQLActionRepository = getCodeQLActionRepository(logger);
    const release = await apiClient.repos.getReleaseByTag({
      owner: codeQLActionRepository.split("/")[0],
      repo: codeQLActionRepository.split("/")[1],
      tag: tagName,
    });
    return tryGetCodeQLCliVersionForRelease(release.data, logger);
  } catch (e) {
    logger.debug(
      `Failed to find the CLI version for the CodeQL bundle tagged ${tagName}. ${
        wrapError(e).message
      }`
    );
    return undefined;
  }
}

async function getCodeQLBundleDownloadURL(
  tagName: string,
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
        .getApiClient()
        .request("GET /enterprise/code-scanning/codeql-bundle/find/{tag}", {
          tag: tagName,
        });
      const assetID = release.data.assets[codeQLBundleName];
      if (assetID !== undefined) {
        const download = await api
          .getApiClient()
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
      const release = await api.getApiClient().repos.getReleaseByTag({
        owner: repositoryOwner,
        repo: repositoryName,
        tag: tagName,
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
  return `https://github.com/${CODEQL_DEFAULT_ACTION_REPOSITORY}/releases/download/${tagName}/${codeQLBundleName}`;
}

function tryGetBundleVersionFromTagName(
  tagName: string,
  logger: Logger
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
  logger: Logger
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
  logger: Logger
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
      `CodeQL tools version ${candidate.version} in toolcache overriding version ${humanReadableVersion}.`
    );
    return {
      codeqlFolder: candidate.folder,
      sourceType: "toolcache",
      toolsVersion: candidate.version,
    };
  } else if (candidates.length === 0) {
    logger.debug(
      "Did not find any candidate pinned versions of the CodeQL tools in the toolcache."
    );
  } else {
    logger.debug(
      "Could not use CodeQL tools from the toolcache since more than one candidate pinned " +
        "version was found in the toolcache."
    );
  }
  return undefined;
}

export async function getCodeQLSource(
  toolsInput: string | undefined,
  defaultCliVersion: CodeQLDefaultVersionInfo,
  apiDetails: api.GitHubApiDetails,
  variant: util.GitHubVariant,
  logger: Logger
): Promise<CodeQLToolsSource> {
  if (toolsInput && toolsInput !== "latest" && !toolsInput.startsWith("http")) {
    return {
      codeqlTarPath: toolsInput,
      sourceType: "local",
      toolsVersion: "local",
    };
  }

  /**
   * Whether the tools shipped with the Action, i.e. those in `defaults.json`, have been forced.
   *
   * We use the special value of 'latest' to prioritize the version in `defaults.json` over the
   * version specified by the feature flags on Dotcom and over any pinned cached version on
   * Enterprise Server.
   */
  const forceShippedTools = toolsInput === "latest";
  if (forceShippedTools) {
    logger.info(
      "Overriding the version of the CodeQL tools by the version shipped with the Action since " +
        `"tools: latest" was requested.`
    );
  }

  /** CLI version number, for example 2.12.1. */
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
  } else {
    // Otherwise, use the default CLI version passed in.
    cliVersion = defaultCliVersion.cliVersion;
    tagName = defaultCliVersion["tagName"];
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
      `URL: ${url ?? "unspecified"}.`
  );

  let codeqlFolder;

  if (cliVersion) {
    // If we find the specified CLI version, we always use that.
    codeqlFolder = toolcache.find("CodeQL", cliVersion);

    // Fall back to matching `x.y.z-<tagName>`.
    if (!codeqlFolder) {
      logger.debug(
        "Didn't find a version of the CodeQL tools in the toolcache with a version number " +
          `exactly matching ${cliVersion}.`
      );
      const allVersions = toolcache.findAllVersions("CodeQL");
      logger.debug(
        `Found the following versions of the CodeQL tools in the toolcache: ${JSON.stringify(
          allVersions
        )}.`
      );
      // If there is exactly one version of the CodeQL tools in the toolcache, and that version is
      // the form `x.y.z-<tagName>`, then use it.
      const candidateVersions = allVersions.filter((version) =>
        version.startsWith(`${cliVersion}-`)
      );
      if (candidateVersions.length === 1) {
        logger.debug(
          `Exactly one version of the CodeQL tools starting with ${cliVersion} found in the ` +
            "toolcache, using that."
        );
        codeqlFolder = toolcache.find("CodeQL", candidateVersions[0]);
      } else if (candidateVersions.length === 0) {
        logger.debug(
          `Didn't find any versions of the CodeQL tools starting with ${cliVersion} ` +
            `in the toolcache. Trying next fallback method.`
        );
      } else {
        logger.warning(
          `Found ${candidateVersions.length} versions of the CodeQL tools starting with ` +
            `${cliVersion} in the toolcache, but at most one was expected.`
        );
        logger.debug("Trying next fallback method.");
      }
    }
  }

  // Fall back to matching `0.0.0-<bundleVersion>`.
  if (!codeqlFolder && (cliVersion || tagName)) {
    if (cliVersion || tagName) {
      const fallbackVersion = await tryGetFallbackToolcacheVersion(
        cliVersion,
        tagName,
        variant,
        logger
      );
      if (fallbackVersion) {
        codeqlFolder = toolcache.find("CodeQL", fallbackVersion);
      } else {
        logger.debug(
          "Could not determine a fallback toolcache version number for CodeQL tools version " +
            `${humanReadableVersion}.`
        );
      }
    } else {
      logger.debug(
        "Both the CLI version and the bundle version are unknown, so we will not be able to find " +
          "the requested version of the CodeQL tools in the toolcache."
      );
    }
  }

  if (codeqlFolder) {
    logger.info(
      `Found CodeQL tools version ${humanReadableVersion} in the toolcache.`
    );
  } else {
    logger.info(
      `Did not find CodeQL tools version ${humanReadableVersion} in the toolcache.`
    );
  }

  if (codeqlFolder) {
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
      logger
    );
    if (result !== undefined) {
      return result;
    }
  }

  if (!url) {
    if (!tagName && cliVersion && variant === util.GitHubVariant.DOTCOM) {
      tagName = await findCodeQLBundleTagDotcomOnly(cliVersion, logger);
    } else if (!tagName) {
      throw new Error(
        `Could not obtain the requested version (${humanReadableVersion}) of the CodeQL tools ` +
          "since we could not compute the tag name."
      );
    }
    url = await getCodeQLBundleDownloadURL(
      tagName,
      apiDetails,
      variant,
      logger
    );
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
  tagName: string | undefined,
  variant: util.GitHubVariant,
  logger: Logger
): Promise<string | undefined> {
  //
  // If we are on Dotcom, we will make an HTTP request to the Releases API here
  // to find the tag name for the requested version.
  if (cliVersion && !tagName && variant === util.GitHubVariant.DOTCOM) {
    tagName = await findCodeQLBundleTagDotcomOnly(cliVersion, logger);
  }
  if (!tagName) {
    return undefined;
  }
  const bundleVersion = tryGetBundleVersionFromTagName(tagName, logger);
  if (!bundleVersion) {
    return undefined;
  }
  const fallbackVersion = convertToSemVer(bundleVersion, logger);
  logger.debug(
    `Computed a fallback toolcache version number of ${fallbackVersion} for CodeQL version ` +
      `${cliVersion ?? tagName}.`
  );
  return fallbackVersion;
}

export async function downloadCodeQL(
  codeqlURL: string,
  maybeBundleVersion: string | undefined,
  maybeCliVersion: string | undefined,
  apiDetails: api.GitHubApiDetails,
  variant: util.GitHubVariant,
  tempDir: string,
  logger: Logger
): Promise<{
  toolsVersion: string;
  codeqlFolder: string;
  toolsDownloadDurationMs: number;
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
  } else if (codeqlURL.startsWith(`${apiDetails.url}/`)) {
    logger.debug("Providing an authorization token to download CodeQL tools.");
    authorization = `token ${apiDetails.auth}`;
  } else {
    logger.debug("Downloading CodeQL tools without an authorization token.");
  }
  logger.info(
    `Downloading CodeQL tools from ${codeqlURL}. This may take a while.`
  );

  const dest = path.join(tempDir, uuidV4());
  const finalHeaders = Object.assign(
    { "User-Agent": "CodeQL Action" },
    headers
  );

  const toolsDownloadStart = performance.now();
  const codeqlPath = await toolcache.downloadTool(
    codeqlURL,
    dest,
    authorization,
    finalHeaders
  );
  const toolsDownloadDurationMs = Math.round(
    performance.now() - toolsDownloadStart
  );

  logger.debug(`CodeQL bundle download to ${codeqlPath} complete.`);

  const codeqlExtracted = await toolcache.extractTar(codeqlPath);

  const bundleVersion =
    maybeBundleVersion ?? tryGetBundleVersionFromUrl(codeqlURL, logger);

  if (bundleVersion === undefined) {
    logger.debug(
      "Could not cache CodeQL tools because we could not determine the bundle version from the " +
        `URL ${codeqlURL}.`
    );
    return {
      toolsVersion: maybeCliVersion ?? "unknown",
      codeqlFolder: codeqlExtracted,
      toolsDownloadDurationMs,
    };
  }

  // Try to compute the CLI version for this bundle
  if (
    maybeCliVersion === undefined &&
    variant === util.GitHubVariant.DOTCOM &&
    codeqlURL.includes(`/${CODEQL_DEFAULT_ACTION_REPOSITORY}/`)
  ) {
    maybeCliVersion = await tryFindCliVersionDotcomOnly(
      `codeql-bundle-${bundleVersion}`,
      logger
    );
  }

  // Include both the CLI version and the bundle version in the toolcache version number. That way
  // if the user requests the same URL again, we can get it from the cache without having to call
  // any of the Releases API.
  //
  // Special case: If the CLI version is a pre-release or contains build metadata, then cache the
  // bundle as `0.0.0-<bundleVersion>` to avoid the bundle being interpreted as containing a stable
  // CLI release. In principle, it should be enough to just check that the CLI version isn't a
  // pre-release, but the version numbers of CodeQL nightlies have the format `x.y.z+<timestamp>`,
  // and we don't want these nightlies to override stable CLI versions in the toolcache.
  const toolcacheVersion = maybeCliVersion?.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)
    ? `${maybeCliVersion}-${bundleVersion}`
    : convertToSemVer(bundleVersion, logger);
  return {
    toolsVersion: maybeCliVersion ?? toolcacheVersion,
    codeqlFolder: await toolcache.cacheDir(
      codeqlExtracted,
      "CodeQL",
      toolcacheVersion
    ),
    toolsDownloadDurationMs,
  };
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

/**
 * Obtains the CodeQL bundle, installs it in the toolcache if appropriate, and extracts it.
 *
 * @param toolsInput
 * @param apiDetails
 * @param tempDir
 * @param variant
 * @param defaultCliVersion
 * @param logger
 * @param checkVersion Whether to check that CodeQL CLI meets the minimum
 *        version requirement. Must be set to true outside tests.
 * @returns the path to the extracted bundle, and the version of the tools
 */
export async function setupCodeQLBundle(
  toolsInput: string | undefined,
  apiDetails: api.GitHubApiDetails,
  tempDir: string,
  variant: util.GitHubVariant,
  defaultCliVersion: CodeQLDefaultVersionInfo,
  logger: Logger
): Promise<{
  codeqlFolder: string;
  toolsDownloadDurationMs?: number;
  toolsSource: ToolsSource;
  toolsVersion: string;
}> {
  const source = await getCodeQLSource(
    toolsInput,
    defaultCliVersion,
    apiDetails,
    variant,
    logger
  );

  let codeqlFolder: string;
  let toolsVersion = source.toolsVersion;
  let toolsDownloadDurationMs: number | undefined;
  let toolsSource: ToolsSource;
  switch (source.sourceType) {
    case "local":
      codeqlFolder = await toolcache.extractTar(source.codeqlTarPath);
      toolsSource = ToolsSource.Local;
      break;
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
        variant,
        tempDir,
        logger
      );
      toolsVersion = result.toolsVersion;
      codeqlFolder = result.codeqlFolder;
      toolsDownloadDurationMs = result.toolsDownloadDurationMs;
      toolsSource = ToolsSource.Download;
      break;
    }
    default:
      util.assertNever(source);
  }
  return { codeqlFolder, toolsDownloadDurationMs, toolsSource, toolsVersion };
}
