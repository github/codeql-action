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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildMode = exports.ConfigurationError = exports.HTTPError = exports.DisallowedAPIVersionReason = exports.GitHubVariant = exports.DEFAULT_DEBUG_DATABASE_NAME = exports.DEFAULT_DEBUG_ARTIFACT_NAME = exports.GITHUB_DOTCOM_URL = void 0;
exports.getExtraOptionsEnvParam = getExtraOptionsEnvParam;
exports.getToolNames = getToolNames;
exports.withTmpDir = withTmpDir;
exports.getMemoryFlagValueForPlatform = getMemoryFlagValueForPlatform;
exports.getMemoryFlagValue = getMemoryFlagValue;
exports.getMemoryFlag = getMemoryFlag;
exports.getAddSnippetsFlag = getAddSnippetsFlag;
exports.getThreadsFlagValue = getThreadsFlagValue;
exports.getCgroupCpuCountFromCpus = getCgroupCpuCountFromCpus;
exports.getThreadsFlag = getThreadsFlag;
exports.getCodeQLDatabasePath = getCodeQLDatabasePath;
exports.parseGitHubUrl = parseGitHubUrl;
exports.checkGitHubVersionInRange = checkGitHubVersionInRange;
exports.apiVersionInRange = apiVersionInRange;
exports.assertNever = assertNever;
exports.initializeEnvironment = initializeEnvironment;
exports.getRequiredEnvParam = getRequiredEnvParam;
exports.isHTTPError = isHTTPError;
exports.cacheCodeQlVersion = cacheCodeQlVersion;
exports.getCachedCodeQlVersion = getCachedCodeQlVersion;
exports.codeQlVersionAtLeast = codeQlVersionAtLeast;
exports.bundleDb = bundleDb;
exports.delay = delay;
exports.isGoodVersion = isGoodVersion;
exports.isInTestMode = isInTestMode;
exports.doesDirectoryExist = doesDirectoryExist;
exports.listFolder = listFolder;
exports.tryGetFolderBytes = tryGetFolderBytes;
exports.withTimeout = withTimeout;
exports.checkForTimeout = checkForTimeout;
exports.isHostedRunner = isHostedRunner;
exports.parseMatrixInput = parseMatrixInput;
exports.fixInvalidNotifications = fixInvalidNotifications;
exports.fixInvalidNotificationsInFile = fixInvalidNotificationsInFile;
exports.wrapError = wrapError;
exports.getErrorMessage = getErrorMessage;
exports.prettyPrintPack = prettyPrintPack;
exports.checkDiskUsage = checkDiskUsage;
exports.checkActionVersion = checkActionVersion;
exports.cloneObject = cloneObject;
exports.checkSipEnablement = checkSipEnablement;
exports.cleanUpGlob = cleanUpGlob;
exports.isBinaryAccessible = isBinaryAccessible;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const util_1 = require("util");
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec/lib/exec"));
const io = __importStar(require("@actions/io"));
const check_disk_space_1 = __importDefault(require("check-disk-space"));
const del_1 = __importDefault(require("del"));
const get_folder_size_1 = __importDefault(require("get-folder-size"));
const yaml = __importStar(require("js-yaml"));
const semver = __importStar(require("semver"));
const apiCompatibility = __importStar(require("./api-compatibility.json"));
const environment_1 = require("./environment");
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
 * The default fraction of the total RAM above 8 GB that should be reserved for the system.
 */
const DEFAULT_RESERVED_RAM_SCALING_FACTOR = 0.05;
/**
 * The minimum amount of memory imposed by a cgroup limit that we will consider. Memory limits below
 * this amount are ignored.
 */
