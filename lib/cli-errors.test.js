"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const actions_util_1 = require("./actions-util");
const cli_errors_1 = require("./cli-errors");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
// Helper function to create CommandInvocationError for testing
function createCommandInvocationError(cmd, args, exitCode, stderr, stdout = "") {
    return new actions_util_1.CommandInvocationError(cmd, args, exitCode, stderr, stdout);
}
(0, ava_1.default)("CliError constructor with fatal errors", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "finalize"], 32, "Running TRAP import for CodeQL database...\nA fatal error occurred: Evaluator heap must be at least 384.00 MiB\nA fatal error occurred: Dataset import failed with code 2");
    const cliError = new cli_errors_1.CliError(commandError);
    t.is(cliError.exitCode, 32);
    t.is(cliError.stderr, "Running TRAP import for CodeQL database...\nA fatal error occurred: Evaluator heap must be at least 384.00 MiB\nA fatal error occurred: Dataset import failed with code 2");
    t.true(cliError.message.includes("A fatal error occurred: Dataset import failed with code 2."));
    t.true(cliError.message.includes("Context: A fatal error occurred: Evaluator heap must be at least 384.00 MiB."));
});
(0, ava_1.default)("CliError constructor with single fatal error", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "create"], 1, "A fatal error occurred: Out of memory");
    const cliError = new cli_errors_1.CliError(commandError);
    t.is(cliError.exitCode, 1);
    t.true(cliError.message.includes("A fatal error occurred: Out of memory"));
    t.false(cliError.message.includes("Context:"));
});
(0, ava_1.default)("CliError constructor with autobuild errors", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "create"], 1, "[autobuild] [ERROR] Build failed\n[autobuild] [ERROR] Compilation error");
    const cliError = new cli_errors_1.CliError(commandError);
    t.is(cliError.exitCode, 1);
    t.true(cliError.message.includes("We were unable to automatically build your code"));
    t.true(cliError.message.includes("Build failed\nCompilation error"));
});
(0, ava_1.default)("CliError constructor with truncated autobuild errors", (t) => {
    const stderr = Array.from({ length: 12 }, (_, i) => `[autobuild] [ERROR] Error ${i + 1}`).join("\n");
    const commandError = createCommandInvocationError("codeql", ["database", "create"], 1, stderr);
    const cliError = new cli_errors_1.CliError(commandError);
    t.true(cliError.message.includes("(truncated)"));
    // Should only include first 10 errors plus truncation message
    const errorLines = cliError.message
        .split("Encountered the following error: ")[1]
        .split("\n");
    t.is(errorLines.length, 11); // 10 errors + "(truncated)"
});
(0, ava_1.default)("CliError constructor with generic error", (t) => {
    const commandError = createCommandInvocationError("codeql", ["version"], 1, "Some generic error message\nLast line of error");
    const cliError = new cli_errors_1.CliError(commandError);
    t.is(cliError.exitCode, 1);
    t.true(cliError.message.includes('Encountered a fatal error while running "codeql version"'));
    t.true(cliError.message.includes("Exit code was 1 and last log line was: Last line of error."));
});
(0, ava_1.default)("CliError constructor with empty stderr", (t) => {
    const commandError = createCommandInvocationError("codeql", ["version"], 1, "");
    const cliError = new cli_errors_1.CliError(commandError);
    t.true(cliError.message.includes("last log line was: n/a"));
});
(0, ava_1.default)("wrapCliConfigurationError - unsupported platform", (t) => {
    const originalPlatform = process.platform;
    const originalArch = process.arch;
    try {
        // Mock unsupported platform/arch
        Object.defineProperty(process, "platform", { value: "unsupported" });
        Object.defineProperty(process, "arch", { value: "unsupported" });
        const commandError = createCommandInvocationError("codeql", ["version"], 1, "Some error");
        const cliError = new cli_errors_1.CliError(commandError);
        const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
        t.true(wrappedError instanceof util_1.ConfigurationError);
        t.true(wrappedError.message.includes("CodeQL CLI does not support the platform/architecture combination"));
        t.true(wrappedError.message.includes("unsupported/unsupported"));
    }
    finally {
        // Restore original values
        Object.defineProperty(process, "platform", { value: originalPlatform });
        Object.defineProperty(process, "arch", { value: originalArch });
    }
});
(0, ava_1.default)("wrapCliConfigurationError - supported platform", (t) => {
    const commandError = createCommandInvocationError("codeql", ["version"], 1, "Some error");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    // Should return the original error since platform is supported
    t.is(wrappedError, cliError);
});
(0, ava_1.default)("wrapCliConfigurationError - autobuild error", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "create"], 1, "We were unable to automatically build your code");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
    t.true(wrappedError.message.includes("We were unable to automatically build your code"));
});
(0, ava_1.default)("wrapCliConfigurationError - init called twice", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "create"], 1, "Refusing to create databases /some/path but could not process any of it");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
    t.true(wrappedError.message.includes('Is the "init" action called twice in the same job?'));
});
(0, ava_1.default)("wrapCliConfigurationError - no source code seen by exit code", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "finalize"], 32, "Some other error message");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
});
(0, ava_1.default)("wrapCliConfigurationError - no source code seen by message", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "finalize"], 1, "CodeQL detected code written in JavaScript but could not process any of it");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
});
(0, ava_1.default)("wrapCliConfigurationError - out of memory error with additional message", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "analyze"], 1, "CodeQL is out of memory.");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
    t.true(wrappedError.message.includes("For more information, see https://gh.io/troubleshooting-code-scanning/out-of-disk-or-memory"));
});
(0, ava_1.default)("wrapCliConfigurationError - gradle build failed", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "create"], 1, "[autobuild] FAILURE: Build failed with an exception.");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
});
(0, ava_1.default)("wrapCliConfigurationError - maven build failed", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "create"], 1, "[autobuild] [ERROR] Failed to execute goal");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
});
(0, ava_1.default)("wrapCliConfigurationError - swift build failed", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "create"], 1, "[autobuilder/build] [build-command-failed] `autobuild` failed to run the build command");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
});
(0, ava_1.default)("wrapCliConfigurationError - pack cannot be found", (t) => {
    const commandError = createCommandInvocationError("codeql", ["pack", "install"], 1, "Query pack my-pack cannot be found. Check the spelling of the pack.");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
});
(0, ava_1.default)("wrapCliConfigurationError - pack missing auth", (t) => {
    const commandError = createCommandInvocationError("codeql", ["pack", "download"], 1, "GitHub Container registry returned 403 Forbidden");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
});
(0, ava_1.default)("wrapCliConfigurationError - invalid config file", (t) => {
    const commandError = createCommandInvocationError("codeql", ["database", "create"], 1, "Config file .codeql/config.yml is not valid");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
});
(0, ava_1.default)("wrapCliConfigurationError - incompatible CLI version", (t) => {
    const commandError = createCommandInvocationError("codeql", ["version"], 1, "is not compatible with this CodeQL CLI");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    t.true(wrappedError instanceof util_1.ConfigurationError);
});
(0, ava_1.default)("wrapCliConfigurationError - unknown error remains unchanged", (t) => {
    const commandError = createCommandInvocationError("codeql", ["version"], 1, "Some unknown error that doesn't match any patterns");
    const cliError = new cli_errors_1.CliError(commandError);
    const wrappedError = (0, cli_errors_1.wrapCliConfigurationError)(cliError);
    // Should return the original CliError since it doesn't match any known patterns
    t.is(wrappedError, cliError);
    t.true(wrappedError instanceof cli_errors_1.CliError);
    t.false(wrappedError instanceof util_1.ConfigurationError);
});
// Test all error categories to ensure they're properly configured
(0, ava_1.default)("all CLI config error categories have valid configurations", (t) => {
    const allCategories = Object.values(cli_errors_1.CliConfigErrorCategory);
    for (const category of allCategories) {
        // Each category should be a string
        t.is(typeof category, "string");
        // Create a test error that matches this category
        let testError;
        switch (category) {
            case cli_errors_1.CliConfigErrorCategory.NoSourceCodeSeen:
                // This category matches by exit code
                testError = new cli_errors_1.CliError(createCommandInvocationError("codeql", [], 32, "some error"));
                break;
            default:
                // For other categories, we'll test with a generic message that should not match
                testError = new cli_errors_1.CliError(createCommandInvocationError("codeql", [], 1, "generic error"));
                break;
        }
        // The test should not throw an error when processing
        t.notThrows(() => (0, cli_errors_1.wrapCliConfigurationError)(testError));
    }
});
//# sourceMappingURL=cli-errors.test.js.map