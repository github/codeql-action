"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cliErrorsConfig = exports.CliConfigErrorCategory = exports.CliError = void 0;
exports.getCliConfigCategoryIfExists = getCliConfigCategoryIfExists;
exports.wrapCliConfigurationError = wrapCliConfigurationError;
const actions_util_1 = require("./actions-util");
const doc_url_1 = require("./doc-url");
const util_1 = require("./util");
/**
 * An error from a CodeQL CLI invocation, with associated exit code, stderr, etc.
 */
class CliError extends Error {
    constructor({ cmd, args, exitCode, stderr }) {
        const prettyCommand = (0, actions_util_1.prettyPrintInvocation)(cmd, args);
        const fatalErrors = extractFatalErrors(stderr);
        const autobuildErrors = extractAutobuildErrors(stderr);
        let message;
        if (fatalErrors) {
            message =
                `Encountered a fatal error while running "${prettyCommand}". ` +
                    `Exit code was ${exitCode} and error was: ${(0, actions_util_1.ensureEndsInPeriod)(fatalErrors.trim())} See the logs for more details.`;
        }
        else if (autobuildErrors) {
            message =
                "We were unable to automatically build your code. Please provide manual build steps. " +
                    `See ${doc_url_1.DocUrl.AUTOMATIC_BUILD_FAILED} for more information. ` +
                    `Encountered the following error: ${autobuildErrors}`;
        }
        else {
            const lastLine = (0, actions_util_1.ensureEndsInPeriod)(stderr.trim().split("\n").pop()?.trim() || "n/a");
            message =
                `Encountered a fatal error while running "${prettyCommand}". ` +
                    `Exit code was ${exitCode} and last log line was: ${lastLine} See the logs for more details.`;
        }
        super(message);
        this.exitCode = exitCode;
        this.stderr = stderr;
    }
}
exports.CliError = CliError;
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
function extractFatalErrors(error) {
    const fatalErrorRegex = /.*fatal (internal )?error occurr?ed(. Details)?:/gi;
    let fatalErrors = [];
    let lastFatalErrorIndex;
    let match;
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
            fatalErrors = fatalErrors.map(actions_util_1.ensureEndsInPeriod);
        }
        return [
            (0, actions_util_1.ensureEndsInPeriod)(lastError),
            "Context:",
            ...fatalErrors.reverse(),
        ].join(isOneLiner ? " " : "\n");
    }
    return undefined;
}
function extractAutobuildErrors(error) {
    const pattern = /.*\[autobuild\] \[ERROR\] (.*)/gi;
    let errorLines = [...error.matchAll(pattern)].map((match) => match[1]);
    // Truncate if there are more than 10 matching lines.
    if (errorLines.length > 10) {
        errorLines = errorLines.slice(0, 10);
        errorLines.push("(truncated)");
    }
    return errorLines.join("\n") || undefined;
}
/** Error messages from the CLI that we consider configuration errors and handle specially. */
var CliConfigErrorCategory;
(function (CliConfigErrorCategory) {
    CliConfigErrorCategory["AutobuildError"] = "AutobuildError";
    CliConfigErrorCategory["CouldNotCreateTempDir"] = "CouldNotCreateTempDir";
    CliConfigErrorCategory["ExternalRepositoryCloneFailed"] = "ExternalRepositoryCloneFailed";
    CliConfigErrorCategory["GradleBuildFailed"] = "GradleBuildFailed";
    CliConfigErrorCategory["IncompatibleWithActionVersion"] = "IncompatibleWithActionVersion";
    CliConfigErrorCategory["InitCalledTwice"] = "InitCalledTwice";
    CliConfigErrorCategory["InvalidConfigFile"] = "InvalidConfigFile";
    CliConfigErrorCategory["InvalidExternalRepoSpecifier"] = "InvalidExternalRepoSpecifier";
    CliConfigErrorCategory["InvalidSourceRoot"] = "InvalidSourceRoot";
    CliConfigErrorCategory["MavenBuildFailed"] = "MavenBuildFailed";
    CliConfigErrorCategory["NoBuildCommandAutodetected"] = "NoBuildCommandAutodetected";
    CliConfigErrorCategory["NoBuildMethodAutodetected"] = "NoBuildMethodAutodetected";
    CliConfigErrorCategory["NoSourceCodeSeen"] = "NoSourceCodeSeen";
    CliConfigErrorCategory["NoSupportedBuildCommandSucceeded"] = "NoSupportedBuildCommandSucceeded";
    CliConfigErrorCategory["NoSupportedBuildSystemDetected"] = "NoSupportedBuildSystemDetected";
    CliConfigErrorCategory["OutOfMemoryOrDisk"] = "OutOfMemoryOrDisk";
    CliConfigErrorCategory["PackCannotBeFound"] = "PackCannotBeFound";
    CliConfigErrorCategory["PackMissingAuth"] = "PackMissingAuth";
    CliConfigErrorCategory["SwiftBuildFailed"] = "SwiftBuildFailed";
    CliConfigErrorCategory["UnsupportedBuildMode"] = "UnsupportedBuildMode";
})(CliConfigErrorCategory || (exports.CliConfigErrorCategory = CliConfigErrorCategory = {}));
/**
 * All of our caught CLI error messages that we handle specially: ie. if we
 * would like to categorize an error as a configuration error or not.
 */