const MINIMUM_CGROUP_MEMORY_LIMIT_BYTES = 1024 * 1024;
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
        return yaml.load(raw);
    }
    catch (unwrappedError) {
        const error = wrapError(unwrappedError);
        throw new ConfigurationError(`${varName} environment variable is set, but does not contain valid JSON: ${error.message}`);
    }
}
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
// Creates a random temporary directory, runs the given body, and then deletes the directory.
// Mostly intended for use within tests.
async function withTmpDir(body) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeql-action-"));
    const result = await body(tmpDir);
    await (0, del_1.default)(tmpDir, { force: true });
    return result;
}
/**
 * Gets an OS-specific amount of memory (in MB) to reserve for OS processes
 * when the user doesn't explicitly specify a memory setting.
 * This is a heuristic to avoid OOM errors (exit code 137 / SIGKILL)
 * from committing too much of the available memory to CodeQL.
 * @returns number
 */
function getSystemReservedMemoryMegaBytes(totalMemoryMegaBytes, platform) {
    // Windows needs more memory for OS processes.
    const fixedAmount = 1024 * (platform === "win32" ? 1.5 : 1);
    // Reserve an additional percentage of the amount of memory above 8 GB, since the amount used by
    // the kernel for page tables scales with the size of physical memory.
    const scaledAmount = getReservedRamScaleFactor() * Math.max(totalMemoryMegaBytes - 8 * 1024, 0);
    return fixedAmount + scaledAmount;
}
function getReservedRamScaleFactor() {
    const envVar = Number.parseInt(process.env[environment_1.EnvVar.SCALING_RESERVED_RAM_PERCENTAGE] || "", 10);
    if (envVar < 0 || envVar > 100 || Number.isNaN(envVar)) {
        return DEFAULT_RESERVED_RAM_SCALING_FACTOR;
    }
    return envVar / 100;
}
/**
 * Get the value of the codeql `--ram` flag as configured by the `ram` input.
 * If no value was specified, the total available memory will be used minus a
 * threshold reserved for the OS.
 *
 * @returns {number} the amount of RAM to use, in megabytes
 */
function getMemoryFlagValueForPlatform(userInput, totalMemoryBytes, platform) {
    let memoryToUseMegaBytes;
    if (userInput) {
        memoryToUseMegaBytes = Number(userInput);
        if (Number.isNaN(memoryToUseMegaBytes) || memoryToUseMegaBytes <= 0) {
            throw new ConfigurationError(`Invalid RAM setting "${userInput}", specified.`);
        }
    }
    else {
        const totalMemoryMegaBytes = totalMemoryBytes / (1024 * 1024);
        const reservedMemoryMegaBytes = getSystemReservedMemoryMegaBytes(totalMemoryMegaBytes, platform);
        memoryToUseMegaBytes = totalMemoryMegaBytes - reservedMemoryMegaBytes;
    }
    return Math.floor(memoryToUseMegaBytes);
}
/**
 * Get the total amount of memory available to the Action, taking into account constraints imposed
 * by cgroups on Linux.
 */
function getTotalMemoryBytes(logger) {
    const limits = [os.totalmem()];
    if (os.platform() === "linux") {
        limits.push(...[
            "/sys/fs/cgroup/memory/memory.limit_in_bytes",
            "/sys/fs/cgroup/memory.max",
        ]
            .map((file) => getCgroupMemoryLimitBytes(file, logger))
            .filter((limit) => limit !== undefined)
            .map((limit) => limit));
    }
    const limit = Math.min(...limits);
    logger.debug(`While resolving RAM, determined that the total memory available to the Action is ${limit / (1024 * 1024)} MiB.`);
    return limit;
}
/**
 * Gets the number of bytes of available memory specified by the cgroup limit file at the given path.
 *
 * May be greater than the total memory reported by the operating system if there is no cgroup limit.
 */
