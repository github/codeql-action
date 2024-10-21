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
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreInputs = exports.persistInputs = exports.CommandInvocationError = exports.getFileType = exports.FileCmdNotFoundError = exports.determineBaseBranchHeadCommitOid = exports.getCommitOid = exports.getOptionalInput = exports.getRequiredInput = void 0;
exports.getTemporaryDirectory = getTemporaryDirectory;
exports.getRef = getRef;
exports.getActionVersion = getActionVersion;
exports.getWorkflowEventName = getWorkflowEventName;
exports.isRunningLocalAction = isRunningLocalAction;
exports.getRelativeScriptPath = getRelativeScriptPath;
exports.getWorkflowEvent = getWorkflowEvent;
exports.isAnalyzingDefaultBranch = isAnalyzingDefaultBranch;
exports.printDebugLogs = printDebugLogs;
exports.getUploadValue = getUploadValue;
exports.getWorkflowRunID = getWorkflowRunID;
exports.getWorkflowRunAttempt = getWorkflowRunAttempt;
exports.isSelfHostedRunner = isSelfHostedRunner;
exports.prettyPrintInvocation = prettyPrintInvocation;
exports.ensureEndsInPeriod = ensureEndsInPeriod;
exports.runTool = runTool;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const safeWhich = __importStar(require("@chrisgavin/safe-which"));
const util_1 = require("./util");
// eslint-disable-next-line import/no-commonjs, @typescript-eslint/no-require-imports
const pkg = require("../package.json");
/**
 * Wrapper around core.getInput for inputs that always have a value.
 * Also see getOptionalInput.
 *
 * This allows us to get stronger type checking of required/optional inputs.
 */
const getRequiredInput = function (name) {
    const value = core.getInput(name);
    if (!value) {
        throw new util_1.ConfigurationError(`Input required and not supplied: ${name}`);
    }
    return value;
};
exports.getRequiredInput = getRequiredInput;
/**
 * Wrapper around core.getInput that converts empty inputs to undefined.
 * Also see getRequiredInput.
 *
 * This allows us to get stronger type checking of required/optional inputs.
 */
const getOptionalInput = function (name) {
    const value = core.getInput(name);
    return value.length > 0 ? value : undefined;
};
exports.getOptionalInput = getOptionalInput;
function getTemporaryDirectory() {
    const value = process.env["CODEQL_ACTION_TEMP"];
    return value !== undefined && value !== ""
        ? value
        : (0, util_1.getRequiredEnvParam)("RUNNER_TEMP");
}
async function runGitCommand(checkoutPath, args, customErrorMessage) {
    let stdout = "";
    let stderr = "";
    try {
        await new toolrunner.ToolRunner(await safeWhich.safeWhich("git"), args, {
            silent: true,
            listeners: {
                stdout: (data) => {
                    stdout += data.toString();
                },
                stderr: (data) => {
                    stderr += data.toString();
                },
            },
            cwd: checkoutPath,
        }).exec();
        return stdout;
    }
    catch (error) {
        let reason = stderr;
        if (stderr.includes("not a git repository")) {
            reason =
                "The checkout path provided to the action does not appear to be a git repository.";
        }
        core.info(`git call failed. ${customErrorMessage} Error: ${reason}`);
        throw error;
    }
}
/**
 * Gets the SHA of the commit that is currently checked out.
 */
const getCommitOid = async function (checkoutPath, ref = "HEAD") {
    // Try to use git to get the current commit SHA. If that fails then
    // log but otherwise silently fall back to using the SHA from the environment.
    // The only time these two values will differ is during analysis of a PR when
    // the workflow has changed the current commit to the head commit instead of
    // the merge commit, which must mean that git is available.
    // Even if this does go wrong, it's not a huge problem for the alerts to
    // reported on the merge commit.
    try {
        const stdout = await runGitCommand(checkoutPath, ["rev-parse", ref], "Continuing with commit SHA from user input or environment.");
        return stdout.trim();
    }
    catch {
        return (0, exports.getOptionalInput)("sha") || (0, util_1.getRequiredEnvParam)("GITHUB_SHA");
    }
};
exports.getCommitOid = getCommitOid;
/**
 * If the action was triggered by a pull request, determine the commit sha at
 * the head of the base branch, using the merge commit that this workflow analyzes.
 * Returns undefined if run by other triggers or the base branch commit cannot be
 * determined.
 */