exports.cliErrorsConfig = {
    [CliConfigErrorCategory.AutobuildError]: {
        cliErrorMessageCandidates: [
            new RegExp("We were unable to automatically build your code"),
        ],
    },
    [CliConfigErrorCategory.CouldNotCreateTempDir]: {
        cliErrorMessageCandidates: [new RegExp("Could not create temp directory")],
    },
    [CliConfigErrorCategory.ExternalRepositoryCloneFailed]: {
        cliErrorMessageCandidates: [
            new RegExp("Failed to clone external Git repository"),
        ],
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
            new RegExp("Refusing to create databases .* but could not process any of it"),
        ],
        additionalErrorMessageToAppend: `Is the "init" action called twice in the same job?`,
    },
    [CliConfigErrorCategory.InvalidConfigFile]: {
        cliErrorMessageCandidates: [
            new RegExp("Config file .* is not valid"),
            new RegExp("The supplied config file is empty"),
        ],
    },
    [CliConfigErrorCategory.InvalidExternalRepoSpecifier]: {
        cliErrorMessageCandidates: [
            new RegExp("Specifier for external repository is invalid"),
        ],
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
            new RegExp("Could not detect a suitable build command for the source checkout"),
        ],
    },
    // Usually when a manual build script has failed, or if an autodetected language
    // was unintended to have CodeQL analysis run on it.
    [CliConfigErrorCategory.NoSourceCodeSeen]: {
        exitCode: 32,
        cliErrorMessageCandidates: [
            new RegExp("CodeQL detected code written in .* but could not process any of it"),
            new RegExp("CodeQL did not detect any code written in languages supported by CodeQL"),
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
    [CliConfigErrorCategory.OutOfMemoryOrDisk]: {
        cliErrorMessageCandidates: [
            new RegExp("CodeQL is out of memory."),
            new RegExp("out of disk"),
            new RegExp("No space left on device"),
        ],
        additionalErrorMessageToAppend: "For more information, see https://gh.io/troubleshooting-code-scanning/out-of-disk-or-memory",
    },
    [CliConfigErrorCategory.PackCannotBeFound]: {
        cliErrorMessageCandidates: [
            new RegExp("Query pack .* cannot be found\\. Check the spelling of the pack\\."),
        ],
    },
    [CliConfigErrorCategory.PackMissingAuth]: {
        cliErrorMessageCandidates: [
            new RegExp("GitHub Container registry .* 403 Forbidden"),
            new RegExp("Do you need to specify a token to authenticate to the registry?"),
        ],
    },
    [CliConfigErrorCategory.SwiftBuildFailed]: {
        cliErrorMessageCandidates: [
            new RegExp("\\[autobuilder/build\\] \\[build-command-failed\\] `autobuild` failed to run the build command"),
        ],
    },
    [CliConfigErrorCategory.UnsupportedBuildMode]: {
        cliErrorMessageCandidates: [
            new RegExp("does not support the .* build mode. Please try using one of the following build modes instead"),
        ],
    },
};
/**
 * Check if the given CLI error or exit code, if applicable, apply to any known
 * CLI errors in the configuration record. If either the CLI error message matches one of
 * the error messages in the config record, or the exit codes match, return the error category;
 * if not, return undefined.
 */
function getCliConfigCategoryIfExists(cliError) {
    for (const [category, configuration] of Object.entries(exports.cliErrorsConfig)) {
        if (cliError.exitCode !== undefined &&
            configuration.exitCode !== undefined &&
            cliError.exitCode === configuration.exitCode) {
            return category;
        }
        for (const e of configuration.cliErrorMessageCandidates) {
            if (cliError.message.match(e) || cliError.stderr.match(e)) {
                return category;
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
function wrapCliConfigurationError(cliError) {
    const cliConfigErrorCategory = getCliConfigCategoryIfExists(cliError);
    if (cliConfigErrorCategory === undefined) {
        return cliError;
    }
    let errorMessageBuilder = cliError.message;
    const additionalErrorMessageToAppend = exports.cliErrorsConfig[cliConfigErrorCategory].additionalErrorMessageToAppend;
    if (additionalErrorMessageToAppend !== undefined) {
        errorMessageBuilder = `${errorMessageBuilder} ${additionalErrorMessageToAppend}`;
    }
    return new util_1.ConfigurationError(errorMessageBuilder);
}
//# sourceMappingURL=cli-errors.js.map