function getCgroupMemoryLimitBytes(limitFile, logger) {
    if (!fs.existsSync(limitFile)) {
        logger.debug(`While resolving RAM, did not find a cgroup memory limit at ${limitFile}.`);
        return undefined;
    }
    const limit = Number(fs.readFileSync(limitFile, "utf8"));
    if (!Number.isInteger(limit)) {
        logger.debug(`While resolving RAM, ignored the file ${limitFile} that may contain a cgroup memory limit ` +
            "as this file did not contain an integer.");
        return undefined;
    }
    const displayLimit = `${Math.floor(limit / (1024 * 1024))} MiB`;
    if (limit > os.totalmem()) {
        logger.debug(`While resolving RAM, ignored the file ${limitFile} that may contain a cgroup memory limit as ` +
            `its contents ${displayLimit} were greater than the total amount of system memory.`);
        return undefined;
    }
    if (limit < MINIMUM_CGROUP_MEMORY_LIMIT_BYTES) {
        logger.info(`While resolving RAM, ignored a cgroup limit of ${displayLimit} in ${limitFile} as it was below ${MINIMUM_CGROUP_MEMORY_LIMIT_BYTES / (1024 * 1024)} MiB.`);
        return undefined;
    }
    logger.info(`While resolving RAM, found a cgroup limit of ${displayLimit} in ${limitFile}.`);
    return limit;
}
/**
 * Get the value of the codeql `--ram` flag as configured by the `ram` input.
 * If no value was specified, the total available memory will be used minus a
 * threshold reserved for the OS.
 *
 * @returns {number} the amount of RAM to use, in megabytes
 */
function getMemoryFlagValue(userInput, logger) {
    return getMemoryFlagValueForPlatform(userInput, getTotalMemoryBytes(logger), process.platform);
}
/**
 * Get the codeql `--ram` flag as configured by the `ram` input. If no value was
 * specified, the total available memory will be used minus a threshold
 * reserved for the OS.
 *
 * @returns string
 */
