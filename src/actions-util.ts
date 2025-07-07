import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";
import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as io from "@actions/io";
import { JSONSchemaForNPMPackageJsonFiles } from "@schemastore/package";

import type { Config } from "./config-utils";
import {
  doesDirectoryExist,
  getCodeQLDatabasePath,
  getRequiredEnvParam,
  ConfigurationError,
} from "./util";

// eslint-disable-next-line import/no-commonjs, @typescript-eslint/no-require-imports
const pkg = require("../package.json") as JSONSchemaForNPMPackageJsonFiles;

/**
 * Wrapper around core.getInput for inputs that always have a value.
 * Also see getOptionalInput.
 *
 * This allows us to get stronger type checking of required/optional inputs.
 */
export const getRequiredInput = function (name: string): string {
  const value = core.getInput(name);
  if (!value) {
    throw new ConfigurationError(`Input required and not supplied: ${name}`);
  }
  return value;
};

/**
 * Wrapper around core.getInput that converts empty inputs to undefined.
 * Also see getRequiredInput.
 *
 * This allows us to get stronger type checking of required/optional inputs.
 */
export const getOptionalInput = function (name: string): string | undefined {
  const value = core.getInput(name);
  return value.length > 0 ? value : undefined;
};

export function getTemporaryDirectory(): string {
  const value = process.env["CODEQL_ACTION_TEMP"];
  return value !== undefined && value !== ""
    ? value
    : getRequiredEnvParam("RUNNER_TEMP");
}

export function getActionVersion(): string {
  return pkg.version!;
}

/**
 * Returns the name of the event that triggered this workflow.
 *
 * This will be "dynamic" for default setup workflow runs.
 */
export function getWorkflowEventName() {
  return getRequiredEnvParam("GITHUB_EVENT_NAME");
}

/**
 * Returns whether the current workflow is executing a local copy of the Action, e.g. we're running
 * a workflow on the codeql-action repo itself.
 */
export function isRunningLocalAction(): boolean {
  const relativeScriptPath = getRelativeScriptPath();
  return (
    relativeScriptPath.startsWith("..") || path.isAbsolute(relativeScriptPath)
  );
}

/**
 * Get the location where the Action is running from.
 *
 * This can be used to get the Action's name or tell if we're running a local Action.
 */
export function getRelativeScriptPath(): string {
  const runnerTemp = getRequiredEnvParam("RUNNER_TEMP");
  const actionsDirectory = path.join(path.dirname(runnerTemp), "_actions");
  return path.relative(actionsDirectory, __filename);
}

/** Returns the contents of `GITHUB_EVENT_PATH` as a JSON object. */
export function getWorkflowEvent(): any {
  const eventJsonFile = getRequiredEnvParam("GITHUB_EVENT_PATH");
  try {
    return JSON.parse(fs.readFileSync(eventJsonFile, "utf-8"));
  } catch (e) {
    throw new Error(
      `Unable to read workflow event JSON from ${eventJsonFile}: ${e}`,
    );
  }
}

export async function printDebugLogs(config: Config) {
  for (const language of config.languages) {
    const databaseDirectory = getCodeQLDatabasePath(config, language);
    const logsDirectory = path.join(databaseDirectory, "log");
    if (!doesDirectoryExist(logsDirectory)) {
      core.info(`Directory ${logsDirectory} does not exist.`);
      continue; // Skip this language database.
    }

    const walkLogFiles = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      if (entries.length === 0) {
        core.info(`No debug logs found at directory ${logsDirectory}.`);
      }
      for (const entry of entries) {
        if (entry.isFile()) {
          const absolutePath = path.resolve(dir, entry.name);
          core.startGroup(
            `CodeQL Debug Logs - ${language} - ${entry.name} from file at path ${absolutePath}`,
          );
          process.stdout.write(fs.readFileSync(absolutePath));
          core.endGroup();
        } else if (entry.isDirectory()) {
          walkLogFiles(path.resolve(dir, entry.name));
        }
      }
    };
    walkLogFiles(logsDirectory);
  }
}

export type UploadKind = "always" | "failure-only" | "never";

/**
 * Parses the `upload` input into an `UploadKind`, converting unspecified and deprecated upload
 * inputs appropriately.
 */
export function getUploadValue(input: string | undefined): UploadKind {
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
      core.warning(
        `Unrecognized 'upload' input to 'analyze' Action: ${input}. Defaulting to 'always'.`,
      );
      return "always";
  }
}

/**
 * Get the workflow run ID.
 */
