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
exports.convertToSemVer = exports.getCodeQLURLVersion = exports.downloadCodeQL = exports.getCodeQLSource = exports.findCodeQLBundleTagDotcomOnly = exports.getCodeQLActionRepository = exports.CODEQL_DEFAULT_ACTION_REPOSITORY = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const toolcache = __importStar(require("@actions/tool-cache"));
const fast_deep_equal_1 = __importDefault(require("fast-deep-equal"));
const semver = __importStar(require("semver"));
const uuid_1 = require("uuid");
const actions_util_1 = require("./actions-util");
const api = __importStar(require("./api-client"));
const defaults = __importStar(require("./defaults.json")); // Referenced from codeql-action-sync-tool!
const util = __importStar(require("./util"));
const util_1 = require("./util");
const CODEQL_BUNDLE_VERSION = defaults.bundleVersion;
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
async function findCodeQLBundleTagDotcomOnly(cliVersion, logger) {
    const apiClient = api.getApiClient();
    const codeQLActionRepository = getCodeQLActionRepository(logger);
    const releases = await apiClient.paginate(apiClient.repos.listReleases, {
        owner: codeQLActionRepository.split("/")[0],
        repo: codeQLActionRepository.split("/")[1],
    });
    logger.debug(`Found ${releases.length} releases.`);
    for (const release of releases) {
        const cliVersionFileVersions = release.assets
            .map((asset) => { var _a; return (_a = asset.name.match(/cli-version-(.*)\.txt/)) === null || _a === void 0 ? void 0 : _a[1]; })
            .filter((v) => v)
            .map((v) => v);
        if (cliVersionFileVersions.length === 0) {
            logger.debug(`Ignoring release ${release.tag_name} with no CLI version marker file.`);
            continue;
        }
        if (cliVersionFileVersions.length > 1) {
            logger.warning(`Ignoring release ${release.tag_name} with multiple CLI version marker files.`);
            continue;
        }
        if (cliVersionFileVersions[0] === cliVersion) {
            return release.tag_name;
        }
    }
    throw new Error(`Failed to find a CodeQL bundle release for CLI version ${cliVersion}.`);
}
exports.findCodeQLBundleTagDotcomOnly = findCodeQLBundleTagDotcomOnly;
async function getCodeQLBundleDownloadURL(apiDetails, variant, logger) {
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
                tag: CODEQL_BUNDLE_VERSION,
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
                tag: CODEQL_BUNDLE_VERSION,
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
    return `https://github.com/${exports.CODEQL_DEFAULT_ACTION_REPOSITORY}/releases/download/${CODEQL_BUNDLE_VERSION}/${codeQLBundleName}`;
}
async function getCodeQLSource(toolsInput, bypassToolcache, apiDetails, variant, logger) {
    var _a;
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
                ? "a specific version of CodeQL was not requested and the bypass toolcache feature is enabled"
                : undefined;
    const forceLatest = forceLatestReason !== undefined;
    if (forceLatest) {
        logger.debug(`Forcing the latest version of the CodeQL tools since ${forceLatestReason}.`);
    }
    const codeqlURL = forceLatest ? undefined : toolsInput;
    const requestedSemVer = convertToSemVer(getCodeQLURLVersion(codeqlURL || `/${CODEQL_BUNDLE_VERSION}/`), logger);
    // If we find the specified version, we always use that.
    const codeqlFolder = toolcache.find("CodeQL", requestedSemVer);
    if (codeqlFolder) {
        return {
            codeqlFolder,
            sourceType: "toolcache",
            toolsVersion: requestedSemVer,
        };
    }
    // If we don't find the requested version, in some cases we may allow a
    // different version to save download time if the version hasn't been
    // specified explicitly (in which case we always honor it).
    if (!codeqlURL && !forceLatest) {
        const codeqlVersions = toolcache.findAllVersions("CodeQL");
        if (codeqlVersions.length === 1 && (0, util_1.isGoodVersion)(codeqlVersions[0])) {
            const tmpCodeqlFolder = toolcache.find("CodeQL", codeqlVersions[0]);
            if (fs.existsSync(path.join(tmpCodeqlFolder, "pinned-version"))) {
                logger.debug(`CodeQL in cache overriding the default ${CODEQL_BUNDLE_VERSION}`);
                return {
                    codeqlFolder: tmpCodeqlFolder,
                    sourceType: "toolcache",
                    toolsVersion: codeqlVersions[0],
                };
            }
        }
    }
    return {
        codeqlURL: codeqlURL ||
            (await getCodeQLBundleDownloadURL(apiDetails, variant, logger)),
        semanticVersion: requestedSemVer,
        sourceType: "download",
        toolsVersion: ((_a = semver.prerelease(requestedSemVer)) === null || _a === void 0 ? void 0 : _a.join(".")) || requestedSemVer,
    };
}
exports.getCodeQLSource = getCodeQLSource;
async function downloadCodeQL(codeqlURL, semanticVersion, apiDetails, tempDir, logger) {
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
    return await toolcache.cacheDir(codeqlExtracted, "CodeQL", semanticVersion);
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
//# sourceMappingURL=setup-codeql.js.map