function getMemoryFlag(userInput, logger) {
    const megabytes = getMemoryFlagValue(userInput, logger);
    return `--ram=${megabytes}`;
}
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
    const maxThreadsCandidates = [os.cpus().length];
    if (os.platform() === "linux") {
        maxThreadsCandidates.push(...["/sys/fs/cgroup/cpuset.cpus.effective", "/sys/fs/cgroup/cpuset.cpus"]
            .map((file) => getCgroupCpuCountFromCpus(file, logger))
            .filter((count) => count !== undefined && count > 0)
            .map((count) => count));
        maxThreadsCandidates.push(...["/sys/fs/cgroup/cpu.max"]
            .map((file) => getCgroupCpuCountFromCpuMax(file, logger))
            .filter((count) => count !== undefined && count > 0)
            .map((count) => count));
    }
    const maxThreads = Math.min(...maxThreadsCandidates);
    if (userInput) {
        numThreads = Number(userInput);
        if (Number.isNaN(numThreads)) {
            throw new ConfigurationError(`Invalid threads setting "${userInput}", specified.`);
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
/**
 * Gets the number of available cores specified by the cgroup cpu.max file at the given path.
 * Format of file: two values, the limit and the duration (period). If the limit is "max" then
 * we return undefined and do not use this file to determine CPU limits.
 */
function getCgroupCpuCountFromCpuMax(cpuMaxFile, logger) {
    if (!fs.existsSync(cpuMaxFile)) {
        logger.debug(`While resolving threads, did not find a cgroup CPU file at ${cpuMaxFile}.`);
        return undefined;
    }
    const cpuMaxString = fs.readFileSync(cpuMaxFile, "utf-8");
    const cpuMaxStringSplit = cpuMaxString.split(" ");
    if (cpuMaxStringSplit.length !== 2) {
        logger.debug(`While resolving threads, did not use cgroup CPU file at ${cpuMaxFile} because it contained ${cpuMaxStringSplit.length} value(s) rather than the two expected.`);
        return undefined;
    }
    const cpuLimit = cpuMaxStringSplit[0];
    if (cpuLimit === "max") {
        return undefined;
    }
    const duration = cpuMaxStringSplit[1];
    const cpuCount = Math.floor(parseInt(cpuLimit) / parseInt(duration));
    logger.info(`While resolving threads, found a cgroup CPU file with ${cpuCount} CPUs in ${cpuMaxFile}.`);
    return cpuCount;
}
/**
 * Gets the number of available cores listed in the cgroup cpuset.cpus file at the given path.
 */
function getCgroupCpuCountFromCpus(cpusFile, logger) {
    if (!fs.existsSync(cpusFile)) {
        logger.debug(`While resolving threads, did not find a cgroup CPUs file at ${cpusFile}.`);
        return undefined;
    }
    let cpuCount = 0;
    // Comma-separated numbers and ranges, for eg. 0-1,3
    const cpusString = fs.readFileSync(cpusFile, "utf-8").trim();
    if (cpusString.length === 0) {
        return undefined;
    }
    for (const token of cpusString.split(",")) {
        if (!token.includes("-")) {
            // Not a range
            ++cpuCount;
        }
        else {
            const cpuStartIndex = parseInt(token.split("-")[0]);
            const cpuEndIndex = parseInt(token.split("-")[1]);
            cpuCount += cpuEndIndex - cpuStartIndex + 1;
        }
    }
    logger.info(`While resolving threads, found a cgroup CPUs file with ${cpuCount} CPUs in ${cpusFile}.`);
    return cpuCount;
}
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
/**
 * Get the path where the CodeQL database for the given language lives.
 */
function getCodeQLDatabasePath(config, language) {
    return path.resolve(config.dbLocation, language);
}
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
        throw new ConfigurationError(`"${originalUrl}" is not a http or https URL`);
    }
    let url;
    try {
        url = new URL(inputUrl);
    }
    catch {
        throw new ConfigurationError(`"${originalUrl}" is not a valid URL`);
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
const CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR = "CODEQL_ACTION_WARNED_ABOUT_VERSION";
let hasBeenWarnedAboutVersion = false;
var GitHubVariant;
(function (GitHubVariant) {
    GitHubVariant[GitHubVariant["DOTCOM"] = 0] = "DOTCOM";
    GitHubVariant[GitHubVariant["GHES"] = 1] = "GHES";
    GitHubVariant[GitHubVariant["GHE_DOTCOM"] = 2] = "GHE_DOTCOM";
})(GitHubVariant || (exports.GitHubVariant = GitHubVariant = {}));
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
var DisallowedAPIVersionReason;
(function (DisallowedAPIVersionReason) {
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_OLD"] = 0] = "ACTION_TOO_OLD";
    DisallowedAPIVersionReason[DisallowedAPIVersionReason["ACTION_TOO_NEW"] = 1] = "ACTION_TOO_NEW";
})(DisallowedAPIVersionReason || (exports.DisallowedAPIVersionReason = DisallowedAPIVersionReason = {}));
function apiVersionInRange(version, minimumVersion, maximumVersion) {
    if (!semver.satisfies(version, `>=${minimumVersion}`)) {
        return DisallowedAPIVersionReason.ACTION_TOO_NEW;
    }
    if (!semver.satisfies(version, `<=${maximumVersion}`)) {
        return DisallowedAPIVersionReason.ACTION_TOO_OLD;
    }
    return undefined;
}
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
/**
 * Set some initial environment variables that we can set even without
 * knowing what version of CodeQL we're running.
 */
function initializeEnvironment(version) {
    core.exportVariable(String(environment_1.EnvVar.FEATURE_MULTI_LANGUAGE), "false");
    core.exportVariable(String(environment_1.EnvVar.FEATURE_SANDWICH), "false");
    core.exportVariable(String(environment_1.EnvVar.FEATURE_SARIF_COMBINE), "true");
    core.exportVariable(String(environment_1.EnvVar.FEATURE_WILL_UPLOAD), "true");
    core.exportVariable(String(environment_1.EnvVar.VERSION), version);
}
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
class ConfigurationError extends Error {
    constructor(message) {
        super(message);
    }
}
exports.ConfigurationError = ConfigurationError;
function isHTTPError(arg) {
    return arg?.status !== undefined && Number.isInteger(arg.status);
}
let cachedCodeQlVersion = undefined;
function cacheCodeQlVersion(version) {
    if (cachedCodeQlVersion !== undefined) {
        throw new Error("cacheCodeQlVersion() should be called only once");
    }
    cachedCodeQlVersion = version;
}
function getCachedCodeQlVersion() {
    return cachedCodeQlVersion;
}
async function codeQlVersionAtLeast(codeql, requiredVersion) {
    return semver.gte((await codeql.getVersion()).version, requiredVersion);
}
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
/**
 * @param milliseconds time to delay
 * @param opts options
 * @param opts.allowProcessExit if true, the timer will not prevent the process from exiting
 */
async function delay(milliseconds, opts) {
    const { allowProcessExit } = opts || {};
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, milliseconds);
        if (allowProcessExit) {
            // Immediately `unref` the timer such that it only prevents the process from exiting if the
            // surrounding promise is being awaited.
            timer.unref();
        }
    });
}
function isGoodVersion(versionSpec) {
    return !BROKEN_VERSIONS.includes(versionSpec);
}
/*
 * Returns whether we are in test mode.
 *
 * In test mode, we don't upload SARIF results or status reports to the GitHub API.
 */
