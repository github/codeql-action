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
exports.parseMatrixInput = exports.shouldBypassToolcache = exports.isHostedRunner = exports.checkForTimeout = exports.withTimeout = exports.tryGetFolderBytes = exports.listFolder = exports.doesDirectoryExist = exports.logCodeScanningConfigInCli = exports.useCodeScanningConfigInCli = exports.isInTestMode = exports.checkActionVersion = exports.getMlPoweredJsQueriesStatus = exports.getMlPoweredJsQueriesPack = exports.ML_POWERED_JS_QUERIES_PACK_NAME = exports.isGoodVersion = exports.delay = exports.bundleDb = exports.codeQlVersionAbove = exports.getCachedCodeQlVersion = exports.cacheCodeQlVersion = exports.isHTTPError = exports.UserError = exports.HTTPError = exports.getRequiredEnvParam = exports.enrichEnvironment = exports.initializeEnvironment = exports.EnvVar = exports.assertNever = exports.apiVersionInRange = exports.DisallowedAPIVersionReason = exports.checkGitHubVersionInRange = exports.getGitHubVersion = exports.GitHubVariant = exports.parseGitHubUrl = exports.getCodeQLDatabasePath = exports.getThreadsFlag = exports.getThreadsFlagValue = exports.getAddSnippetsFlag = exports.getMemoryFlag = exports.getMemoryFlagValue = exports.withTmpDir = exports.getToolNames = exports.getExtraOptionsEnvParam = exports.DID_AUTOBUILD_GO_ENV_VAR_NAME = exports.DEFAULT_DEBUG_DATABASE_NAME = exports.DEFAULT_DEBUG_ARTIFACT_NAME = exports.GITHUB_DOTCOM_URL = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const util_1 = require("util");
const core = __importStar(require("@actions/core"));
const del_1 = __importDefault(require("del"));
const get_folder_size_1 = __importDefault(require("get-folder-size"));
const semver = __importStar(require("semver"));
const api_client_1 = require("./api-client");
const apiCompatibility = __importStar(require("./api-compatibility.json"));
const codeql_1 = require("./codeql");
const config_utils_1 = require("./config-utils");
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
const shared_environment_1 = require("./shared-environment");
/**
 * Specifies bundle versions that are known to be broken
 * and will not be used if found in the toolcache.
 */
const BROKEN_VERSIONS = ["0.0.0-20211207"];
/**
 * The URL for github.com.
 */
exports.GITHUB_DOTCOM_URL = "https://github.com";
/**
 * Default name of the debugging artifact.
 */
exports.DEFAULT_DEBUG_ARTIFACT_NAME = "debug-artifacts";
/**
 * Default name of the database in the debugging artifact.
 */
exports.DEFAULT_DEBUG_DATABASE_NAME = "db";
/**
 * Environment variable that is set to "true" when the CodeQL Action has invoked
 * the Go autobuilder.
 */
exports.DID_AUTOBUILD_GO_ENV_VAR_NAME = "CODEQL_ACTION_DID_AUTOBUILD_GOLANG";
/**
 * Get the extra options for the codeql commands.
 */
function getExtraOptionsEnvParam() {
    const varName = "CODEQL_ACTION_EXTRA_OPTIONS";
    const raw = process.env[varName];
    if (raw === undefined || raw.length === 0) {
        return {};
    }
    try {
        return JSON.parse(raw);
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(`${varName} environment variable is set, but does not contain valid JSON: ${message}`);
    }
}
exports.getExtraOptionsEnvParam = getExtraOptionsEnvParam;
/**
 * Get the array of all the tool names contained in the given sarif contents.
 *
 * Returns an array of unique string tool names.
 */
function getToolNames(sarif) {
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
exports.getToolNames = getToolNames;
// Creates a random temporary directory, runs the given body, and then deletes the directory.
// Mostly intended for use within tests.
async function withTmpDir(body) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeql-action-"));
    const result = await body(tmpDir);
    await (0, del_1.default)(tmpDir, { force: true });
    return result;
}
exports.withTmpDir = withTmpDir;
/**
 * Gets an OS-specific amount of memory (in MB) to reserve for OS processes
 * when the user doesn't explicitly specify a memory setting.
 * This is a heuristic to avoid OOM errors (exit code 137 / SIGKILL)
 * from committing too much of the available memory to CodeQL.
 * @returns number
 */
