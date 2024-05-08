import { ConfigurationError } from "./util";

/**
 * A class of Error that we can classify as an error stemming from a CLI
 * invocation, with associated exit code, stderr,etc.
 */
export class CommandInvocationError extends Error {
  constructor(
    cmd: string,
    args: string[],
    public exitCode: number,
    public stderr: string,
    public stdout: string,
  ) {
    const prettyCommand = [cmd, ...args]
      .map((x) => (x.includes(" ") ? `'${x}'` : x))
      .join(" ");

    const fatalErrors = extractFatalErrors(stderr);
    const autobuildErrors = extractAutobuildErrors(stderr);
    let message: string;

    if (fatalErrors) {
      message =
        `Encountered a fatal error while running "${prettyCommand}". ` +
        `Exit code was ${exitCode} and error was: ${fatalErrors.trim()} See the logs for more details.`;
    } else if (autobuildErrors) {
      const autobuildHelpLink =
        "https://docs.github.com/en/code-security/code-scanning/troubleshooting-code-scanning/automatic-build-failed";
      message =
        "We were unable to automatically build your code. Please provide manual build steps. " +
        `For more information, see ${autobuildHelpLink}. ` +
        `Encountered the following error: ${autobuildErrors}`;
    } else {
      let lastLine = stderr.trim().split("\n").pop()?.trim() || "";
      if (lastLine[lastLine.length - 1] !== ".") {
        lastLine += ".";
      }
      message =
        `Encountered a fatal error while running "${prettyCommand}". ` +
        `Exit code was ${exitCode} and last log line was: ${lastLine} See the logs for more details.`;
    }

    super(message);
  }
}

/**
 * Provide a better error message from the stderr of a CLI invocation that failed with a fatal
 * error.
 *
 * - If the CLI invocation failed with a fatal error, this returns that fatal error, followed by
 *   any fatal errors that occurred in plumbing commands.
 * - If the CLI invocation did not fail with a fatal error, this returns `undefined`.
 *
 * ### Example
 *
 * ```
 * Running TRAP import for CodeQL database at /home/runner/work/_temp/codeql_databases/javascript...
 * A fatal error occurred: Evaluator heap must be at least 384.00 MiB
 * A fatal error occurred: Dataset import for
 * /home/runner/work/_temp/codeql_databases/javascript/db-javascript failed with code 2
 * ```
 *
 * becomes
 *
 * ```
 * Encountered a fatal error while running "codeql-for-testing database finalize --finalize-dataset
 * --threads=2 --ram=2048 db". Exit code was 32 and error was: A fatal error occurred: Dataset
 * import for /home/runner/work/_temp/codeql_databases/javascript/db-javascript failed with code 2.
 * Context: A fatal error occurred: Evaluator heap must be at least 384.00 MiB.
 * ```
 *
 * Where possible, this tries to summarize the error into a single line, as this displays better in
 * the Actions UI.
 */
function extractFatalErrors(error: string): string | undefined {
  const fatalErrorRegex = /.*fatal error occurred:/gi;
  let fatalErrors: string[] = [];
  let lastFatalErrorIndex: number | undefined;
  let match: RegExpMatchArray | null;
  while ((match = fatalErrorRegex.exec(error)) !== null) {
    if (lastFatalErrorIndex !== undefined) {
      fatalErrors.push(error.slice(lastFatalErrorIndex, match.index).trim());
    }
    lastFatalErrorIndex = match.index;
  }
  if (lastFatalErrorIndex !== undefined) {
    const lastError = error.slice(lastFatalErrorIndex).trim();
    if (fatalErrors.length === 0) {
      // No other errors
      return lastError;
    }
    const isOneLiner = !fatalErrors.some((e) => e.includes("\n"));
    if (isOneLiner) {
      fatalErrors = fatalErrors.map(ensureEndsInPeriod);
    }
    return [
      ensureEndsInPeriod(lastError),
      "Context:",
      ...fatalErrors.reverse(),
    ].join(isOneLiner ? " " : "\n");
  }
  return undefined;
}