function isInTestMode() {
    return process.env[environment_1.EnvVar.TEST_MODE] === "true";
}
/*
 * Returns whether the path in the argument represents an existing directory.
 */
function doesDirectoryExist(dirPath) {
    try {
        const stats = fs.lstatSync(dirPath);
        return stats.isDirectory();
    }
    catch {
        return false;
    }
}
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
/**
 * Get the size a folder in bytes. This will log any filesystem errors
 * as a warning and then return undefined.
 *
 * @param cacheDir A directory to get the size of.
 * @param logger A logger to log any errors to.
 * @param quiet A value indicating whether to suppress warnings for errors (default: false).
 *              Ignored if the log level is `debug`.
 * @returns The size in bytes of the folder, or undefined if errors occurred.
 */
async function tryGetFolderBytes(cacheDir, logger, quiet = false) {
    try {
        return await (0, util_1.promisify)(get_folder_size_1.default)(cacheDir);
    }
    catch (e) {
        if (!quiet || logger.isDebug()) {
            logger.warning(`Encountered an error while getting size of '${cacheDir}': ${e}`);
        }
        return undefined;
    }
}
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
    const timeoutTask = async () => {
        await delay(timeoutMs, { allowProcessExit: true });
        if (!finished) {
            // Workaround: While the promise racing below will allow the main code
            // to continue, the process won't normally exit until the asynchronous
            // task in the background has finished. We set this variable to force
            // an exit at the end of our code when `checkForTimeout` is called.
            hadTimeout = true;
            onTimeout();
        }
        return undefined;
    };
    return await Promise.race([mainTask(), timeoutTask()]);
}
/**
 * Check if the global hadTimeout variable has been set, and if so then
 * exit the process to ensure any background tasks that are still running
 * are killed. This should be called at the end of execution if the
 * `withTimeout` function has been used.
 */
