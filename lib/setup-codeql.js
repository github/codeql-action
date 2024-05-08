"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCodeQLBundle = exports.getCodeQLURLVersion = exports.downloadCodeQL = exports.tryGetFallbackToolcacheVersion = exports.getCodeQLSource = exports.convertToSemVer = exports.tryGetBundleVersionFromUrl = exports.tryFindCliVersionDotcomOnly = exports.getCodeQLActionRepository = exports.CODEQL_DEFAULT_ACTION_REPOSITORY = exports.ToolsSource = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const perf_hooks_1 = require("perf_hooks");
const toolcache = __importStar(require("@actions/tool-cache"));
const del_1 = __importDefault(require("del"));
const fast_deep_equal_1 = __importDefault(require("fast-deep-equal"));
const semver = __importStar(require("semver"));
const uuid_1 = require("uuid");
const actions_util_1 = require("./actions-util");
const api = __importStar(require("./api-client"));
// Note: defaults.json is referenced from the CodeQL Action sync tool and the Actions runner image
// creation scripts. Ensure that any changes to the format of this file are compatible with both of
// these dependents.
const defaults = __importStar(require("./defaults.json"));
const feature_flags_1 = require("./feature-flags");
const util = __importStar(require("./util"));
const util_1 = require("./util");
var ToolsSource;
(function (ToolsSource) {
    ToolsSource["Unknown"] = "UNKNOWN";
    ToolsSource["Local"] = "LOCAL";
    ToolsSource["Toolcache"] = "TOOLCACHE";
    ToolsSource["Download"] = "DOWNLOAD";
})(ToolsSource || (exports.ToolsSource = ToolsSource = {}));
exports.CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";
const CODEQL_BUNDLE_VERSION_ALIAS = ["linked", "latest"];
function getCodeQLBundleName() {
    let platform;
    if (process.platform === "win32") {
        platform = "win64";
    }
    else if (process.platform === "linux") {
        platform = "linux64";
    }
    else if (process.platform === "darwin") {
        platform = "osx64";
    }
    else {
        return "codeql-bundle.tar.gz";
    }
    return `codeql-bundle-${platform}.tar.gz`;
}
function getCodeQLActionRepository(logger) {
    if ((0, actions_util_1.isRunningLocalAction)()) {
        // This handles the case where the Action does not come from an Action repository,
        // e.g. our integration tests which use the Action code from the current checkout.
        // In these cases, the GITHUB_ACTION_REPOSITORY environment variable is not set.
        logger.info("The CodeQL Action is checked out locally. Using the default CodeQL Action repository.");
        return exports.CODEQL_DEFAULT_ACTION_REPOSITORY;
    }
    return util.getRequiredEnvParam("GITHUB_ACTION_REPOSITORY");
}
exports.getCodeQLActionRepository = getCodeQLActionRepository;
function tryGetCodeQLCliVersionForRelease(release, logger) {
    const cliVersionsFromMarkerFiles = release.assets
        .map((asset) => asset.name.match(/cli-version-(.*)\.txt/)?.[1])
        .filter((v) => v)
        .map((v) => v);
    if (cliVersionsFromMarkerFiles.length > 1) {
        logger.warning(`Ignoring release ${release.tag_name} with multiple CLI version marker files.`);
        return undefined;
    }
    else if (cliVersionsFromMarkerFiles.length === 0) {
        logger.debug(`Failed to find the CodeQL CLI version for release ${release.tag_name}.`);
        return undefined;
    }
    return cliVersionsFromMarkerFiles[0];
}
async function tryFindCliVersionDotcomOnly(tagName, logger) {
    try {
        logger.debug(`Fetching the GitHub Release for the CodeQL bundle tagged ${tagName}.`);
        const apiClient = api.getApiClient();
        const codeQLActionRepository = getCodeQLActionRepository(logger);
        const release = await apiClient.rest.repos.getReleaseByTag({
            owner: codeQLActionRepository.split("/")[0],
            repo: codeQLActionRepository.split("/")[1],
            tag: tagName,
        });
        return tryGetCodeQLCliVersionForRelease(release.data, logger);
    }
    catch (e) {
        logger.debug(`Failed to find the CLI version for the CodeQL bundle tagged ${tagName}. ${(0, util_1.wrapError)(e).message}`);
        return undefined;
    }
}
exports.tryFindCliVersionDotcomOnly = tryFindCliVersionDotcomOnly;
async function getCodeQLBundleDownloadURL(tagName, apiDetails, logger) {
    const codeQLActionRepository = getCodeQLActionRepository(logger);
    const potentialDownloadSources = [
        // This GitHub instance, and this Action.
        [apiDetails.url, codeQLActionRepository],
        // This GitHub instance, and the canonical Action.
        [apiDetails.url, exports.CODEQL_DEFAULT_ACTION_REPOSITORY],
        // GitHub.com, and the canonical Action.
        [util.GITHUB_DOTCOM_URL, exports.CODEQL_DEFAULT_ACTION_REPOSITORY],
    ];
    // We now filter out any duplicates.
    // Duplicates will happen either because the GitHub instance is GitHub.com, or because the Action is not a fork.
    const uniqueDownloadSources = potentialDownloadSources.filter((source, index, self) => {
        return !self.slice(0, index).some((other) => (0, fast_deep_equal_1.default)(source, other));
    });
    const codeQLBundleName = getCodeQLBundleName();
    for (const downloadSource of uniqueDownloadSources) {
        const [apiURL, repository] = downloadSource;
        // If we've reached the final case, short-circuit the API check since we know the bundle exists and is public.
        if (apiURL === util.GITHUB_DOTCOM_URL &&
            repository === exports.CODEQL_DEFAULT_ACTION_REPOSITORY) {
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
                    logger.info(`Found CodeQL bundle in ${downloadSource[1]} on ${downloadSource[0]} with URL ${asset.url}.`);
                    return asset.url;
                }
            }
        }
        catch (e) {
            logger.info(`Looked for CodeQL bundle in ${downloadSource[1]} on ${downloadSource[0]} but got error ${e}.`);
        }
    }
    return `https://github.com/${exports.CODEQL_DEFAULT_ACTION_REPOSITORY}/releases/download/${tagName}/${codeQLBundleName}`;
}
function tryGetBundleVersionFromTagName(tagName, logger) {
    const match = tagName.match(/^codeql-bundle-(.*)$/);
    if (match === null || match.length < 2) {
        logger.debug(`Could not determine bundle version from tag ${tagName}.`);
        return undefined;
    }
    return match[1];
}
function tryGetTagNameFromUrl(url, logger) {
    const match = url.match(/\/(codeql-bundle-.*)\//);
    if (match === null || match.length < 2) {
        logger.debug(`Could not determine tag name for URL ${url}.`);
        return undefined;
    }
    return match[1];
}
function tryGetBundleVersionFromUrl(url, logger) {
    const tagName = tryGetTagNameFromUrl(url, logger);
    if (tagName === undefined) {
        return undefined;
    }
    return tryGetBundleVersionFromTagName(tagName, logger);
}
exports.tryGetBundleVersionFromUrl = tryGetBundleVersionFromUrl;
function convertToSemVer(version, logger) {
    if (!semver.valid(version)) {
        logger.debug(`Bundle version ${version} is not in SemVer format. Will treat it as pre-release 0.0.0-${version}.`);
        version = `0.0.0-${version}`;
    }
    const s = semver.clean(version);
    if (!s) {
        throw new Error(`Bundle version ${version} is not in SemVer format.`);
    }
    return s;
}
exports.convertToSemVer = convertToSemVer;
/**
 * Look for a version of the CodeQL tools in the cache which could override the requested CLI version.
 */
async function findOverridingToolsInCache(humanReadableVersion, logger) {
    const candidates = toolcache
        .findAllVersions("CodeQL")
        .filter(util_1.isGoodVersion)
        .map((version) => ({
        folder: toolcache.find("CodeQL", version),
        version,
    }))
        .filter(({ folder }) => fs.existsSync(path.join(folder, "pinned-version")));
    if (candidates.length === 1) {
        const candidate = candidates[0];
        logger.debug(`CodeQL tools version ${candidate.version} in toolcache overriding version ${humanReadableVersion}.`);
        return {
            codeqlFolder: candidate.folder,
            sourceType: "toolcache",
            toolsVersion: candidate.version,
        };
    }
    else if (candidates.length === 0) {
        logger.debug("Did not find any candidate pinned versions of the CodeQL tools in the toolcache.");
    }
    else {
        logger.debug("Could not use CodeQL tools from the toolcache since more than one candidate pinned " +
            "version was found in the toolcache.");
    }
    return undefined;
}
async function getCodeQLSource(toolsInput, defaultCliVersion, apiDetails, variant, logger) {
    if (toolsInput &&
        !CODEQL_BUNDLE_VERSION_ALIAS.includes(toolsInput) &&
        !toolsInput.startsWith("http")) {
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
    const forceShippedTools = toolsInput && CODEQL_BUNDLE_VERSION_ALIAS.includes(toolsInput);
    if (forceShippedTools) {
        logger.info("Overriding the version of the CodeQL tools by the version shipped with the Action since " +
            `"tools: linked" or "tools: latest" was requested.`);
    }
    /** CLI version number, for example 2.12.6. */
    let cliVersion;
    /** Tag name of the CodeQL bundle, for example `codeql-bundle-20230120`. */
    let tagName;
    /**
     * URL of the CodeQL bundle.
     *
     * This does not always include a tag name.
     */
    let url;
    if (forceShippedTools) {
        cliVersion = defaults.cliVersion;
        tagName = defaults.bundleVersion;
    }
    else if (toolsInput !== undefined) {
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
    }
    else {
        // Otherwise, use the default CLI version passed in.
        cliVersion = defaultCliVersion.cliVersion;
        tagName = defaultCliVersion.tagName;
    }
    const bundleVersion = tagName && tryGetBundleVersionFromTagName(tagName, logger);
    const humanReadableVersion = cliVersion ??
        (bundleVersion && convertToSemVer(bundleVersion, logger)) ??
        tagName ??
        url ??
        "unknown";
    logger.debug("Attempting to obtain CodeQL tools. " +
        `CLI version: ${cliVersion ?? "unknown"}, ` +
        `bundle tag name: ${tagName ?? "unknown"}, ` +
        `URL: ${url ?? "unspecified"}.`);
    let codeqlFolder;
    if (cliVersion) {
        // If we find the specified CLI version, we always use that.
        codeqlFolder = toolcache.find("CodeQL", cliVersion);
        // Fall back to matching `x.y.z-<tagName>`.
        if (!codeqlFolder) {
            logger.debug("Didn't find a version of the CodeQL tools in the toolcache with a version number " +
                `exactly matching ${cliVersion}.`);
            const allVersions = toolcache.findAllVersions("CodeQL");
            logger.debug(`Found the following versions of the CodeQL tools in the toolcache: ${JSON.stringify(allVersions)}.`);
            // If there is exactly one version of the CodeQL tools in the toolcache, and that version is
            // the form `x.y.z-<tagName>`, then use it.
            const candidateVersions = allVersions.filter((version) => version.startsWith(`${cliVersion}-`));
            if (candidateVersions.length === 1) {
                logger.debug(`Exactly one version of the CodeQL tools starting with ${cliVersion} found in the ` +
                    "toolcache, using that.");
                codeqlFolder = toolcache.find("CodeQL", candidateVersions[0]);
            }
            else if (candidateVersions.length === 0) {
                logger.debug(`Didn't find any versions of the CodeQL tools starting with ${cliVersion} ` +
                    `in the toolcache. Trying next fallback method.`);
            }
            else {
                logger.warning(`Found ${candidateVersions.length} versions of the CodeQL tools starting with ` +
                    `${cliVersion} in the toolcache, but at most one was expected.`);
                logger.debug("Trying next fallback method.");
            }
        }
    }
    // Fall back to matching `0.0.0-<bundleVersion>`.
    if (!codeqlFolder && tagName) {
        const fallbackVersion = await tryGetFallbackToolcacheVersion(cliVersion, tagName, logger);
        if (fallbackVersion) {
            codeqlFolder = toolcache.find("CodeQL", fallbackVersion);
        }
        else {
            logger.debug("Could not determine a fallback toolcache version number for CodeQL tools version " +
                `${humanReadableVersion}.`);
        }
    }
    if (codeqlFolder) {
        logger.info(`Found CodeQL tools version ${humanReadableVersion} in the toolcache.`);
    }
    else {
        logger.info(`Did not find CodeQL tools version ${humanReadableVersion} in the toolcache.`);
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
    if (variant !== util.GitHubVariant.DOTCOM &&
        !forceShippedTools &&
        !toolsInput) {
        const result = await findOverridingToolsInCache(humanReadableVersion, logger);
        if (result !== undefined) {
            return result;
        }
    }
    if (!url) {
        url = await getCodeQLBundleDownloadURL(tagName, apiDetails, logger);
    }
    return {
        bundleVersion: tagName && tryGetBundleVersionFromTagName(tagName, logger),
        cliVersion,
        codeqlURL: url,
        sourceType: "download",
        toolsVersion: cliVersion ?? humanReadableVersion,
    };
}
exports.getCodeQLSource = getCodeQLSource;
/**
 * Gets a fallback version number to use when looking for CodeQL in the toolcache if we didn't find
 * the `x.y.z` version. This is to support old versions of the toolcache.
 */
async function tryGetFallbackToolcacheVersion(cliVersion, tagName, logger) {
    const bundleVersion = tryGetBundleVersionFromTagName(tagName, logger);
    if (!bundleVersion) {
        return undefined;
    }
    const fallbackVersion = convertToSemVer(bundleVersion, logger);
    logger.debug(`Computed a fallback toolcache version number of ${fallbackVersion} for CodeQL version ` +
        `${cliVersion ?? tagName}.`);
    return fallbackVersion;
}
exports.tryGetFallbackToolcacheVersion = tryGetFallbackToolcacheVersion;
async function downloadCodeQL(codeqlURL, maybeBundleVersion, maybeCliVersion, apiDetails, variant, tempDir, logger) {
    const parsedCodeQLURL = new URL(codeqlURL);
    const searchParams = new URLSearchParams(parsedCodeQLURL.search);
    const headers = {
        accept: "application/octet-stream",
    };
    // We only want to provide an authorization header if we are downloading
    // from the same GitHub instance the Action is running on.
    // This avoids leaking Enterprise tokens to dotcom.
    // We also don't want to send an authorization header if there's already a token provided in the URL.
    let authorization = undefined;
    if (searchParams.has("token")) {
        logger.debug("CodeQL tools URL contains an authorization token.");
    }
    else if (codeqlURL.startsWith(`${apiDetails.url}/`) ||
        (apiDetails.apiURL && codeqlURL.startsWith(`${apiDetails.apiURL}/`))) {
        logger.debug("Providing an authorization token to download CodeQL tools.");
        authorization = `token ${apiDetails.auth}`;
    }
    else {
        logger.debug("Downloading CodeQL tools without an authorization token.");
    }
    logger.info(`Downloading CodeQL tools from ${codeqlURL} . This may take a while.`);
    const dest = path.join(tempDir, (0, uuid_1.v4)());
    const finalHeaders = Object.assign({ "User-Agent": "CodeQL Action" }, headers);
    const toolsDownloadStart = perf_hooks_1.performance.now();
    const archivedBundlePath = await toolcache.downloadTool(codeqlURL, dest, authorization, finalHeaders);
    const toolsDownloadDurationMs = Math.round(perf_hooks_1.performance.now() - toolsDownloadStart);
    logger.debug(`Finished downloading CodeQL bundle to ${archivedBundlePath} (${toolsDownloadDurationMs} ms).`);
    logger.debug("Extracting CodeQL bundle.");
    const extractionStart = perf_hooks_1.performance.now();
    const extractedBundlePath = await toolcache.extractTar(archivedBundlePath);
    const extractionMs = Math.round(perf_hooks_1.performance.now() - extractionStart);
    logger.debug(`Finished extracting CodeQL bundle to ${extractedBundlePath} (${extractionMs} ms).`);
    await cleanUpGlob(archivedBundlePath, "CodeQL bundle archive", logger);
    const bundleVersion = maybeBundleVersion ?? tryGetBundleVersionFromUrl(codeqlURL, logger);
    if (bundleVersion === undefined) {
        logger.debug("Could not cache CodeQL tools because we could not determine the bundle version from the " +
            `URL ${codeqlURL}.`);
        return {
            toolsVersion: maybeCliVersion ?? "unknown",
            codeqlFolder: extractedBundlePath,
            toolsDownloadDurationMs,
        };
    }
    // Try to compute the CLI version for this bundle
    if (maybeCliVersion === undefined &&
        variant === util.GitHubVariant.DOTCOM &&
        codeqlURL.includes(`/${exports.CODEQL_DEFAULT_ACTION_REPOSITORY}/`)) {
        maybeCliVersion = await tryFindCliVersionDotcomOnly(`codeql-bundle-${bundleVersion}`, logger);
    }
    logger.debug("Caching CodeQL bundle.");
    const toolcacheVersion = getCanonicalToolcacheVersion(maybeCliVersion, bundleVersion, logger);
    const toolcachedBundlePath = await toolcache.cacheDir(extractedBundlePath, "CodeQL", toolcacheVersion);
    // Defensive check: we expect `cacheDir` to copy the bundle to a new location.
    if (toolcachedBundlePath !== extractedBundlePath) {
        await cleanUpGlob(extractedBundlePath, "CodeQL bundle from temporary directory", logger);
    }
    return {
        toolsVersion: maybeCliVersion ?? toolcacheVersion,
        codeqlFolder: toolcachedBundlePath,
        toolsDownloadDurationMs,
    };
}
exports.downloadCodeQL = downloadCodeQL;
function getCodeQLURLVersion(url) {
    const match = url.match(/\/codeql-bundle-(.*)\//);
    if (match === null || match.length < 2) {
        throw new util.ConfigurationError(`Malformed tools url: ${url}. Version could not be inferred`);
    }
    return match[1];
}
exports.getCodeQLURLVersion = getCodeQLURLVersion;
/**
 * Returns the toolcache version number to use to store the bundle with the associated CLI version
 * and bundle version.
 *
 * This is the canonical version number, since toolcaches populated by different versions of the
 * CodeQL Action or different runner image creation scripts may store the bundle using a different
 * version number. Functions like `getCodeQLSource` that fetch the bundle from rather than save the
 * bundle to the toolcache should handle these different version numbers.
 */
function getCanonicalToolcacheVersion(cliVersion, bundleVersion, logger) {
    // If the CLI version is a pre-release or contains build metadata, then cache the
    // bundle as `0.0.0-<bundleVersion>` to avoid the bundle being interpreted as containing a stable
    // CLI release. In principle, it should be enough to just check that the CLI version isn't a
    // pre-release, but the version numbers of CodeQL nightlies have the format `x.y.z+<timestamp>`,
    // and we don't want these nightlies to override stable CLI versions in the toolcache.
    if (!cliVersion?.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
        return convertToSemVer(bundleVersion, logger);
    }
    // If the bundle is semantically versioned, it can be looked up based on just the CLI version
    // number, so version it in the toolcache using just the CLI version number.
    if (semver.gte(cliVersion, feature_flags_1.CODEQL_VERSION_BUNDLE_SEMANTICALLY_VERSIONED)) {
        return cliVersion;
    }
    // Include both the CLI version and the bundle version in the toolcache version number. That way
    // we can find the bundle in the toolcache based on either the CLI version or the bundle version.
    return `${cliVersion}-${bundleVersion}`;
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
async function setupCodeQLBundle(toolsInput, apiDetails, tempDir, variant, defaultCliVersion, logger) {
    const source = await getCodeQLSource(toolsInput, defaultCliVersion, apiDetails, variant, logger);
    logger.info("Using CodeQL CLI version: " + source.toolsVersion + " from " + source.sourceType);
    let codeqlFolder;
    let toolsVersion = source.toolsVersion;
    let toolsDownloadDurationMs;
    let toolsSource;
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
            const result = await downloadCodeQL(source.codeqlURL, source.bundleVersion, source.cliVersion, apiDetails, variant, tempDir, logger);
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
exports.setupCodeQLBundle = setupCodeQLBundle;
async function cleanUpGlob(glob, name, logger) {
    logger.debug(`Cleaning up ${name}.`);
    try {
        const deletedPaths = await (0, del_1.default)(glob, { force: true });
        if (deletedPaths.length === 0) {
            logger.warning(`Failed to clean up ${name}: no files found matching ${glob}.`);
        }
        else if (deletedPaths.length === 1) {
            logger.debug(`Cleaned up ${name}.`);
        }
        else {
            logger.debug(`Cleaned up ${name} (${deletedPaths.length} files).`);
        }
    }
    catch (e) {
        logger.warning(`Failed to clean up ${name}: ${e}.`);
    }
}
//# sourceMappingURL=setup-codeql.js.map