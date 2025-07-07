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
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreInputs = exports.persistInputs = exports.CommandInvocationError = exports.getFileType = exports.FileCmdNotFoundError = exports.getOptionalInput = exports.getRequiredInput = void 0;
exports.getTemporaryDirectory = getTemporaryDirectory;
exports.getActionVersion = getActionVersion;
exports.getWorkflowEventName = getWorkflowEventName;
exports.isRunningLocalAction = isRunningLocalAction;
exports.getRelativeScriptPath = getRelativeScriptPath;
exports.getWorkflowEvent = getWorkflowEvent;
exports.printDebugLogs = printDebugLogs;
exports.getUploadValue = getUploadValue;
exports.getWorkflowRunID = getWorkflowRunID;
exports.getWorkflowRunAttempt = getWorkflowRunAttempt;
exports.isSelfHostedRunner = isSelfHostedRunner;
exports.isDefaultSetup = isDefaultSetup;
exports.prettyPrintInvocation = prettyPrintInvocation;
exports.ensureEndsInPeriod = ensureEndsInPeriod;
exports.runTool = runTool;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const io = __importStar(require("@actions/io"));
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
        fileCmdPath = await io.which("file", true);
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
/** Determines whether we are running in default setup. */
function isDefaultSetup() {
    return getWorkflowEventName() === "dynamic";
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