const determineBaseBranchHeadCommitOid = async function (checkoutPathOverride) {
    if (getWorkflowEventName() !== "pull_request") {
        return undefined;
    }
    const mergeSha = (0, util_1.getRequiredEnvParam)("GITHUB_SHA");
    const checkoutPath = checkoutPathOverride ?? (0, exports.getOptionalInput)("checkout_path");
    try {
        let commitOid = "";
        let baseOid = "";
        let headOid = "";
        const stdout = await runGitCommand(checkoutPath, ["show", "-s", "--format=raw", mergeSha], "Will calculate the base branch SHA on the server.");
        for (const data of stdout.split("\n")) {
            if (data.startsWith("commit ") && commitOid === "") {
                commitOid = data.substring(7);
            }
            else if (data.startsWith("parent ")) {
                if (baseOid === "") {
                    baseOid = data.substring(7);
                }
                else if (headOid === "") {
                    headOid = data.substring(7);
                }
            }
        }
        // Let's confirm our assumptions: We had a merge commit and the parsed parent data looks correct
        if (commitOid === mergeSha &&
            headOid.length === 40 &&
            baseOid.length === 40) {
            return baseOid;
        }
        return undefined;
    }
    catch {
        return undefined;
    }
};
exports.determineBaseBranchHeadCommitOid = determineBaseBranchHeadCommitOid;
/**
 * Get the ref currently being analyzed.
 */
