import test from "ava";
import * as sinon from "sinon";

import { CommandInvocationError } from "./actions-util";
import {
  CliError,
  CliConfigErrorCategory,
  wrapCliConfigurationError,
} from "./cli-errors";
import { setupTests } from "./testing-utils";
import { ConfigurationError } from "./util";

setupTests(test);

test("CliError constructor with fatal errors", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "finalize"],
    32,
    "Running TRAP import for CodeQL database...\nA fatal error occurred: Evaluator heap must be at least 384.00 MiB\nA fatal error occurred: Dataset import failed with code 2",
  );

  const cliError = new CliError(commandError);

  t.is(cliError.exitCode, 32);
  t.is(
    cliError.stderr,
    "Running TRAP import for CodeQL database...\nA fatal error occurred: Evaluator heap must be at least 384.00 MiB\nA fatal error occurred: Dataset import failed with code 2",
  );
  t.true(
    cliError.message.includes(
      "A fatal error occurred: Dataset import failed with code 2.",
    ),
  );
  t.true(
    cliError.message.includes(
      "Context: A fatal error occurred: Evaluator heap must be at least 384.00 MiB.",
    ),
  );
});

test("CliError constructor with single fatal error", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "create"],
    1,
    "A fatal error occurred: Out of memory",
  );

  const cliError = new CliError(commandError);

  t.is(cliError.exitCode, 1);
  t.true(cliError.message.includes("A fatal error occurred: Out of memory"));
  t.false(cliError.message.includes("Context:"));
});

test("CliError constructor with autobuild errors", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "create"],
    1,
    "[autobuild] [ERROR] Build failed\n[autobuild] [ERROR] Compilation error",
  );

  const cliError = new CliError(commandError);

  t.is(cliError.exitCode, 1);
  t.true(
    cliError.message.includes(
      "We were unable to automatically build your code",
    ),
  );
  t.true(cliError.message.includes("Build failed\nCompilation error"));
});

test("CliError constructor with truncated autobuild errors", (t) => {
  const stderr = Array.from(
    { length: 12 },
    (_, i) => `[autobuild] [ERROR] Error ${i + 1}`,
  ).join("\n");
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "create"],
    1,
    stderr,
  );

  const cliError = new CliError(commandError);

  t.true(cliError.message.includes("(truncated)"));
  // Should only include first 10 errors plus truncation message
  const errorLines = cliError.message
    .split("Encountered the following error: ")[1]
    .split("\n");
  t.is(errorLines.length, 11); // 10 errors + "(truncated)"
});

test("CliError constructor with generic error", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["version"],
    1,
    "Some generic error message\nLast line of error",
  );

  const cliError = new CliError(commandError);

  t.is(cliError.exitCode, 1);
  t.true(
    cliError.message.includes(
      'Encountered a fatal error while running "codeql version"',
    ),
  );
  t.true(
    cliError.message.includes(
      "Exit code was 1 and last log line was: Last line of error.",
    ),
  );
});

test("CliError constructor with empty stderr", (t) => {
  const commandError = new CommandInvocationError("codeql", ["version"], 1, "");

  const cliError = new CliError(commandError);

  t.true(cliError.message.includes("last log line was: n/a"));
});

for (const [platform, arch] of [
  ["weird_plat", "x64"],
  ["linux", "arm64"],
  ["win32", "arm64"],
]) {
  test(`wrapCliConfigurationError - ${platform}/${arch} unsupported`, (t) => {
    sinon.stub(process, "platform").value(platform);
    sinon.stub(process, "arch").value(arch);
    const commandError = new CommandInvocationError(
      "codeql",
      ["version"],
      1,
      "Some error",
    );
    const cliError = new CliError(commandError);

    const wrappedError = wrapCliConfigurationError(cliError);

    t.true(wrappedError instanceof ConfigurationError);
    t.true(
      wrappedError.message.includes(
        "CodeQL CLI does not support the platform/architecture combination",
      ),
    );
    t.true(wrappedError.message.includes(`${platform}/${arch}`));
  });
}