function extractAutobuildErrors(error: string): string | undefined {
  const pattern = /.*\[autobuild\] \[ERROR\] (.*)/gi;
  let errorLines = [...error.matchAll(pattern)].map((match) => match[1]);
  // Truncate if there are more than 10 matching lines.
  if (errorLines.length > 10) {
    errorLines = errorLines.slice(0, 10);
    errorLines.push("(truncated)");
  }
  return errorLines.join("\n") || undefined;
}

function ensureEndsInPeriod(text: string): string {
  return text[text.length - 1] === "." ? text : `${text}.`;
}

/** Error messages from the CLI that we consider configuration errors and handle specially. */
export enum CliConfigErrorCategory {
  ExternalRepositoryCloneFailed = "ExternalRepositoryCloneFailed",
  GracefulOutOfMemory = "GracefulOutOfMemory",
  GradleBuildFailed = "GradleBuildFailed",
  IncompatibleWithActionVersion = "IncompatibleWithActionVersion",
  InitCalledTwice = "InitCalledTwice",
  InvalidSourceRoot = "InvalidSourceRoot",
  MavenBuildFailed = "MavenBuildFailed",
  NoBuildCommandAutodetected = "NoBuildCommandAutodetected",
  NoBuildMethodAutodetected = "NoBuildMethodAutodetected",
  NoSourceCodeSeen = "NoSourceCodeSeen",
  NoSupportedBuildCommandSucceeded = "NoSupportedBuildCommandSucceeded",
  NoSupportedBuildSystemDetected = "NoSupportedBuildSystemDetected",
  PackCannotBeFound = "PackCannotBeFound",
  SwiftBuildFailed = "SwiftBuildFailed",
  UnsupportedBuildMode = "UnsupportedBuildMode",
}

type CliErrorConfiguration = {
  /** One of these candidates, or the exit code, must be present in the error message. */
  cliErrorMessageCandidates: RegExp[];
  exitCode?: number;
  additionalErrorMessageToAppend?: string;
};

/**
 * All of our caught CLI error messages that we handle specially: ie. if we
 * would like to categorize an error as a configuration error or not.
 */
export const cliErrorsConfig: Record<
  CliConfigErrorCategory,
  CliErrorConfiguration