async function checkForTimeout() {
    if (hadTimeout === true) {
        core.info("A timeout occurred, force exiting the process after 30 seconds to prevent hanging.");
        await delay(30_000, { allowProcessExit: true });
        process.exit();
    }
}
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
    return (
    // Name of the runner on hosted Windows runners
    process.env["RUNNER_NAME"]?.includes("Hosted Agent") ||
        // Name of the runner on hosted POSIX runners
        process.env["RUNNER_NAME"]?.includes("GitHub Actions") ||
        // Segment of the path to the tool cache on all hosted runners
        process.env["RUNNER_TOOL_CACHE"]?.includes("hostedtoolcache"));
}
function parseMatrixInput(matrixInput) {
    if (matrixInput === undefined || matrixInput === "null") {
        return undefined;
    }
    return JSON.parse(matrixInput);
}
function removeDuplicateLocations(locations) {
    const newJsonLocations = new Set();
    return locations.filter((location) => {
        const jsonLocation = JSON.stringify(location);
        if (!newJsonLocations.has(jsonLocation)) {
            newJsonLocations.add(jsonLocation);
            return true;
        }
        return false;
    });
}
function fixInvalidNotifications(sarif, logger) {
    if (!Array.isArray(sarif.runs)) {
        return sarif;
    }
    // Ensure that the array of locations for each SARIF notification contains unique locations.
    // This is a workaround for a bug in the CodeQL CLI that causes duplicate locations to be
    // emitted in some cases.
    let numDuplicateLocationsRemoved = 0;
    const newSarif = {
        ...sarif,
        runs: sarif.runs.map((run) => {
            if (run.tool?.driver?.name !== "CodeQL" ||
                !Array.isArray(run.invocations)) {
                return run;
            }
            return {
                ...run,
                invocations: run.invocations.map((invocation) => {
                    if (!Array.isArray(invocation.toolExecutionNotifications)) {
                        return invocation;
                    }
                    return {
                        ...invocation,
                        toolExecutionNotifications: invocation.toolExecutionNotifications.map((notification) => {
                            if (!Array.isArray(notification.locations)) {
                                return notification;
                            }
                            const newLocations = removeDuplicateLocations(notification.locations);
                            numDuplicateLocationsRemoved +=
                                notification.locations.length - newLocations.length;
                            return {
                                ...notification,
                                locations: newLocations,
                            };
                        }),
                    };
                }),
            };
        }),
    };
    if (numDuplicateLocationsRemoved > 0) {
        logger.info(`Removed ${numDuplicateLocationsRemoved} duplicate locations from SARIF notification ` +
            "objects.");
    }
    else {
        logger.debug("No duplicate locations found in SARIF notification objects.");
    }
    return newSarif;
}
/**
 * Removes duplicates from the sarif file.
 *
 * When `CODEQL_ACTION_DISABLE_DUPLICATE_LOCATION_FIX` is set to true, this will
 * simply rename the input file to the output file. Otherwise, it will parse the
 * input file as JSON, remove duplicate locations from the SARIF notification
 * objects, and write the result to the output file.
 *
 * For context, see documentation of:
 * `CODEQL_ACTION_DISABLE_DUPLICATE_LOCATION_FIX`. */
function fixInvalidNotificationsInFile(inputPath, outputPath, logger) {
    if (process.env[environment_1.EnvVar.DISABLE_DUPLICATE_LOCATION_FIX] === "true") {
        logger.info("SARIF notification object duplicate location fix disabled by the " +
            `${environment_1.EnvVar.DISABLE_DUPLICATE_LOCATION_FIX} environment variable.`);
        fs.renameSync(inputPath, outputPath);
    }
    else {
        let sarif = JSON.parse(fs.readFileSync(inputPath, "utf8"));
        sarif = fixInvalidNotifications(sarif, logger);
        fs.writeFileSync(outputPath, JSON.stringify(sarif));
    }
}
function wrapError(error) {
    return error instanceof Error ? error : new Error(String(error));
}
/**
 * Returns an appropriate message for the error.
 *
 * If the error is an `Error` instance, this returns the error message without
 * an `Error: ` prefix.
 */
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function prettyPrintPack(pack) {
    return `${pack.name}${pack.version ? `@${pack.version}` : ""}${pack.path ? `:${pack.path}` : ""}`;
}
async function checkDiskUsage(logger) {
    try {
        // We avoid running the `df` binary under the hood for macOS ARM runners with SIP disabled.
        if (process.platform === "darwin" &&
            (process.arch === "arm" || process.arch === "arm64") &&
            !(await checkSipEnablement(logger))) {
            return undefined;
        }
        const diskUsage = await (0, check_disk_space_1.default)(getRequiredEnvParam("GITHUB_WORKSPACE"));
        const mbInBytes = 1024 * 1024;
        const gbInBytes = 1024 * 1024 * 1024;
        if (diskUsage.free < 2 * gbInBytes) {
            const message = "The Actions runner is running low on disk space " +
                `(${(diskUsage.free / mbInBytes).toPrecision(4)} MB available).`;
            if (process.env[environment_1.EnvVar.HAS_WARNED_ABOUT_DISK_SPACE] !== "true") {
                logger.warning(message);
            }
            else {
                logger.debug(message);
            }
            core.exportVariable(environment_1.EnvVar.HAS_WARNED_ABOUT_DISK_SPACE, "true");
        }
        return {
            numAvailableBytes: diskUsage.free,
            numTotalBytes: diskUsage.size,
        };
    }
    catch (error) {
        logger.warning(`Failed to check available disk space: ${getErrorMessage(error)}`);
        return undefined;
    }
}
/**
 * Prompt the customer to upgrade to CodeQL Action v3, if appropriate.
 *
 * Check whether a customer is running v1 or v2. If they are, and we can determine that the GitHub
 * instance supports v3, then log an error prompting the customer to upgrade to v3.
 */
