"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
exports.setupCodeQLBundle = exports.getCodeQLURLVersion = exports.downloadCodeQL = exports.getCodeQLSource = exports.convertToSemVer = exports.getBundleVersionFromUrl = exports.tryFindCliVersionDotcomOnly = exports.findCodeQLBundleTagDotcomOnly = exports.getCodeQLActionRepository = exports.CODEQL_DEFAULT_ACTION_REPOSITORY = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const toolcache = __importStar(require("@actions/tool-cache"));
const fast_deep_equal_1 = __importDefault(require("fast-deep-equal"));
const semver = __importStar(require("semver"));
const uuid_1 = require("uuid");
const actions_util_1 = require("./actions-util");
const api = __importStar(require("./api-client"));
// Note: defaults.json is referenced from the CodeQL Action sync tool and the Actions runner image
// creation scripts. Ensure that any changes to the format of this file are compatible with both of
// these dependents.
const defaults = __importStar(require("./defaults.json"));
const util = __importStar(require("./util"));
const util_1 = require("./util");
exports.CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";
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
async function getCodeQLBundleReleasesDotcomOnly(logger) {
    logger.debug(`Fetching CodeQL CLI version and CodeQL bundle tag name information for releases of the CodeQL tools.`);
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
function tryGetCodeQLCliVersionForRelease(release, logger) {
    const cliVersionsFromMarkerFiles = release.assets
        .map((asset) => { var _a; return (_a = asset.name.match(/cli-version-(.*)\.txt/)) === null || _a === void 0 ? void 0 : _a[1]; })
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
async function findCodeQLBundleTagDotcomOnly(cliVersion, logger) {
    const filtered = (await getCodeQLBundleReleasesDotcomOnly(logger)).filter((release) => release.cliVersion === cliVersion);
    if (filtered.length === 0) {
        throw new Error(`Failed to find a release of the CodeQL tools that contains CodeQL CLI ${cliVersion}.`);
    }
    else if (filtered.length > 1) {
        throw new Error(`Found multiple releases of the CodeQL tools that contain CodeQL CLI ${cliVersion}. ` +
            `Only one such release should exist.`);
    }
    return filtered[0].tagName;
}
exports.findCodeQLBundleTagDotcomOnly = findCodeQLBundleTagDotcomOnly;
async function tryFindCliVersionDotcomOnly(tagName, logger) {
    try {
        logger.debug(`Fetching the GitHub Release for the CodeQL bundle tagged ${tagName}.`);
        const apiClient = api.getApiClient();
        const codeQLActionRepository = getCodeQLActionRepository(logger);
        const release = await apiClient.repos.getReleaseByTag({
            owner: codeQLActionRepository.split("/")[0],
            repo: codeQLActionRepository.split("/")[1],
            tag: tagName,
        });
        return tryGetCodeQLCliVersionForRelease(release.data, logger);
    }
    catch (e) {
        logger.debug(`Failed to find the CLI version for the CodeQL bundle tagged ${tagName}. ${e instanceof Error ? e.message : e}`);
        return undefined;
    }
}
exports.tryFindCliVersionDotcomOnly = tryFindCliVersionDotcomOnly;
async function getCodeQLBundleDownloadURL(tagName, apiDetails, variant, logger) {
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
                    .request("GET /enterprise/code-scanning/codeql-bundle/download/{asset_id}", { asset_id: assetID });
                const downloadURL = download.data.url;
                logger.info(`Found CodeQL bundle at GitHub AE endpoint with URL ${downloadURL}.`);
                return downloadURL;
            }
            else {
                logger.info(`Attempted to fetch bundle from GitHub AE endpoint but the bundle ${codeQLBundleName} was not found in the assets ${JSON.stringify(release.data.assets)}.`);
            }
        }
        catch (e) {
            logger.info(`Attempted to fetch bundle from GitHub AE endpoint but got error ${e}.`);
        }
    }
    for (const downloadSource of uniqueDownloadSources) {
        const [apiURL, repository] = downloadSource;
        // If we've reached the final case, short-circuit the API check since we know the bundle exists and is public.
        if (apiURL === util.GITHUB_DOTCOM_URL &&
            repository === exports.CODEQL_DEFAULT_ACTION_REPOSITORY) {
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
function getBundleVersionFromUrl(url) {
    const match = url.match(/\/codeql-bundle-(.*)\//);
    if (match === null || match.length < 2) {
        throw new Error(`Malformed tools url: ${url}. Bundle version could not be inferred`);
    }
    return match[1];
}
exports.getBundleVersionFromUrl = getBundleVersionFromUrl;
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
async function getOrFindBundleTagName(version, logger) {
    if (version.variant === util.GitHubVariant.DOTCOM) {
        return await findCodeQLBundleTagDotcomOnly(version.cliVersion, logger);
    }
    else {
        return version.tagName;
    }
}
/**
 * Look for a version of the CodeQL tools in the cache which could override the requested CLI version.
 */
async function findOverridingToolsInCache(requestedCliVersion, logger) {
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
        logger.debug(`CodeQL tools version ${candidate.version} in toolcache overriding version ${requestedCliVersion}.`);
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
async function getCodeQLSource(toolsInput, bypassToolcache, defaultCliVersion, apiDetails, variant, logger) {
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
        logger.debug(`Forcing the latest version of the CodeQL tools since ${forceLatestReason}.`);
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
                syntheticCliVersion: defaults.cliVersion,
                tagName: defaults.bundleVersion,
                variant,
            }
        : toolsInput !== undefined
            ? // case 2
                {
                    syntheticCliVersion: convertToSemVer(getBundleVersionFromUrl(toolsInput), logger),
                    tagName: `codeql-bundle-${getBundleVersionFromUrl(toolsInput)}`,
                    url: toolsInput,
                    variant,
                }
            : // case 3
                {
                    ...defaultCliVersion,
                    syntheticCliVersion: defaultCliVersion.cliVersion,
                };
    // If we find the specified version, we always use that.
    let codeqlFolder = toolcache.find("CodeQL", requestedVersion.syntheticCliVersion);
    let tagName = requestedVersion["tagName"];
    if (!codeqlFolder) {
        logger.debug("Didn't find a version of the CodeQL tools in the toolcache with a version number " +
            `exactly matching ${requestedVersion.syntheticCliVersion}.`);
        if (requestedVersion.cliVersion) {
            const allVersions = toolcache.findAllVersions("CodeQL");
            logger.debug(`Found the following versions of the CodeQL tools in the toolcache: ${JSON.stringify(allVersions)}.`);
            // If there is exactly one version of the CodeQL tools in the toolcache, and that version is
            // the form `x.y.z-<tagName>`, then use it.
            const candidateVersions = allVersions.filter((version) => version.startsWith(`${requestedVersion.cliVersion}-`));
            if (candidateVersions.length === 1) {
                logger.debug("Exactly one candidate version found, using that.");
                codeqlFolder = toolcache.find("CodeQL", candidateVersions[0]);
            }
            else {
                logger.debug("Did not find exactly one version of the CodeQL tools starting with the requested version.");
            }
        }
    }
    if (!codeqlFolder && requestedVersion.cliVersion) {
        // Fall back to accepting a `0.0.0-<tagName>` version if we didn't find the
        // `x.y.z` version. This is to support old versions of the toolcache.
        //
        // If we are on Dotcom, we will make an HTTP request to the Releases API here
        // to find the tag name for the requested version.
        tagName =
            tagName || (await getOrFindBundleTagName(requestedVersion, logger));
        const fallbackVersion = convertToSemVer(tagName, logger);
        logger.debug(`Computed a fallback toolcache version number of ${fallbackVersion} for CodeQL tools version ` +
            `${requestedVersion.cliVersion}.`);
        codeqlFolder = toolcache.find("CodeQL", fallbackVersion);
    }
    if (codeqlFolder) {
        return {
            codeqlFolder,
            sourceType: "toolcache",
            toolsVersion: requestedVersion.syntheticCliVersion,
        };
    }
    logger.debug(`Did not find CodeQL tools version ${requestedVersion.syntheticCliVersion} in the toolcache.`);
    // If we don't find the requested version on Enterprise, we may allow a
    // different version to save download time if the version hasn't been
    // specified explicitly (in which case we always honor it).
    if (variant !== util.GitHubVariant.DOTCOM && !forceLatest && !toolsInput) {
        const result = await findOverridingToolsInCache(requestedVersion.syntheticCliVersion, logger);
        if (result !== undefined) {
            return result;
        }
    }
    return {
        cliVersion: requestedVersion.cliVersion || undefined,
        codeqlURL: requestedVersion["url"] ||
            (await getCodeQLBundleDownloadURL(tagName ||
                // The check on `requestedVersion.tagName` is redundant but lets us
                // use the property that if we don't know `requestedVersion.tagName`,
                // then we must know `requestedVersion.cliVersion`. This property is
                // required by the type of `getOrFindBundleTagName`.
                (requestedVersion.tagName !== undefined
                    ? requestedVersion.tagName
                    : await getOrFindBundleTagName(requestedVersion, logger)), apiDetails, variant, logger)),
        sourceType: "download",
        toolsVersion: requestedVersion.syntheticCliVersion,
    };
}
exports.getCodeQLSource = getCodeQLSource;
async function downloadCodeQL(codeqlURL, maybeCliVersion, apiDetails, variant, tempDir, logger) {
    const parsedCodeQLURL = new URL(codeqlURL);
    const searchParams = new URLSearchParams(parsedCodeQLURL.search);
    const headers = {
        accept: "application/octet-stream",
    };
    // We only want to provide an authorization header if we are downloading
    // from the same GitHub instance the Action is running on.
    // This avoids leaking Enterprise tokens to dotcom.
    // We also don't want to send an authorization header if there's already a token provided in the URL.
    if (searchParams.has("token")) {
        logger.debug("CodeQL tools URL contains an authorization token.");
    }
    else if (codeqlURL.startsWith(`${apiDetails.url}/`)) {
        logger.debug("Providing an authorization token to download CodeQL tools.");
        headers.authorization = `token ${apiDetails.auth}`;
    }
    else {
        logger.debug("Downloading CodeQL tools without an authorization token.");
    }
    logger.info(`Downloading CodeQL tools from ${codeqlURL}. This may take a while.`);
    const dest = path.join(tempDir, (0, uuid_1.v4)());
    const finalHeaders = Object.assign({ "User-Agent": "CodeQL Action" }, headers);
    const codeqlPath = await toolcache.downloadTool(codeqlURL, dest, undefined, finalHeaders);
    logger.debug(`CodeQL bundle download to ${codeqlPath} complete.`);
    const codeqlExtracted = await toolcache.extractTar(codeqlPath);
    const bundleVersion = getBundleVersionFromUrl(codeqlURL);
    // Try to compute the CLI version for this bundle
    const cliVersion = maybeCliVersion ||
        (variant === util.GitHubVariant.DOTCOM &&
            (await tryFindCliVersionDotcomOnly(`codeql-bundle-${bundleVersion}`, logger))) ||
        undefined;
    // Include both the CLI version and the bundle version in the toolcache version number. That way
    // if the user requests the same URL again, we can get it from the cache without having to call
    // any of the Releases API.
    //
    // Special case: If the CLI version is a pre-release, then cache the bundle as
    // `0.0.0-<bundleVersion>` to avoid the bundle being interpreted as containing a stable CLI
    // release.
    const toolcacheVersion = cliVersion && !cliVersion.includes("-")
        ? `${cliVersion}-${bundleVersion}`
        : convertToSemVer(bundleVersion, logger);
    return {
        toolsVersion: cliVersion || toolcacheVersion,
        codeqlFolder: await toolcache.cacheDir(codeqlExtracted, "CodeQL", toolcacheVersion),
    };
}
exports.downloadCodeQL = downloadCodeQL;
function getCodeQLURLVersion(url) {
    const match = url.match(/\/codeql-bundle-(.*)\//);
    if (match === null || match.length < 2) {
        throw new Error(`Malformed tools url: ${url}. Version could not be inferred`);
    }
    return match[1];
}
exports.getCodeQLURLVersion = getCodeQLURLVersion;
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
async function setupCodeQLBundle(toolsInput, apiDetails, tempDir, variant, bypassToolcache, defaultCliVersion, logger) {
    const source = await getCodeQLSource(toolsInput, bypassToolcache, defaultCliVersion, apiDetails, variant, logger);
    let codeqlFolder;
    let toolsVersion = source.toolsVersion;
    switch (source.sourceType) {
        case "local":
            codeqlFolder = await toolcache.extractTar(source.codeqlTarPath);
            break;
        case "toolcache":
            codeqlFolder = source.codeqlFolder;
            logger.debug(`CodeQL found in cache ${codeqlFolder}`);
            break;
        case "download": {
            const result = await downloadCodeQL(source.codeqlURL, source.cliVersion, apiDetails, variant, tempDir, logger);
            toolsVersion = result.toolsVersion;
            codeqlFolder = result.codeqlFolder;
            break;
        }
        default:
            util.assertNever(source);
    }
    return { codeqlFolder, toolsVersion };
}
exports.setupCodeQLBundle = setupCodeQLBundle;
//# sourceMappingURL=setup-codeql.js.map