"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const semver = __importStar(require("semver"));
const api_client_1 = require("./api-client");
const apiCompatibility = __importStar(require("./api-compatibility.json"));
/**
 * The URL for github.com.
 */
exports.GITHUB_DOTCOM_URL = "https://github.com";
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
        throw new Error(`${varName} environment variable is set, but does not contain valid JSON: ${e.message}`);
    }
}
exports.getExtraOptionsEnvParam = getExtraOptionsEnvParam;
/**
 * Get the array of all the tool names contained in the given sarif contents.
 *
 * Returns an array of unique string tool names.
 */
function getToolNames(sarifContents) {
    const sarif = JSON.parse(sarifContents);
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
    fs.rmdirSync(tmpDir, { recursive: true });
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
 * Get the codeql `--ram` flag as configured by the `ram` input. If no value was
 * specified, the total available memory will be used minus a threshold
 * reserved for the OS.
 *
 * @returns string
 */
function getMemoryFlag(userInput) {
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
    return `--ram=${Math.floor(memoryToUseMegaBytes)}`;
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
 * Get the codeql `--threads` value specified for the `threads` input.
 * If not value was specified, all available threads will be used.
 *
 * The value will be capped to the number of available CPUs.
 *
 * @returns string
 */
function getThreadsFlag(userInput, logger) {
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
    return `--threads=${numThreads}`;
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
    const apiClient = api_client_1.getApiClient(apiDetails);
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
    // either 'actions' or 'runner'
    EnvVar["RUN_MODE"] = "CODEQL_ACTION_RUN_MODE";
    // semver of this action
    EnvVar["VERSION"] = "CODEQL_ACTION_VERSION";
    // if set to a truthy value, then the action might combine SARIF
    // output from several `interpret-results` runs for the same language
    EnvVar["FEATURE_SARIF_COMBINE"] = "CODEQL_ACTION_FEATURE_SARIF_COMBINE";
    // if set to a truthy value, then the action will upload SARIF,
    // not the CLI
    EnvVar["FEATURE_WILL_UPLOAD"] = "CODEQL_ACTION_FEATURE_WILL_UPLOAD";
    // if set to a truthy value, then the action is using its
    // own deprecated and non-standard way of scanning for multiple
    // languages
    EnvVar["FEATURE_MULTI_LANGUAGE"] = "CODEQL_ACTION_FEATURE_MULTI_LANGUAGE";
    // if set to a truthy value, then the action is using its
    // own sandwiched workflow mechanism
    EnvVar["FEATURE_SANDWICH"] = "CODEQL_ACTION_FEATURE_SANDWICH";
})(EnvVar || (EnvVar = {}));
function initializeEnvironment(mode, version) {
    // avoid accessing actions core when in runner mode
    if (mode === Mode.actions) {
        core.exportVariable(EnvVar.RUN_MODE, mode);
        core.exportVariable(EnvVar.VERSION, version);
        core.exportVariable(EnvVar.FEATURE_SARIF_COMBINE, "true");
        core.exportVariable(EnvVar.FEATURE_WILL_UPLOAD, "true");
        core.exportVariable(EnvVar.FEATURE_MULTI_LANGUAGE, "true");
        core.exportVariable(EnvVar.FEATURE_SANDWICH, "true");
    }
    else {
        process.env[EnvVar.RUN_MODE] = mode;
        process.env[EnvVar.VERSION] = version;
        process.env[EnvVar.FEATURE_SARIF_COMBINE] = "true";
        process.env[EnvVar.FEATURE_WILL_UPLOAD] = "true";
        process.env[EnvVar.FEATURE_MULTI_LANGUAGE] = "true";
        process.env[EnvVar.FEATURE_SANDWICH] = "true";
    }
}
exports.initializeEnvironment = initializeEnvironment;
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
    core.debug(`${paramName}=${value}`);
    return value;
}
exports.getRequiredEnvParam = getRequiredEnvParam;
function getTemporaryDirectory() {
    const value = process.env["CODEQL_ACTION_TEMP"];
    return value !== undefined && value !== ""
        ? value
        : getRequiredEnvParam("RUNNER_TEMP");
}
exports.getTemporaryDirectory = getTemporaryDirectory;
//# sourceMappingURL=util.js.map