test("wrapCliConfigurationError - supported platform", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["version"],
    1,
    "Some error",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  // Should return the original error since platform is supported
  t.is(wrappedError, cliError);
});

test("wrapCliConfigurationError - autobuild error", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "create"],
    1,
    "We were unable to automatically build your code",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
  t.true(
    wrappedError.message.includes(
      "We were unable to automatically build your code",
    ),
  );
});

test("wrapCliConfigurationError - init called twice", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "create"],
    1,
    "Refusing to create databases /some/path but could not process any of it",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
  t.true(
    wrappedError.message.includes(
      'Is the "init" action called twice in the same job?',
    ),
  );
});

test("wrapCliConfigurationError - no source code seen by exit code", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "finalize"],
    32,
    "Some other error message",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
});

test("wrapCliConfigurationError - no source code seen by message", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "finalize"],
    1,
    "CodeQL detected code written in JavaScript but could not process any of it",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
});

test("wrapCliConfigurationError - out of memory error with additional message", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "analyze"],
    1,
    "CodeQL is out of memory.",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
  t.true(
    wrappedError.message.includes(
      "For more information, see https://gh.io/troubleshooting-code-scanning/out-of-disk-or-memory",
    ),
  );
});

test("wrapCliConfigurationError - gradle build failed", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "create"],
    1,
    "[autobuild] FAILURE: Build failed with an exception.",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
});

test("wrapCliConfigurationError - maven build failed", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "create"],
    1,
    "[autobuild] [ERROR] Failed to execute goal",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
});

test("wrapCliConfigurationError - swift build failed", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "create"],
    1,
    "[autobuilder/build] [build-command-failed] `autobuild` failed to run the build command",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
});

test("wrapCliConfigurationError - pack cannot be found", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["pack", "install"],
    1,
    "Query pack my-pack cannot be found. Check the spelling of the pack.",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
});

test("wrapCliConfigurationError - pack missing auth", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["pack", "download"],
    1,
    "GitHub Container registry returned 403 Forbidden",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
});

test("wrapCliConfigurationError - invalid config file", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["database", "create"],
    1,
    "Config file .codeql/config.yml is not valid",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
});

test("wrapCliConfigurationError - incompatible CLI version", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["version"],
    1,
    "is not compatible with this CodeQL CLI",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  t.true(wrappedError instanceof ConfigurationError);
});

test("wrapCliConfigurationError - unknown error remains unchanged", (t) => {
  const commandError = new CommandInvocationError(
    "codeql",
    ["version"],
    1,
    "Some unknown error that doesn't match any patterns",
  );
  const cliError = new CliError(commandError);

  const wrappedError = wrapCliConfigurationError(cliError);

  // Should return the original CliError since it doesn't match any known patterns
  t.is(wrappedError, cliError);
  t.true(wrappedError instanceof CliError);
  t.false(wrappedError instanceof ConfigurationError);
});

// Test all error categories to ensure they're properly configured
test("all CLI config error categories have valid configurations", (t) => {
  const allCategories = Object.values(CliConfigErrorCategory);

  for (const category of allCategories) {
    // Each category should be a string
    t.is(typeof category, "string");

    // Create a test error that matches this category
    let testError: CliError;

    switch (category) {
      case CliConfigErrorCategory.NoSourceCodeSeen:
        // This category matches by exit code
        testError = new CliError(
          new CommandInvocationError("codeql", [], 32, "some error"),
        );
        break;
      default:
        // For other categories, we'll test with a generic message that should not match
        testError = new CliError(
          new CommandInvocationError("codeql", [], 1, "generic error"),
        );
        break;
    }

    // The test should not throw an error when processing
    t.notThrows(() => wrapCliConfigurationError(testError));
  }
});
