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
exports.useCodeScanningConfigInCli = exports.isInTestMode = exports.checkActionVersion = exports.getMlPoweredJsQueriesStatus = exports.getMlPoweredJsQueriesPack = exports.ML_POWERED_JS_QUERIES_PACK_NAME = exports.isGoodVersion = exports.delay = exports.bundleDb = exports.codeQlVersionAbove = exports.getCachedCodeQlVersion = exports.cacheCodeQlVersion = exports.isGitHubGhesVersionBelow = exports.isHTTPError = exports.UserError = exports.HTTPError = exports.getRequiredEnvParam = exports.isActions = exports.getMode = exports.enrichEnvironment = exports.initializeEnvironment = exports.Mode = exports.assertNever = exports.getGitHubAuth = exports.apiVersionInRange = exports.DisallowedAPIVersionReason = exports.checkGitHubVersionInRange = exports.getGitHubVersion = exports.GitHubVariant = exports.parseGitHubUrl = exports.getCodeQLDatabasePath = exports.getThreadsFlag = exports.getThreadsFlagValue = exports.getAddSnippetsFlag = exports.getMemoryFlag = exports.getMemoryFlagValue = exports.withTmpDir = exports.getToolNames = exports.getExtraOptionsEnvParam = exports.DEFAULT_DEBUG_DATABASE_NAME = exports.DEFAULT_DEBUG_ARTIFACT_NAME = exports.GITHUB_DOTCOM_URL = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const del_1 = __importDefault(require("del"));
const semver = __importStar(require("semver"));
const api = __importStar(require("./api-client"));
const api_client_1 = require("./api-client");
const apiCompatibility = __importStar(require("./api-compatibility.json"));
const codeql_1 = require("./codeql");
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
    const realSubdir = path.join(tmpDir, "real");
    fs.mkdirSync(realSubdir);
    const symlinkSubdir = path.join(tmpDir, "symlink");
    fs.symlinkSync(realSubdir, symlinkSubdir, "dir");
    const result = await body(symlinkSubdir);
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
    const apiClient = (0, api_client_1.getApiClient)(apiDetails);
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
function checkGitHubVersionInRange(version, logger, toolName) {
    if (hasBeenWarnedAboutVersion || version.type !== GitHubVariant.GHES) {
        return;
    }
    const disallowedAPIVersionReason = apiVersionInRange(version.version, apiCompatibility.minimumVersion, apiCompatibility.maximumVersion);
    if (disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_OLD) {
        logger.warning(`The CodeQL ${toolName} version you are using is too old to be compatible with GitHub Enterprise ${version.version}. If you experience issues, please upgrade to a more recent version of the CodeQL ${toolName}.`);
    }
    if (disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_NEW) {
        logger.warning(`GitHub Enterprise ${version.version} is too old to be compatible with this version of the CodeQL ${toolName}. If you experience issues, please upgrade to a more recent version of GitHub Enterprise or use an older version of the CodeQL ${toolName}.`);
    }
    hasBeenWarnedAboutVersion = true;
    if (isActions()) {
        core.exportVariable(CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR, true);
    }
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
 * Retrieves the github auth token for use with the runner. There are
 * three possible locations for the token:
 *
 * 1. from the cli (considered insecure)
 * 2. from stdin
 * 3. from the GITHUB_TOKEN environment variable
 *
 * If both 1 & 2 are specified, then an error is thrown.
 * If 1 & 3 or 2 & 3 are specified, then the environment variable is ignored.
 *
 * @param githubAuth a github app token or PAT
 * @param fromStdIn read the github app token or PAT from stdin up to, but excluding the first whitespace
 * @param readable the readable stream to use for getting the token (defaults to stdin)
 *
 * @return a promise resolving to the auth token.
 */
async function getGitHubAuth(logger, githubAuth, fromStdIn, readable = process.stdin) {
    if (githubAuth && fromStdIn) {
        throw new Error("Cannot specify both `--github-auth` and `--github-auth-stdin`. Please use `--github-auth-stdin`, which is more secure.");
    }
    if (githubAuth) {
        logger.warning("Using `--github-auth` via the CLI is insecure. Use `--github-auth-stdin` instead.");
        return githubAuth;
    }
    if (fromStdIn) {
        return new Promise((resolve, reject) => {
            let token = "";
            readable.on("data", (data) => {
                token += data.toString("utf8");
            });
            readable.on("end", () => {
                token = token.split(/\s+/)[0].trim();
                if (token) {
                    resolve(token);
                }
                else {
                    reject(new Error("Standard input is empty"));
                }
            });
            readable.on("error", (err) => {
                reject(err);
            });
        });
    }
    if (process.env.GITHUB_TOKEN) {
        return process.env.GITHUB_TOKEN;
    }
    throw new Error("No GitHub authentication token was specified. Please provide a token via the GITHUB_TOKEN environment variable, or by adding the `--github-auth-stdin` flag and passing the token via standard input.");
}
exports.getGitHubAuth = getGitHubAuth;
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
var Mode;
(function (Mode) {
    Mode["actions"] = "Action";
    Mode["runner"] = "Runner";
})(Mode = exports.Mode || (exports.Mode = {}));
/**
 * Environment variables to be set by codeql-action and used by the
 * CLI. These environment variables are relevant for both the runner
 * and the action.
 */
var EnvVar;
(function (EnvVar) {
    /**
     * The mode of the codeql-action, either 'actions' or 'runner'.
     */
    EnvVar["RUN_MODE"] = "CODEQL_ACTION_RUN_MODE";
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
    /**
     * If set to the "true" string and the codeql CLI version is greater than
     * `CODEQL_VERSION_CONFIG_FILES`, then the codeql-action will pass the
     * the codeql-config file to the codeql CLI to be processed there.
     */
    EnvVar["CODEQL_PASS_CONFIG_TO_CLI"] = "CODEQL_PASS_CONFIG_TO_CLI";
})(EnvVar || (EnvVar = {}));
const exportVar = (mode, name, value) => {
    if (mode === Mode.actions) {
        core.exportVariable(name, value);
    }
    else {
        process.env[name] = value;
    }
};
/**
 * Set some initial environment variables that we can set even without
 * knowing what version of CodeQL we're running.
 */
function initializeEnvironment(mode, version) {
    exportVar(mode, EnvVar.RUN_MODE, mode);
    exportVar(mode, EnvVar.VERSION, version);
    exportVar(mode, EnvVar.FEATURE_SARIF_COMBINE, "true");
    exportVar(mode, EnvVar.FEATURE_WILL_UPLOAD, "true");
}
exports.initializeEnvironment = initializeEnvironment;
/**
 * Enrich the environment variables with further flags that we cannot
 * know the value of until we know what version of CodeQL we're running.
 */
async function enrichEnvironment(mode, codeql) {
    if (await codeQlVersionAbove(codeql, codeql_1.CODEQL_VERSION_NEW_TRACING)) {
        exportVar(mode, EnvVar.FEATURE_MULTI_LANGUAGE, "false");
        exportVar(mode, EnvVar.FEATURE_SANDWICH, "false");
    }
    else {
        exportVar(mode, EnvVar.FEATURE_MULTI_LANGUAGE, "true");
        exportVar(mode, EnvVar.FEATURE_SANDWICH, "true");
    }
}
exports.enrichEnvironment = enrichEnvironment;
function getMode() {
    // Make sure we fail fast if the env var is missing. This should
    // only happen if there is a bug in our code and we neglected
    // to set the mode early in the process.
    const mode = getRequiredEnvParam(EnvVar.RUN_MODE);
    if (mode !== Mode.actions && mode !== Mode.runner) {
        throw new Error(`Unknown mode: ${mode}.`);
    }
    return mode;
}
exports.getMode = getMode;
function isActions() {
    return getMode() === Mode.actions;
}
exports.isActions = isActions;
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
function isGitHubGhesVersionBelow(gitHubVersion, expectedVersion) {
    return (gitHubVersion.type === GitHubVariant.GHES &&
        semver.lt(gitHubVersion.version, expectedVersion));
}
exports.isGitHubGhesVersionBelow = isGitHubGhesVersionBelow;
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
    if (await codeQlVersionAbove(codeQL, "2.9.3")) {
        version = `~0.3.0`;
    }
    else if (await codeQlVersionAbove(codeQL, "2.8.4")) {
        version = `~0.2.0`;
    }
    else {
        version = `~0.1.0`;
    }
    return `${exports.ML_POWERED_JS_QUERIES_PACK_NAME}@${version}`;
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
        .map((pack) => pack.split("@"))
        .filter((packNameVersion) => packNameVersion[0] === "codeql/javascript-experimental-atm-queries" &&
        packNameVersion.length <= 2);
    switch (mlPoweredJsQueryPacks.length) {
        case 1:
            // We should always specify an explicit version string in `getMlPoweredJsQueriesPack`,
            // otherwise we won't be able to make changes to the pack unless those changes are compatible
            // with each version of the CodeQL Action. Therefore in practice we should only hit the
            // `latest` case here when customers have explicitly added the ML-powered query pack to their
            // CodeQL config.
            return mlPoweredJsQueryPacks[0][1] || "latest";
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
 * instance supports v2, then log a warning about v1's upcoming deprecation prompting the customer
 * to upgrade to v2.
 */
async function checkActionVersion(version) {
    var _a;
    if (!semver.satisfies(version, ">=2")) {
        const githubVersion = await api.getGitHubVersionActionsOnly();
        // Only log a warning for versions of GHES that are compatible with CodeQL Action version 2.
        //
        // GHES 3.4 shipped without the v2 tag, but it also shipped without this warning message code.
        // Therefore users who are seeing this warning message code have pulled in a new version of the
        // Action, and with it the v2 tag.
        if (githubVersion.type === GitHubVariant.DOTCOM ||
            githubVersion.type === GitHubVariant.GHAE ||
            (githubVersion.type === GitHubVariant.GHES &&
                semver.satisfies((_a = semver.coerce(githubVersion.version)) !== null && _a !== void 0 ? _a : "0.0.0", ">=3.4"))) {
            core.warning("CodeQL Action v1 will be deprecated on December 7th, 2022. Please upgrade to v2. For " +
                "more information, see " +
                "https://github.blog/changelog/2022-04-27-code-scanning-deprecation-of-codeql-action-v1/");
        }
    }
}
exports.checkActionVersion = checkActionVersion;
/*
 * Returns whether we are in test mode.
 *
 * In test mode, we don't upload SARIF results or status reports to the GitHub API.
 */
function isInTestMode() {
    return process.env["TEST_MODE"] === "true" || false;
}
exports.isInTestMode = isInTestMode;
/**
 * @returns true if the action should generate a conde-scanning config file
 * that gets passed to the CLI.
 */
async function useCodeScanningConfigInCli(codeql) {
    return ((process.env[EnvVar.CODEQL_PASS_CONFIG_TO_CLI] === "true" &&
        (await codeQlVersionAbove(codeql, codeql_1.CODEQL_VERSION_CONFIG_FILES))) ||
        false);
}
exports.useCodeScanningConfigInCli = useCodeScanningConfigInCli;
//# sourceMappingURL=util.js.map