import * as fs from "fs";
import { OutgoingHttpHeaders } from "http";
import * as path from "path";

import * as toolcache from "@actions/tool-cache";
import { default as deepEqual } from "fast-deep-equal";
import * as semver from "semver";
import { v4 as uuidV4 } from "uuid";

import { isRunningLocalAction } from "./actions-util";
import * as api from "./api-client";
import * as defaults from "./defaults.json"; // Referenced from codeql-action-sync-tool!
import { CodeQLDefaultVersionInfo } from "./feature-flags";
import { Logger } from "./logging";
import * as util from "./util";
import { isGoodVersion } from "./util";

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

export async function findCodeQLBundleTagDotcomOnly(
  cliVersion: string,
  logger: Logger
): Promise<string> {
  logger.debug(
    `Trying to find the CodeQL bundle release for CLI version ${cliVersion}.`
  );
  const apiClient = api.getApiClient();
  const codeQLActionRepository = getCodeQLActionRepository(logger);
  const releases = await apiClient.paginate(apiClient.repos.listReleases, {
    owner: codeQLActionRepository.split("/")[0],
    repo: codeQLActionRepository.split("/")[1],
  });
  logger.debug(`Found ${releases.length} releases.`);

  for (const release of releases) {
    const cliVersionFileVersions = release.assets
      .map((asset) => asset.name.match(/cli-version-(.*)\.txt/)?.[1])
      .filter((v) => v)
      .map((v) => v as string);

    if (cliVersionFileVersions.length === 0) {
      logger.debug(
        `Ignoring release ${release.tag_name} with no CLI version marker file.`
      );
      continue;
    }
    if (cliVersionFileVersions.length > 1) {
      logger.warning(
        `Ignoring release ${release.tag_name} with multiple CLI version marker files.`
      );
      continue;
    }
    if (cliVersionFileVersions[0] === cliVersion) {
      return release.tag_name;
    }
  }
  throw new Error(
    `Failed to find a CodeQL bundle release for CLI version ${cliVersion}.`
  );
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

export function getBundleTagNameFromUrl(url: string): string {
  const match = url.match(/\/codeql-bundle-(.*)\//);
  if (match === null || match.length < 2) {
    throw new Error(
      `Malformed tools url: ${url}. Tag name could not be inferred`
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

type CodeQLToolsSource =
  | { codeqlTarPath: string; sourceType: "local"; toolsVersion: "local" }
  | {
      codeqlFolder: string;
      sourceType: "toolcache";
      toolsVersion: string;
    }
  | {
      codeqlURL: string;
      semanticVersion: string;
      sourceType: "download";
      toolsVersion: string;
    };

async function getOrFindBundleTagName(
  version: CodeQLDefaultVersionInfo,
  logger: Logger
): Promise<string> {
  if (version.variant === util.GitHubVariant.DOTCOM) {
    return await findCodeQLBundleTagDotcomOnly(version.cliVersion, logger);
  } else {
    return version.tagName;
  }
}

/**
 * Look for a version of the CodeQL tools in the cache which could override the requested CLI version.
 */
async function findOverridingToolsInCache(
  requestedCliVersion: string,
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
      `CodeQL tools version ${candidate.version} in toolcache overriding version ${requestedCliVersion}.`
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
  bypassToolcache: boolean,
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

  const forceLatestReason =
    // We use the special value of 'latest' to prioritize the version in the
    // defaults over any pinned cached version.
    toolsInput === "latest"
      ? '"tools: latest" was requested'
      : // If the user hasn't requested a particular CodeQL version, then bypass
      // the toolcache when the appropriate feature is enabled. This
      // allows us to quickly rollback a broken bundle that has made its way
      // into the toolcache.
      toolsInput === undefined && bypassToolcache
      ? "a specific version of the CodeQL tools was not requested and the bypass toolcache feature is enabled"
      : undefined;
  const forceLatest = forceLatestReason !== undefined;
  if (forceLatest) {
    logger.debug(
      `Forcing the latest version of the CodeQL tools since ${forceLatestReason}.`
    );
  }

  /**
   * The requested version is:
   * 
   * 1. The one in `defaults.json`, if forceLatest is true.
   * 2. The version specified by the tools input URL, if one was provided.
   * 3. The default CLI version, otherwise.
  
   * We include a `variant` property to let us verify using the type system that
   * `tagName` is only undefined when the variant is Dotcom. This lets us ensure
   * that we can always compute `tagName`, either by using the existing tag name
   * on enterprise instances, or calling `findCodeQLBundleTagDotcomOnly` on
   * Dotcom.
   */
  const requestedVersion = forceLatest
    ? // case 1
      {
        cliVersion: defaults.cliVersion,
        tagName: defaults.bundleVersion,
        variant,
      }
    : toolsInput !== undefined
    ? // case 2
      {
        cliVersion: convertToSemVer(
          getBundleTagNameFromUrl(toolsInput),
          logger
        ),
        tagName: getBundleTagNameFromUrl(toolsInput),
        url: toolsInput,
        variant,
      }
    : // case 3
      defaultCliVersion;

  // If we find the specified version, we always use that.
  let codeqlFolder = toolcache.find("CodeQL", requestedVersion.cliVersion);
  let tagName: string | undefined = requestedVersion["tagName"];

  if (!codeqlFolder) {
    logger.debug(
      "Didn't find a version of the CodeQL tools in the toolcache with a version number " +
        `exactly matching ${requestedVersion.cliVersion}.`
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
      version.startsWith(`${requestedVersion.cliVersion}-`)
    );
    if (candidateVersions.length === 1) {
      logger.debug("Exactly one candidate version found, using that.");
      codeqlFolder = toolcache.find("CodeQL", candidateVersions[0]);
    } else {
      logger.debug(
        "Did not find exactly one version of the CodeQL tools starting with the requested version."
      );
    }
  }

  if (!codeqlFolder && !requestedVersion.cliVersion.startsWith("0.0.0")) {
    // Fall back to accepting a `0.0.0-<tagName>` version if we didn't find the
    // `x.y.z` version. This is to support old versions of the toolcache.
    //
    // If we are on Dotcom, we will make an HTTP request to the Releases API here
    // to find the tag name for the requested version.
    tagName =
      tagName || (await getOrFindBundleTagName(requestedVersion, logger));
    const fallbackVersion = convertToSemVer(tagName, logger);
    logger.debug(
      `Computed a fallback toolcache version number of ${fallbackVersion} for CodeQL tools version ` +
        `${requestedVersion.cliVersion}.`
    );
    codeqlFolder = toolcache.find("CodeQL", fallbackVersion);
  }

  if (codeqlFolder) {
    return {
      codeqlFolder,
      sourceType: "toolcache",
      toolsVersion: requestedVersion.cliVersion,
    };
  }
  logger.debug(
    `Did not find CodeQL tools version ${requestedVersion.cliVersion} in the toolcache.`
  );

  // If we don't find the requested version on Enterprise, we may allow a
  // different version to save download time if the version hasn't been
  // specified explicitly (in which case we always honor it).
  if (variant !== util.GitHubVariant.DOTCOM && !forceLatest && !toolsInput) {
    const result = await findOverridingToolsInCache(
      requestedVersion.cliVersion,
      logger
    );
    if (result !== undefined) {
      return result;
    }
  }

  return {
    codeqlURL:
      requestedVersion["url"] ||
      (await getCodeQLBundleDownloadURL(
        tagName || (await getOrFindBundleTagName(requestedVersion, logger)),
        apiDetails,
        variant,
        logger
      )),
    semanticVersion: requestedVersion.cliVersion,
    sourceType: "download",
    toolsVersion: requestedVersion.cliVersion,
  };
}

export async function downloadCodeQL(
  codeqlURL: string,
  semanticVersion: string,
  apiDetails: api.GitHubApiDetails,
  tempDir: string,
  logger: Logger
): Promise<string> {
  const parsedCodeQLURL = new URL(codeqlURL);
  const searchParams = new URLSearchParams(parsedCodeQLURL.search);
  const headers: OutgoingHttpHeaders = {
    accept: "application/octet-stream",
  };
  // We only want to provide an authorization header if we are downloading
  // from the same GitHub instance the Action is running on.
  // This avoids leaking Enterprise tokens to dotcom.
  // We also don't want to send an authorization header if there's already a token provided in the URL.
  if (searchParams.has("token")) {
    logger.debug("CodeQL tools URL contains an authorization token.");
  } else if (codeqlURL.startsWith(`${apiDetails.url}/`)) {
    logger.debug("Providing an authorization token to download CodeQL tools.");
    headers.authorization = `token ${apiDetails.auth}`;
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
  const codeqlPath = await toolcache.downloadTool(
    codeqlURL,
    dest,
    undefined,
    finalHeaders
  );
  logger.debug(`CodeQL bundle download to ${codeqlPath} complete.`);

  const codeqlExtracted = await toolcache.extractTar(codeqlPath);
  return await toolcache.cacheDir(codeqlExtracted, "CodeQL", semanticVersion);
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
 * @param bypassToolcache
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
  bypassToolcache: boolean,
  defaultCliVersion: CodeQLDefaultVersionInfo,
  logger: Logger
): Promise<{ codeqlFolder: string; toolsVersion: string }> {
  const source = await getCodeQLSource(
    toolsInput,
    bypassToolcache,
    defaultCliVersion,
    apiDetails,
    variant,
    logger
  );

  let codeqlFolder: string;
  switch (source.sourceType) {
    case "local":
      codeqlFolder = await toolcache.extractTar(source.codeqlTarPath);
      break;
    case "toolcache":
      codeqlFolder = source.codeqlFolder;
      logger.debug(`CodeQL found in cache ${codeqlFolder}`);
      break;
    case "download":
      codeqlFolder = await downloadCodeQL(
        source.codeqlURL,
        source.semanticVersion,
        apiDetails,
        tempDir,
        logger
      );
      break;
    default:
      util.assertNever(source);
  }
  return { codeqlFolder, toolsVersion: source.toolsVersion };
}