export function getWorkflowRunID(): number {
  const workflowRunIdString = getRequiredEnvParam("GITHUB_RUN_ID");
  const workflowRunID = parseInt(workflowRunIdString, 10);
  if (Number.isNaN(workflowRunID)) {
    throw new Error(
      `GITHUB_RUN_ID must define a non NaN workflow run ID. Current value is ${workflowRunIdString}`,
    );
  }
  if (workflowRunID < 0) {
    throw new Error(
      `GITHUB_RUN_ID must be a non-negative integer. Current value is ${workflowRunIdString}`,
    );
  }
  return workflowRunID;
}

/**
 * Get the workflow run attempt number.
 */
export function getWorkflowRunAttempt(): number {
  const workflowRunAttemptString = getRequiredEnvParam("GITHUB_RUN_ATTEMPT");
  const workflowRunAttempt = parseInt(workflowRunAttemptString, 10);
  if (Number.isNaN(workflowRunAttempt)) {
    throw new Error(
      `GITHUB_RUN_ATTEMPT must define a non NaN workflow run attempt. Current value is ${workflowRunAttemptString}`,
    );
  }
  if (workflowRunAttempt <= 0) {
    throw new Error(
      `GITHUB_RUN_ATTEMPT must be a positive integer. Current value is ${workflowRunAttemptString}`,
    );
  }
  return workflowRunAttempt;
}

export class FileCmdNotFoundError extends Error {
  constructor(msg: string) {
    super(msg);

    this.name = "FileCmdNotFoundError";
  }
}

/**
 * Tries to obtain the output of the `file` command for the file at the specified path.
 * The output will vary depending on the type of `file`, which operating system we are running on, etc.
 */
export const getFileType = async (filePath: string): Promise<string> => {
  let stderr = "";
  let stdout = "";

  let fileCmdPath: string;

  try {
    fileCmdPath = await io.which("file", true);
  } catch (e) {
    throw new FileCmdNotFoundError(
      `The \`file\` program is required, but does not appear to be installed. Please install it: ${e}`,
    );
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
  } catch (e) {
    core.info(
      `Could not determine type of ${filePath} from ${stdout}. ${stderr}`,
    );

    throw e;
  }
};

export function isSelfHostedRunner() {
  return process.env.RUNNER_ENVIRONMENT === "self-hosted";
}

/** Determines whether we are running in default setup. */
export function isDefaultSetup(): boolean {
  return getWorkflowEventName() === "dynamic";
}

export function prettyPrintInvocation(cmd: string, args: string[]): string {
  return [cmd, ...args].map((x) => (x.includes(" ") ? `'${x}'` : x)).join(" ");
}

/**
 * An error from a tool invocation, with associated exit code, stderr, etc.
 */
export class CommandInvocationError extends Error {
  constructor(
    public cmd: string,
    public args: string[],
    public exitCode: number | undefined,
    public stderr: string,
    public stdout: string,
  ) {
    const prettyCommand = prettyPrintInvocation(cmd, args);
    const lastLine = ensureEndsInPeriod(
      stderr.trim().split("\n").pop()?.trim() || "n/a",
    );
    super(
      `Failed to run "${prettyCommand}". ` +
        `Exit code was ${exitCode} and last log line was: ${lastLine} See the logs for more details.`,
    );
  }
}

export function ensureEndsInPeriod(text: string): string {
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
export async function runTool(
  cmd: string,
  args: string[] = [],
  opts: { stdin?: string; noStreamStdout?: boolean } = {},
): Promise<string> {
  let stdout = "";
  let stderr = "";
  if (!opts.noStreamStdout) {
    process.stdout.write(`[command]${cmd} ${args.join(" ")}\n`);
  }
  const exitCode = await new toolrunner.ToolRunner(cmd, args, {
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString("utf8");
        if (!opts.noStreamStdout) {
          process.stdout.write(data);
        }
      },
      stderr: (data: Buffer) => {
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
export const persistInputs = function () {
  const inputEnvironmentVariables = Object.entries(process.env).filter(
    ([name]) => name.startsWith("INPUT_"),
  );
  core.saveState(persistedInputsKey, JSON.stringify(inputEnvironmentVariables));
};

/**
 * Restores all inputs to the action from the persisted state.
 */
export const restoreInputs = function () {
  const persistedInputs = core.getState(persistedInputsKey);
  if (persistedInputs) {
    for (const [name, value] of JSON.parse(persistedInputs)) {
      process.env[name] = value;
    }
  }
};
