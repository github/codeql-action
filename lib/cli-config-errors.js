"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCliConfigurationError = exports.isCliConfigurationError = exports.cliErrorsConfig = exports.CliErrorCategory = void 0;
/** Error messages from the CLI that we handle specially. */
var CliErrorCategory;
(function (CliErrorCategory) {
    CliErrorCategory[CliErrorCategory["IncompatibleWithActionVersion"] = 0] = "IncompatibleWithActionVersion";
    CliErrorCategory[CliErrorCategory["InitCalledTwice"] = 1] = "InitCalledTwice";
    CliErrorCategory[CliErrorCategory["InvalidSourceRoot"] = 2] = "InvalidSourceRoot";
    CliErrorCategory[CliErrorCategory["NoJavaScriptTypeScriptCodeFound"] = 3] = "NoJavaScriptTypeScriptCodeFound";
})(CliErrorCategory || (exports.CliErrorCategory = CliErrorCategory = {}));
/**
 * All of our caught CLI error messages that we handle specially: ie. if we
 * would like to categorize an error as a configuration error or not.
 */
exports.cliErrorsConfig = {
    // Version of CodeQL CLI is incompatible with this version of the CodeQL Action
    [CliErrorCategory.IncompatibleWithActionVersion]: {
        cliErrorMessageSnippets: ["is not compatible with this CodeQL CLI"],
    },
    [CliErrorCategory.InitCalledTwice]: {
        cliErrorMessageSnippets: [
            "Refusing to create databases",
            "exists and is not an empty directory",
        ],
        actionErrorMessage: `Is the "init" action called twice in the same job?`,
        appendCliErrorToActionError: true,
    },
    // Expected source location for database creation does not exist
    [CliErrorCategory.InvalidSourceRoot]: {
        cliErrorMessageSnippets: ["Invalid source root"],
    },
    /**
     * Earlier versions of the JavaScript extractor (pre-CodeQL 2.12.0) extract externs even if no
     * source code was found. This means that we don't get the no code found error from
     * `codeql database finalize`. To ensure users get a good error message, we detect this manually
     * here, and upon detection override the error message.
     *
     * This can be removed once support for CodeQL 2.11.6 is removed.
     */
    [CliErrorCategory.NoJavaScriptTypeScriptCodeFound]: {
        exitCode: 32,
        cliErrorMessageSnippets: ["No JavaScript or TypeScript code found."],
        actionErrorMessage: "No code found during the build. Please see: " +
            "https://gh.io/troubleshooting-code-scanning/no-source-code-seen-during-build",
        appendCliErrorToActionError: false,
    },
};
/**
 * Checks whether or not the error message received from the CLI is a config
 * error. Returns true as long as either of the conditions holds: the exit
 * codes are a match, or the error message matches the expected message snippets.
 */
function isCliConfigurationError(cliError, cliErrorMessage, exitCode) {
    const cliErrorConfig = exports.cliErrorsConfig[cliError];
    if (exitCode !== undefined &&
        cliErrorConfig.exitCode !== undefined &&
        exitCode === cliErrorConfig.exitCode) {
        return true;
    }
    for (const e of cliErrorConfig.cliErrorMessageSnippets) {
        if (!cliErrorMessage.includes(e)) {
            return false;
        }
    }
    return true;
}
exports.isCliConfigurationError = isCliConfigurationError;
/**
 * Returns the error message that the Action should return in case of this CLI error. If no
 * `actionErrorMessage` was defined, return the original CLI error. Otherwise, return the
 * `actionErrorMessage` with the CLI error message appended, depending on the value of
 * `appendCliErrorToActionError` in `cliErrorsConfig`.
 */
function processCliConfigurationError(cliError, cliErrorMessage) {
    const cliErrorConfig = exports.cliErrorsConfig[cliError];
    if (cliErrorConfig === undefined ||
        cliErrorConfig.actionErrorMessage === undefined) {
        return cliErrorMessage;
    }
    // Append the CLI error message by default.
    return cliErrorConfig.appendCliErrorToActionError === false
        ? cliErrorConfig.actionErrorMessage
        : cliErrorConfig.actionErrorMessage + cliErrorMessage;
}
exports.processCliConfigurationError = processCliConfigurationError;
//# sourceMappingURL=cli-config-errors.js.map