> = {
  [CliConfigErrorCategory.ExternalRepositoryCloneFailed]: {
    cliErrorMessageCandidates: [
      new RegExp("Failed to clone external Git repository"),
    ],
  },
  [CliConfigErrorCategory.GracefulOutOfMemory]: {
    cliErrorMessageCandidates: [new RegExp("CodeQL is out of memory.")],
  },
  [CliConfigErrorCategory.GradleBuildFailed]: {
    cliErrorMessageCandidates: [
      new RegExp("[autobuild] FAILURE: Build failed with an exception."),
    ],
  },
  // Version of CodeQL CLI is incompatible with this version of the CodeQL Action
  [CliConfigErrorCategory.IncompatibleWithActionVersion]: {
    cliErrorMessageCandidates: [
      new RegExp("is not compatible with this CodeQL CLI"),
    ],
  },
  [CliConfigErrorCategory.InitCalledTwice]: {
    cliErrorMessageCandidates: [
      new RegExp(
        "Refusing to create databases .* but could not process any of it",
      ),
    ],
    additionalErrorMessageToAppend: `Is the "init" action called twice in the same job?`,
  },
  // Expected source location for database creation does not exist
  [CliConfigErrorCategory.InvalidSourceRoot]: {
    cliErrorMessageCandidates: [new RegExp("Invalid source root")],
  },
  [CliConfigErrorCategory.MavenBuildFailed]: {
    cliErrorMessageCandidates: [
      new RegExp("\\[autobuild\\] \\[ERROR\\] Failed to execute goal"),
    ],
  },
  [CliConfigErrorCategory.NoBuildCommandAutodetected]: {
    cliErrorMessageCandidates: [
      new RegExp("Could not auto-detect a suitable build method"),
    ],
  },
  [CliConfigErrorCategory.NoBuildMethodAutodetected]: {
    cliErrorMessageCandidates: [
      new RegExp(
        "Could not detect a suitable build command for the source checkout",
      ),
    ],
  },
  // Usually when a manual build script has failed, or if an autodetected language
  // was unintended to have CodeQL analysis run on it.
  [CliConfigErrorCategory.NoSourceCodeSeen]: {
    exitCode: 32,
    cliErrorMessageCandidates: [
      new RegExp(
        "CodeQL detected code written in .* but could not process any of it",
      ),
      new RegExp(
        "CodeQL did not detect any code written in languages supported by CodeQL",
      ),
    ],
  },

  [CliConfigErrorCategory.NoSupportedBuildCommandSucceeded]: {
    cliErrorMessageCandidates: [
      new RegExp("No supported build command succeeded"),
    ],
  },
  [CliConfigErrorCategory.NoSupportedBuildSystemDetected]: {
    cliErrorMessageCandidates: [
      new RegExp("No supported build system detected"),
    ],
  },
  [CliConfigErrorCategory.PackCannotBeFound]: {
    cliErrorMessageCandidates: [
      new RegExp(
        "Query pack .* cannot be found\\. Check the spelling of the pack\\.",
      ),
    ],
  },
  [CliConfigErrorCategory.SwiftBuildFailed]: {
    cliErrorMessageCandidates: [
      new RegExp(
        "\\[autobuilder/build\\] \\[build-command-failed\\] `autobuild` failed to run the build command",
      ),
    ],
  },
  [CliConfigErrorCategory.UnsupportedBuildMode]: {
    cliErrorMessageCandidates: [
      new RegExp(
        "does not support the .* build mode. Please try using one of the following build modes instead",
      ),
    ],
  },
};

/**
 * Check if the given CLI error or exit code, if applicable, apply to any known
 * CLI errors in the configuration record. If either the CLI error message matches one of
 * the error messages in the config record, or the exit codes match, return the error category;
 * if not, return undefined.
 */
export function getCliConfigCategoryIfExists(
  cliError: CommandInvocationError,
): CliConfigErrorCategory | undefined {
  for (const [category, configuration] of Object.entries(cliErrorsConfig)) {
    if (
      cliError.exitCode !== undefined &&
      configuration.exitCode !== undefined &&
      cliError.exitCode === configuration.exitCode
    ) {
      return category as CliConfigErrorCategory;
    }

    for (const e of configuration.cliErrorMessageCandidates) {
      if (cliError.message.match(e) || cliError.stderr.match(e)) {
        return category as CliConfigErrorCategory;
      }
    }
  }

  return undefined;
}

/**
 * Changes an error received from the CLI to a ConfigurationError with optionally an extra
 * error message appended, if it exists in a known set of configuration errors. Otherwise,
 * simply returns the original error.
 */
export function wrapCliConfigurationError(cliError: Error): Error {
  if (!(cliError instanceof CommandInvocationError)) {
    return cliError;
  }

  const cliConfigErrorCategory = getCliConfigCategoryIfExists(cliError);
  if (cliConfigErrorCategory === undefined) {
    return cliError;
  }

  let errorMessageBuilder = cliError.message;

  const additionalErrorMessageToAppend =
    cliErrorsConfig[cliConfigErrorCategory].additionalErrorMessageToAppend;
  if (additionalErrorMessageToAppend !== undefined) {
    errorMessageBuilder = `${errorMessageBuilder} ${additionalErrorMessageToAppend}`;
  }

  return new ConfigurationError(errorMessageBuilder);
}