function getSystemReservedMemoryMegaBytes() {
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
function getMemoryFlagValue(userInput) {
    let memoryToUseMegaBytes;
    if (userInput) {
        memoryToUseMegaBytes = Number(userInput);
        if (Number.isNaN(memoryToUseMegaBytes) || memoryToUseMegaBytes <= 0) {
            throw new Error(`Invalid RAM setting "${userInput}", specified.`);
        }
    }
    else {
        const totalMemoryBytes = os.totalmem();
        const totalMemoryMegaBytes = totalMemoryBytes / (1024 * 1024);
        const reservedMemoryMegaBytes = getSystemReservedMemoryMegaBytes();
        memoryToUseMegaBytes = totalMemoryMegaBytes - reservedMemoryMegaBytes;
    }
    return Math.floor(memoryToUseMegaBytes);
}
exports.getMemoryFlagValue = getMemoryFlagValue;
/**
 * Get the codeql `--ram` flag as configured by the `ram` input. If no value was
 * specified, the total available memory will be used minus a threshold
 * reserved for the OS.
 *
 * @returns string
 */
function getMemoryFlag(userInput) {
    return `--ram=${getMemoryFlagValue(userInput)}`;
}
exports.getMemoryFlag = getMemoryFlag;
/**
 * Get the codeql flag to specify whether to add code snippets to the sarif file.
 *
 * @returns string
 */
function getAddSnippetsFlag(userInput) {
    if (typeof userInput === "string") {
        // have to process specifically because any non-empty string is truthy
        userInput = userInput.toLowerCase() === "true";
    }
    return userInput ? "--sarif-add-snippets" : "--no-sarif-add-snippets";
}
exports.getAddSnippetsFlag = getAddSnippetsFlag;
/**
 * Get the value of the codeql `--threads` flag specified for the `threads`
 * input. If no value was specified, all available threads will be used.
 *
 * The value will be capped to the number of available CPUs.
 *
 * @returns {number}
 */
function getThreadsFlagValue(userInput, logger) {
    let numThreads;
    const maxThreads = os.cpus().length;
    if (userInput) {
        numThreads = Number(userInput);
        if (Number.isNaN(numThreads)) {
            throw new Error(`Invalid threads setting "${userInput}", specified.`);
        }
        if (numThreads > maxThreads) {
            logger.info(`Clamping desired number of threads (${numThreads}) to max available (${maxThreads}).`);
            numThreads = maxThreads;
        }
        const minThreads = -maxThreads;
        if (numThreads < minThreads) {
            logger.info(`Clamping desired number of free threads (${numThreads}) to max available (${minThreads}).`);
            numThreads = minThreads;
        }
    }
    else {
        // Default to using all threads
        numThreads = maxThreads;
    }
    return numThreads;
}
exports.getThreadsFlagValue = getThreadsFlagValue;
/**
 * Get the codeql `--threads` flag specified for the `threads` input.
 * If no value was specified, all available threads will be used.
 *
 * The value will be capped to the number of available CPUs.
 *
 * @returns string
 */
function getThreadsFlag(userInput, logger) {
    return `--threads=${getThreadsFlagValue(userInput, logger)}`;
}
exports.getThreadsFlag = getThreadsFlag;
/**
 * Get the path where the CodeQL database for the given language lives.
 */
function getCodeQLDatabasePath(config, language) {
    return path.resolve(config.dbLocation, language);
}
exports.getCodeQLDatabasePath = getCodeQLDatabasePath;
/**
 * Parses user input of a github.com or GHES URL to a canonical form.
 * Removes any API prefix or suffix if one is present.
 */
function parseGitHubUrl(inputUrl) {
    const originalUrl = inputUrl;
    if (inputUrl.indexOf("://") === -1) {
        inputUrl = `https://${inputUrl}`;
    }
    if (!inputUrl.startsWith("http://") && !inputUrl.startsWith("https://")) {
        throw new Error(`"${originalUrl}" is not a http or https URL`);
    }
    let url;
    try {
        url = new URL(inputUrl);
    }
    catch (e) {
        throw new Error(`"${originalUrl}" is not a valid URL`);
    }
    // If we detect this is trying to be to github.com
    // then return with a fixed canonical URL.
    if (url.hostname === "github.com" || url.hostname === "api.github.com") {
        return exports.GITHUB_DOTCOM_URL;
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
exports.parseGitHubUrl = parseGitHubUrl;
const GITHUB_ENTERPRISE_VERSION_HEADER = "x-github-enterprise-version";
const CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR = "CODEQL_ACTION_WARNED_ABOUT_VERSION";
let hasBeenWarnedAboutVersion = false;
var GitHubVariant;
(function (GitHubVariant) {
    GitHubVariant[GitHubVariant["DOTCOM"] = 0] = "DOTCOM";
    GitHubVariant[GitHubVariant["GHES"] = 1] = "GHES";
    GitHubVariant[GitHubVariant["GHAE"] = 2] = "GHAE";
})(GitHubVariant = exports.GitHubVariant || (exports.GitHubVariant = {}));
async function getGitHubVersion(apiDetails) {
    // We can avoid making an API request in the standard dotcom case
    if (parseGitHubUrl(apiDetails.url) === exports.GITHUB_DOTCOM_URL) {
        return { type: GitHubVariant.DOTCOM };
    }
    // Doesn't strictly have to be the meta endpoint as we're only
    // using the response headers which are available on every request.
    const apiClient = (0, api_client_1.getApiClient)();
    const response = await apiClient.meta.get();
    // This happens on dotcom, although we expect to have already returned in that
    // case. This can also serve as a fallback in cases we haven't foreseen.
    if (response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === undefined) {
        return { type: GitHubVariant.DOTCOM };
    }
    if (response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === "GitHub AE") {
        return { type: GitHubVariant.GHAE };
    }
    const version = response.headers[GITHUB_ENTERPRISE_VERSION_HEADER];
    return { type: GitHubVariant.GHES, version };
}
exports.getGitHubVersion = getGitHubVersion;
function checkGitHubVersionInRange(version, logger) {
    if (hasBeenWarnedAboutVersion || version.type !== GitHubVariant.GHES) {
        return;
    }
    const disallowedAPIVersionReason = apiVersionInRange(version.version, apiCompatibility.minimumVersion, apiCompatibility.maximumVersion);
    if (disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_OLD) {
        logger.warning(`The CodeQL Action version you are using is too old to be compatible with GitHub Enterprise ${version.version}. If you experience issues, please upgrade to a more recent version of the CodeQL Action.`);
    }
    if (disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_NEW) {
        logger.warning(`GitHub Enterprise ${version.version} is too old to be compatible with this version of the CodeQL Action. If you experience issues, please upgrade to a more recent version of GitHub Enterprise or use an older version of the CodeQL Action.`);
    }
    hasBeenWarnedAboutVersion = true;
    core.exportVariable(CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR, true);
}
exports.checkGitHubVersionInRange = checkGitHubVersionInRange;
var DisallowedAPIVersionReason;
(function (DisallowedAPIVersionReason) {
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_OLD"] = 0] = "ACTION_TOO_OLD";
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_NEW"] = 1] = "ACTION_TOO_NEW";
})(DisallowedAPIVersionReason = exports.DisallowedAPIVersionReason || (exports.DisallowedAPIVersionReason = {}));
function apiVersionInRange(version, minimumVersion, maximumVersion) {
    if (!semver.satisfies(version, `>=${minimumVersion}`)) {
        return DisallowedAPIVersionReason.ACTION_TOO_NEW;
    }
    if (!semver.satisfies(version, `<=${maximumVersion}`)) {
        return DisallowedAPIVersionReason.ACTION_TOO_OLD;
    }
    return undefined;
}
exports.apiVersionInRange = apiVersionInRange;
/**
 * This error is used to indicate a runtime failure of an exhaustivity check enforced at compile time.
 */
class ExhaustivityCheckingError extends Error {
    constructor(expectedExhaustiveValue) {
        super("Internal error: exhaustivity checking failure");
        this.expectedExhaustiveValue = expectedExhaustiveValue;
    }
}
/**
 * Used to perform compile-time exhaustivity checking on a value.  This function will not be executed at runtime unless
 * the type system has been subverted.
 */
function assertNever(value) {
    throw new ExhaustivityCheckingError(value);
}
exports.assertNever = assertNever;
/**
 * Environment variables to be set by codeql-action and used by the
 * CLI.
 */
var EnvVar;
(function (EnvVar) {
    /**
     * Semver of the codeql-action as specified in package.json.
     */
    EnvVar["VERSION"] = "CODEQL_ACTION_VERSION";
    /**
     * If set to a truthy value, then the codeql-action might combine SARIF
     * output from several `interpret-results` runs for the same Language.
     */
    EnvVar["FEATURE_SARIF_COMBINE"] = "CODEQL_ACTION_FEATURE_SARIF_COMBINE";
    /**
     * If set to the "true" string, then the codeql-action will upload SARIF,
     * not the cli.
     */
    EnvVar["FEATURE_WILL_UPLOAD"] = "CODEQL_ACTION_FEATURE_WILL_UPLOAD";
    /**
     * If set to the "true" string, then the codeql-action is using its
     * own deprecated and non-standard way of scanning for multiple
     * languages.
     */
    EnvVar["FEATURE_MULTI_LANGUAGE"] = "CODEQL_ACTION_FEATURE_MULTI_LANGUAGE";
    /**
     * If set to the "true" string, then the codeql-action is using its
     * own sandwiched workflow mechanism
     */
    EnvVar["FEATURE_SANDWICH"] = "CODEQL_ACTION_FEATURE_SANDWICH";
})(EnvVar = exports.EnvVar || (exports.EnvVar = {}));
/**
 * Set some initial environment variables that we can set even without
 * knowing what version of CodeQL we're running.
 */
function initializeEnvironment(version) {
    core.exportVariable(EnvVar.VERSION, version);
    core.exportVariable(EnvVar.FEATURE_SARIF_COMBINE, "true");
    core.exportVariable(EnvVar.FEATURE_WILL_UPLOAD, "true");
}
exports.initializeEnvironment = initializeEnvironment;
/**
 * Enrich the environment variables with further flags that we cannot
 * know the value of until we know what version of CodeQL we're running.
 */
async function enrichEnvironment(codeql) {
    if (await codeQlVersionAbove(codeql, codeql_1.CODEQL_VERSION_NEW_TRACING)) {
        core.exportVariable(EnvVar.FEATURE_MULTI_LANGUAGE, "false");
        core.exportVariable(EnvVar.FEATURE_SANDWICH, "false");
    }
    else {
        core.exportVariable(EnvVar.FEATURE_MULTI_LANGUAGE, "true");
        core.exportVariable(EnvVar.FEATURE_SANDWICH, "true");
    }
}
exports.enrichEnvironment = enrichEnvironment;
/**
 * Get an environment parameter, but throw an error if it is not set.
 */
function getRequiredEnvParam(paramName) {
    const value = process.env[paramName];
    if (value === undefined || value.length === 0) {
        throw new Error(`${paramName} environment variable must be set`);
    }
    return value;
}
exports.getRequiredEnvParam = getRequiredEnvParam;
class HTTPError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
exports.HTTPError = HTTPError;
/**
 * An Error class that indicates an error that occurred due to
 * a misconfiguration of the action or the CodeQL CLI.
 */
class UserError extends Error {
    constructor(message) {
        super(message);
    }
}
exports.UserError = UserError;
function isHTTPError(arg) {
    return (arg === null || arg === void 0 ? void 0 : arg.status) !== undefined && Number.isInteger(arg.status);
}
exports.isHTTPError = isHTTPError;
let cachedCodeQlVersion = undefined;
function cacheCodeQlVersion(version) {
    if (cachedCodeQlVersion !== undefined) {
        throw new Error("cacheCodeQlVersion() should be called only once");
    }
    cachedCodeQlVersion = version;
}
exports.cacheCodeQlVersion = cacheCodeQlVersion;
function getCachedCodeQlVersion() {
    return cachedCodeQlVersion;
}
exports.getCachedCodeQlVersion = getCachedCodeQlVersion;
async function codeQlVersionAbove(codeql, requiredVersion) {
    return semver.gte(await codeql.getVersion(), requiredVersion);
}
exports.codeQlVersionAbove = codeQlVersionAbove;
// Create a bundle for the given DB, if it doesn't already exist
async function bundleDb(config, language, codeql, dbName) {
    const databasePath = getCodeQLDatabasePath(config, language);
    const databaseBundlePath = path.resolve(config.dbLocation, `${dbName}.zip`);
    // For a tiny bit of added safety, delete the file if it exists.
    // The file is probably from an earlier call to this function, either
    // as part of this action step or a previous one, but it could also be
    // from somewhere else or someone trying to make the action upload a
    // non-database file.
    if (fs.existsSync(databaseBundlePath)) {
        await (0, del_1.default)(databaseBundlePath, { force: true });
    }
    await codeql.databaseBundle(databasePath, databaseBundlePath, dbName);
    return databaseBundlePath;
}
exports.bundleDb = bundleDb;
async function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
exports.delay = delay;
function isGoodVersion(versionSpec) {
    return !BROKEN_VERSIONS.includes(versionSpec);
}
exports.isGoodVersion = isGoodVersion;
exports.ML_POWERED_JS_QUERIES_PACK_NAME = "codeql/javascript-experimental-atm-queries";
/**
 * Gets the ML-powered JS query pack to add to the analysis if a repo is opted into the ML-powered
 * queries beta.
 */
async function getMlPoweredJsQueriesPack(codeQL) {
    let version;
    if (await codeQlVersionAbove(codeQL, "2.11.3")) {
        version = "~0.4.0";
    }
    else if (await codeQlVersionAbove(codeQL, "2.9.3")) {
        version = `~0.3.0`;
    }
    else if (await codeQlVersionAbove(codeQL, "2.8.4")) {
        version = `~0.2.0`;
    }
    else {
        version = `~0.1.0`;
    }
    return (0, config_utils_1.prettyPrintPack)({
        name: exports.ML_POWERED_JS_QUERIES_PACK_NAME,
        version,
    });
}
exports.getMlPoweredJsQueriesPack = getMlPoweredJsQueriesPack;
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
function getMlPoweredJsQueriesStatus(config) {
    const mlPoweredJsQueryPacks = (config.packs.javascript || [])
        .map((p) => (0, config_utils_1.parsePacksSpecification)(p))
        .filter((pack) => pack.name === "codeql/javascript-experimental-atm-queries" && !pack.path);
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
exports.getMlPoweredJsQueriesStatus = getMlPoweredJsQueriesStatus;
/**
 * Prompt the customer to upgrade to CodeQL Action v2, if appropriate.
 *
 * Check whether a customer is running v1. If they are, and we can determine that the GitHub
 * instance supports v2, then log an error that v1 is deprecated and prompt the customer to
 * upgrade to v2.
 */
async function checkActionVersion(version) {
    if (!semver.satisfies(version, ">=2")) {
        core.error("This version of the CodeQL Action was deprecated on January 18th, 2023, and is no longer " +
            "updated or supported. For better performance, improved security, and new features, " +
            "upgrade to v2. For more information, see " +
            "https://github.blog/changelog/2023-01-18-code-scanning-codeql-action-v1-is-now-deprecated/");
    }
}
exports.checkActionVersion = checkActionVersion;
/*
 * Returns whether we are in test mode.
 *
 * In test mode, we don't upload SARIF results or status reports to the GitHub API.
 */
function isInTestMode() {
    return process.env[shared_environment_1.CODEQL_ACTION_TEST_MODE] === "true";
}
exports.isInTestMode = isInTestMode;
/**
 * @returns true if the action should generate a conde-scanning config file
 * that gets passed to the CLI.
 */
async function useCodeScanningConfigInCli(codeql, featureEnablement) {
    return await featureEnablement.getValue(feature_flags_1.Feature.CliConfigFileEnabled, codeql);
}
exports.useCodeScanningConfigInCli = useCodeScanningConfigInCli;
async function logCodeScanningConfigInCli(codeql, featureEnablement, logger) {
    if (await useCodeScanningConfigInCli(codeql, featureEnablement)) {
        logger.info("Code Scanning configuration file being processed in the codeql CLI.");
    }
    else {
        logger.info("Code Scanning configuration file being processed in the codeql-action.");
    }
}
exports.logCodeScanningConfigInCli = logCodeScanningConfigInCli;
/*
 * Returns whether the path in the argument represents an existing directory.
 */
function doesDirectoryExist(dirPath) {
    try {
        const stats = fs.lstatSync(dirPath);
        return stats.isDirectory();
    }
    catch (e) {
        return false;
    }
}
exports.doesDirectoryExist = doesDirectoryExist;
/**
 * Returns a recursive list of files in a given directory.
 */
function listFolder(dir) {
    if (!doesDirectoryExist(dir)) {
        return [];
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
        if (entry.isFile()) {
            files.push(path.resolve(dir, entry.name));
        }
        else if (entry.isDirectory()) {
            files = files.concat(listFolder(path.resolve(dir, entry.name)));
        }
    }
    return files;
}
exports.listFolder = listFolder;
/**
 * Get the size a folder in bytes. This will log any filesystem errors
 * as a warning and then return undefined.
 *
 * @param cacheDir A directory to get the size of.
 * @param logger A logger to log any errors to.
 * @returns The size in bytes of the folder, or undefined if errors occurred.
 */
async function tryGetFolderBytes(cacheDir, logger) {
    try {
        return await (0, util_1.promisify)(get_folder_size_1.default)(cacheDir);
    }
    catch (e) {
        logger.warning(`Encountered an error while getting size of folder: ${e}`);
        return undefined;
    }
}
exports.tryGetFolderBytes = tryGetFolderBytes;
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
async function withTimeout(timeoutMs, promise, onTimeout) {
    let finished = false;
    const mainTask = async () => {
        const result = await promise;
        finished = true;
        return result;
    };
    const timeout = new Promise((resolve) => {
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
exports.withTimeout = withTimeout;
/**
 * Check if the global hadTimeout variable has been set, and if so then
 * exit the process to ensure any background tasks that are still running
 * are killed. This should be called at the end of execution if the
 * `withTimeout` function has been used.
 */
async function checkForTimeout() {
    if (hadTimeout === true) {
        core.info("A timeout occurred, force exiting the process after 30 seconds to prevent hanging.");
        await delay(30000);
        process.exit();
    }
}
exports.checkForTimeout = checkForTimeout;
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
function isHostedRunner() {
    var _a, _b, _c;
    return (
    // Name of the runner on hosted Windows runners
    ((_a = process.env["RUNNER_NAME"]) === null || _a === void 0 ? void 0 : _a.includes("Hosted Agent")) ||
        (
        // Name of the runner on hosted POSIX runners
        (_b = process.env["RUNNER_NAME"]) === null || _b === void 0 ? void 0 : _b.includes("GitHub Actions")) ||
        (
        // Segment of the path to the tool cache on all hosted runners
        (_c = process.env["RUNNER_TOOL_CACHE"]) === null || _c === void 0 ? void 0 : _c.includes("hostedtoolcache")));
}
exports.isHostedRunner = isHostedRunner;
/**
 *
 * @param featuresEnablement The features enabled for the current run
 * @param languagesInput Languages input from the workflow
 * @param repository The owner/name of the repository
 * @param logger A logger
 * @returns A boolean indicating whether or not the toolcache should be bypassed and the latest codeql should be downloaded.
 */
async function shouldBypassToolcache(featuresEnablement, codeqlUrl, languagesInput, repository, logger) {
    // An explicit codeql url is specified, that means the toolcache will not be used.
    if (codeqlUrl) {
        return true;
    }
    // Check if the toolcache is disabled for all languages
    if (await featuresEnablement.getValue(feature_flags_1.Feature.BypassToolcacheEnabled)) {
        return true;
    }
    // Check if the toolcache is disabled for kotlin and swift.
    if (!(await featuresEnablement.getValue(feature_flags_1.Feature.BypassToolcacheKotlinSwiftEnabled))) {
        return false;
    }
    // Now check to see if kotlin or swift is one of the languages being analyzed.
    const { rawLanguages, autodetected } = await (0, config_utils_1.getRawLanguages)(languagesInput, repository, logger);
    let bypass = rawLanguages.some((lang) => languages_1.KOTLIN_SWIFT_BYPASS.includes(lang));
    if (bypass) {
        logger.info(`Bypassing toolcache for kotlin or swift. Languages: ${rawLanguages}`);
    }
    else if (!autodetected && rawLanguages.includes(languages_1.Language.java)) {
        // special case: java was explicitly specified, but there might be
        // some kotlin in the repository, so we need to make a request for that.
        const langsInRepo = await (0, config_utils_1.getLanguagesInRepo)(repository, logger);
        if (langsInRepo.includes("kotlin")) {
            logger.info(`Bypassing toolcache for kotlin.`);
            bypass = true;
        }
    }
    return bypass;
}
exports.shouldBypassToolcache = shouldBypassToolcache;
function parseMatrixInput(matrixInput) {
    if (matrixInput === undefined || matrixInput === "null") {
        return undefined;
    }
    return JSON.parse(matrixInput);
}
exports.parseMatrixInput = parseMatrixInput;
//# sourceMappingURL=util.js.map