function checkActionVersion(version, githubVersion) {
    if (!semver.satisfies(version, ">=3") && // do not log error if the customer is already running v3
        !process.env[environment_1.EnvVar.LOG_VERSION_DEPRECATION] // do not log error if we have already
    ) {
        // Only error for versions of GHES that are compatible with CodeQL Action version 3.
        //
        // GHES 3.11 shipped without the v3 tag, but it also shipped without this warning message code.
        // Therefore users who are seeing this warning message code have pulled in a new version of the
        // Action, and with it the v3 tag.
        if (githubVersion.type === GitHubVariant.DOTCOM ||
            githubVersion.type === GitHubVariant.GHE_DOTCOM ||
            (githubVersion.type === GitHubVariant.GHES &&
                semver.satisfies(semver.coerce(githubVersion.version) ?? "0.0.0", ">=3.11"))) {
            core.error("CodeQL Action major versions v1 and v2 have been deprecated. " +
                "Please update all occurrences of the CodeQL Action in your workflow files to v3. " +
                "For more information, see " +
                "https://github.blog/changelog/2025-01-10-code-scanning-codeql-action-v2-is-now-deprecated/");
            // set LOG_VERSION_DEPRECATION env var to prevent the warning from being logged multiple times
            core.exportVariable(environment_1.EnvVar.LOG_VERSION_DEPRECATION, "true");
        }
    }
}
/**
 * Supported build modes.
 *
 * These specify whether the CodeQL database should be created by tracing a build, and if so, how
 * this build will be invoked.
 */
var BuildMode;
(function (BuildMode) {
    /** The database will be created without building the source root. */
    BuildMode["None"] = "none";
    /** The database will be created by attempting to automatically build the source root. */
    BuildMode["Autobuild"] = "autobuild";
    /** The database will be created by building the source root using manually specified build steps. */
    BuildMode["Manual"] = "manual";
})(BuildMode || (exports.BuildMode = BuildMode = {}));
function cloneObject(obj) {
    return JSON.parse(JSON.stringify(obj));
}
// The first time this function is called, it runs `csrutil status` to determine
// whether System Integrity Protection is enabled; and saves the result in an
// environment variable. Afterwards, simply return the value of the environment
// variable.
async function checkSipEnablement(logger) {
    if (process.env[environment_1.EnvVar.IS_SIP_ENABLED] !== undefined &&
        ["true", "false"].includes(process.env[environment_1.EnvVar.IS_SIP_ENABLED])) {
        return process.env[environment_1.EnvVar.IS_SIP_ENABLED] === "true";
    }
    try {
        const sipStatusOutput = await exec.getExecOutput("csrutil status");
        if (sipStatusOutput.exitCode === 0) {
            if (sipStatusOutput.stdout.includes("System Integrity Protection status: enabled.")) {
                core.exportVariable(environment_1.EnvVar.IS_SIP_ENABLED, "true");
                return true;
            }
            if (sipStatusOutput.stdout.includes("System Integrity Protection status: disabled.")) {
                core.exportVariable(environment_1.EnvVar.IS_SIP_ENABLED, "false");
                return false;
            }
        }
        return undefined;
    }
    catch (e) {
        logger.warning(`Failed to determine if System Integrity Protection was enabled: ${e}`);
        return undefined;
    }
}
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
async function isBinaryAccessible(binary, logger) {
    try {
        await io.which(binary, true);
        logger.debug(`Found ${binary}.`);
        return true;
    }
    catch (e) {
        logger.debug(`Could not find ${binary}: ${e}`);
        return false;
    }
}
//# sourceMappingURL=util.js.map