async function getRef() {
    // Will be in the form "refs/heads/master" on a push event
    // or in the form "refs/pull/N/merge" on a pull_request event
    const refInput = (0, exports.getOptionalInput)("ref");
    const shaInput = (0, exports.getOptionalInput)("sha");
    const checkoutPath = (0, exports.getOptionalInput)("checkout_path") ||
        (0, exports.getOptionalInput)("source-root") ||
        (0, util_1.getRequiredEnvParam)("GITHUB_WORKSPACE");
    const hasRefInput = !!refInput;
    const hasShaInput = !!shaInput;
    // If one of 'ref' or 'sha' are provided, both are required
    if ((hasRefInput || hasShaInput) && !(hasRefInput && hasShaInput)) {
        throw new util_1.ConfigurationError("Both 'ref' and 'sha' are required if one of them is provided.");
    }
    const ref = refInput || getRefFromEnv();
    const sha = shaInput || (0, util_1.getRequiredEnvParam)("GITHUB_SHA");
    // If the ref is a user-provided input, we have to skip logic
    // and assume that it is really where they want to upload the results.
    if (refInput) {
        return refInput;
    }
    // For pull request refs we want to detect whether the workflow
    // has run `git checkout HEAD^2` to analyze the 'head' ref rather
    // than the 'merge' ref. If so, we want to convert the ref that
    // we report back.
    const pull_ref_regex = /refs\/pull\/(\d+)\/merge/;
    if (!pull_ref_regex.test(ref)) {
        return ref;
    }
    const head = await (0, exports.getCommitOid)(checkoutPath, "HEAD");
    // in actions/checkout@v2+ we can check if git rev-parse HEAD == GITHUB_SHA
    // in actions/checkout@v1 this may not be true as it checks out the repository
    // using GITHUB_REF. There is a subtle race condition where
    // git rev-parse GITHUB_REF != GITHUB_SHA, so we must check
    // git rev-parse GITHUB_REF == git rev-parse HEAD instead.
    const hasChangedRef = sha !== head &&
        (await (0, exports.getCommitOid)(checkoutPath, ref.replace(/^refs\/pull\//, "refs/remotes/pull/"))) !== head;
    if (hasChangedRef) {
        const newRef = ref.replace(pull_ref_regex, "refs/pull/$1/head");
        core.debug(`No longer on merge commit, rewriting ref from ${ref} to ${newRef}.`);
        return newRef;
    }
    else {
        return ref;
    }
}
function getRefFromEnv() {
    // To workaround a limitation of Actions dynamic workflows not setting
    // the GITHUB_REF in some cases, we accept also the ref within the
    // CODE_SCANNING_REF variable. When possible, however, we prefer to use
    // the GITHUB_REF as that is a protected variable and cannot be overwritten.
    let refEnv;
    try {
        refEnv = (0, util_1.getRequiredEnvParam)("GITHUB_REF");
    }
    catch (e) {
        // If the GITHUB_REF is not set, we try to rescue by getting the
        // CODE_SCANNING_REF.
        const maybeRef = process.env["CODE_SCANNING_REF"];
        if (maybeRef === undefined || maybeRef.length === 0) {
            throw e;
        }
        refEnv = maybeRef;
    }
    return refEnv;
}
function getActionVersion() {
    return pkg.version;
}
/**
 * Returns the name of the event that triggered this workflow.
 *
 * This will be "dynamic" for default setup workflow runs.
 */
function getWorkflowEventName() {
    return (0, util_1.getRequiredEnvParam)("GITHUB_EVENT_NAME");
}
/**
 * Returns whether the current workflow is executing a local copy of the Action, e.g. we're running
 * a workflow on the codeql-action repo itself.
 */
function isRunningLocalAction() {
    const relativeScriptPath = getRelativeScriptPath();
    return (relativeScriptPath.startsWith("..") || path.isAbsolute(relativeScriptPath));
}
/**
 * Get the location where the Action is running from.
 *
 * This can be used to get the Action's name or tell if we're running a local Action.
 */
function getRelativeScriptPath() {
    const runnerTemp = (0, util_1.getRequiredEnvParam)("RUNNER_TEMP");
    const actionsDirectory = path.join(path.dirname(runnerTemp), "_actions");
    return path.relative(actionsDirectory, __filename);
}
/** Returns the contents of `GITHUB_EVENT_PATH` as a JSON object. */
function getWorkflowEvent() {
    const eventJsonFile = (0, util_1.getRequiredEnvParam)("GITHUB_EVENT_PATH");
    try {
        return JSON.parse(fs.readFileSync(eventJsonFile, "utf-8"));
    }
    catch (e) {
        throw new Error(`Unable to read workflow event JSON from ${eventJsonFile}: ${e}`);
    }
}
function removeRefsHeadsPrefix(ref) {
    return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}
/**
 * Returns whether we are analyzing the default branch for the repository.
 *
 * This first checks the environment variable `CODE_SCANNING_IS_ANALYZING_DEFAULT_BRANCH`. This
 * environment variable can be set in cases where repository information might not be available, for
 * example dynamic workflows.
 */
async function isAnalyzingDefaultBranch() {
    if (process.env.CODE_SCANNING_IS_ANALYZING_DEFAULT_BRANCH === "true") {
        return true;
    }
    // Get the current ref and trim and refs/heads/ prefix
    let currentRef = await getRef();
    currentRef = removeRefsHeadsPrefix(currentRef);
    const event = getWorkflowEvent();
    let defaultBranch = event?.repository?.default_branch;
    if (getWorkflowEventName() === "schedule") {
        defaultBranch = removeRefsHeadsPrefix(getRefFromEnv());
    }
    return currentRef === defaultBranch;
}
async function printDebugLogs(config) {
    for (const language of config.languages) {
        const databaseDirectory = (0, util_1.getCodeQLDatabasePath)(config, language);
        const logsDirectory = path.join(databaseDirectory, "log");
        if (!(0, util_1.doesDirectoryExist)(logsDirectory)) {
            core.info(`Directory ${logsDirectory} does not exist.`);
            continue; // Skip this language database.
        }
        const walkLogFiles = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            if (entries.length === 0) {
                core.info(`No debug logs found at directory ${logsDirectory}.`);
            }
            for (const entry of entries) {
                if (entry.isFile()) {
                    const absolutePath = path.resolve(dir, entry.name);
                    core.startGroup(`CodeQL Debug Logs - ${language} - ${entry.name} from file at path ${absolutePath}`);
                    process.stdout.write(fs.readFileSync(absolutePath));
                    core.endGroup();
                }
                else if (entry.isDirectory()) {
                    walkLogFiles(path.resolve(dir, entry.name));
                }
            }
        };
        walkLogFiles(logsDirectory);
    }
}
/**
 * Parses the `upload` input into an `UploadKind`, converting unspecified and deprecated upload
 * inputs appropriately.
 */
function getUploadValue(input) {
    switch (input) {
        case undefined:
        case "true":
        case "always":
            return "always";
        case "false":
        case "failure-only":
            return "failure-only";
        case "never":
            return "never";
        default:
            core.warning(`Unrecognized 'upload' input to 'analyze' Action: ${input}. Defaulting to 'always'.`);
            return "always";
    }
}
/**
 * Get the workflow run ID.
 */
function getWorkflowRunID() {
    const workflowRunIdString = (0, util_1.getRequiredEnvParam)("GITHUB_RUN_ID");
    const workflowRunID = parseInt(workflowRunIdString, 10);
    if (Number.isNaN(workflowRunID)) {
        throw new Error(`GITHUB_RUN_ID must define a non NaN workflow run ID. Current value is ${workflowRunIdString}`);
    }
    if (workflowRunID < 0) {
        throw new Error(`GITHUB_RUN_ID must be a non-negative integer. Current value is ${workflowRunIdString}`);
    }
    return workflowRunID;
}
/**
 * Get the workflow run attempt number.
 */
function getWorkflowRunAttempt() {
    const workflowRunAttemptString = (0, util_1.getRequiredEnvParam)("GITHUB_RUN_ATTEMPT");
    const workflowRunAttempt = parseInt(workflowRunAttemptString, 10);
    if (Number.isNaN(workflowRunAttempt)) {
        throw new Error(`GITHUB_RUN_ATTEMPT must define a non NaN workflow run attempt. Current value is ${workflowRunAttemptString}`);
    }
    if (workflowRunAttempt <= 0) {
        throw new Error(`GITHUB_RUN_ATTEMPT must be a positive integer. Current value is ${workflowRunAttemptString}`);
    }
    return workflowRunAttempt;
}
class FileCmdNotFoundError extends Error {
    constructor(msg) {
        super(msg);
        this.name = "FileCmdNotFoundError";
    }
}
exports.FileCmdNotFoundError = FileCmdNotFoundError;
/**
 * Tries to obtain the output of the `file` command for the file at the specified path.
 * The output will vary depending on the type of `file`, which operating system we are running on, etc.
 */
const getFileType = async (filePath) => {
    let stderr = "";
    let stdout = "";
    let fileCmdPath;
    try {
        fileCmdPath = await safeWhich.safeWhich("file");
    }
    catch (e) {
        throw new FileCmdNotFoundError(`The \`file\` program is required, but does not appear to be installed. Please install it: ${e}`);
    }
    try {
        // The `file` command will output information about the type of file pointed at by `filePath`.
        // For binary files, this may include e.g. whether they are static of dynamic binaries.
        // The `-L` switch instructs the command to follow symbolic links.
        await new toolrunner.ToolRunner(fileCmdPath, ["-L", filePath], {
            silent: true,
            listeners: {
                stdout: (data) => {
                    stdout += data.toString();
                },
                stderr: (data) => {
                    stderr += data.toString();
                },
            },
        }).exec();
        return stdout.trim();
    }
    catch (e) {
        core.info(`Could not determine type of ${filePath} from ${stdout}. ${stderr}`);
        throw e;
    }
};
exports.getFileType = getFileType;
function isSelfHostedRunner() {
    return process.env.RUNNER_ENVIRONMENT === "self-hosted";
}
function prettyPrintInvocation(cmd, args) {
    return [cmd, ...args].map((x) => (x.includes(" ") ? `'${x}'` : x)).join(" ");
}
/**
 * An error from a tool invocation, with associated exit code, stderr, etc.
 */
class CommandInvocationError extends Error {
    constructor(cmd, args, exitCode, stderr, stdout) {
        const prettyCommand = prettyPrintInvocation(cmd, args);
        const lastLine = ensureEndsInPeriod(stderr.trim().split("\n").pop()?.trim() || "n/a");
        super(`Failed to run "${prettyCommand}". ` +
            `Exit code was ${exitCode} and last log line was: ${lastLine} See the logs for more details.`);
        this.cmd = cmd;
        this.args = args;
        this.exitCode = exitCode;
        this.stderr = stderr;
        this.stdout = stdout;
    }
}
exports.CommandInvocationError = CommandInvocationError;
function ensureEndsInPeriod(text) {
    return text[text.length - 1] === "." ? text : `${text}.`;
}
/**
 * A constant defining the maximum number of characters we will keep from
 * the programs stderr for logging.
 *
 * This serves two purposes:
 * 1. It avoids an OOM if a program fails in a way that results it
 *    printing many log lines.
 * 2. It avoids us hitting the limit of how much data we can send in our
 *    status reports on GitHub.com.
 */
const MAX_STDERR_BUFFER_SIZE = 20000;
/**
 * Runs a CLI tool.
 *
 * @returns Standard output produced by the tool.
 * @throws A `CommandInvocationError` if the tool exits with a non-zero status code.
 */
async function runTool(cmd, args = [], opts = {}) {
    let stdout = "";
    let stderr = "";
    if (!opts.noStreamStdout) {
        process.stdout.write(`[command]${cmd} ${args.join(" ")}\n`);
    }
    const exitCode = await new toolrunner.ToolRunner(cmd, args, {
        ignoreReturnCode: true,
        listeners: {
            stdout: (data) => {
                stdout += data.toString("utf8");
                if (!opts.noStreamStdout) {
                    process.stdout.write(data);
                }
            },
            stderr: (data) => {
                let readStartIndex = 0;
                // If the error is too large, then we only take the last MAX_STDERR_BUFFER_SIZE characters
                if (data.length - MAX_STDERR_BUFFER_SIZE > 0) {
                    // Eg: if we have MAX_STDERR_BUFFER_SIZE the start index should be 2.
                    readStartIndex = data.length - MAX_STDERR_BUFFER_SIZE + 1;
                }
                stderr += data.toString("utf8", readStartIndex);
                // Mimic the standard behavior of the toolrunner by writing stderr to stdout
                process.stdout.write(data);
            },
        },
        silent: true,
        ...(opts.stdin ? { input: Buffer.from(opts.stdin || "") } : {}),
    }).exec();
    if (exitCode !== 0) {
        throw new CommandInvocationError(cmd, args, exitCode, stderr, stdout);
    }
    return stdout;
}
const persistedInputsKey = "persisted_inputs";
/**
 * Persists all inputs to the action as state that can be retrieved later in the post-action.
 * This would be simplified if actions/runner#3514 is addressed.
 * https://github.com/actions/runner/issues/3514
 */
const persistInputs = function () {
    const inputEnvironmentVariables = Object.entries(process.env).filter(([name]) => name.startsWith("INPUT_"));
    core.saveState(persistedInputsKey, JSON.stringify(inputEnvironmentVariables));
};
exports.persistInputs = persistInputs;
/**
 * Restores all inputs to the action from the persisted state.
 */
const restoreInputs = function () {
    const persistedInputs = core.getState(persistedInputsKey);
    if (persistedInputs) {
        for (const [name, value] of JSON.parse(persistedInputs)) {
            process.env[name] = value;
        }
    }
};
exports.restoreInputs = restoreInputs;
//# sourceMappingURL=actions-util.js.map