import * as exec from "@actions/exec";
import test from "ava";

import { ErrorMatcher } from "./error-matcher";
import { setupTests } from "./testing-utils";
import { toolrunnerErrorCatcher } from "./toolrunner-error-catcher";

setupTests(test);

test("matchers are never applied if non-error exit", async (t) => {
  const testArgs = buildDummyArgs(
    "foo bar\\nblort qux",
    "foo bar\\nblort qux",
    "",
    0
  );

  const matchers: ErrorMatcher[] = [
    { exitCode: 123, outputRegex: new RegExp("foo bar"), message: "error!!!" },
  ];

  t.deepEqual(await exec.exec("node", testArgs), 0);

  t.deepEqual(await toolrunnerErrorCatcher("node", testArgs, matchers), 0);
});

test("regex matchers are applied to stdout for non-zero exit code", async (t) => {
  const testArgs = buildDummyArgs("foo bar\\nblort qux", "", "", 1);

  const matchers: ErrorMatcher[] = [
    { exitCode: 123, outputRegex: new RegExp("foo bar"), message: "🦄" },
  ];

  await t.throwsAsync(exec.exec("node", testArgs), {
    instanceOf: Error,
    message: /failed with exit code 1/,
  });

  await t.throwsAsync(toolrunnerErrorCatcher("node", testArgs, matchers), {
    instanceOf: Error,
    message: "🦄",
  });
});

test("regex matchers are applied to stderr for non-zero exit code", async (t) => {
  const testArgs = buildDummyArgs(
    "non matching string",
    "foo bar\\nblort qux",
    "",
    1
  );

  const matchers: ErrorMatcher[] = [
    { exitCode: 123, outputRegex: new RegExp("foo bar"), message: "🦄" },
  ];

  await t.throwsAsync(exec.exec("node", testArgs), {
    instanceOf: Error,
    message: /failed with exit code 1/,
  });

  await t.throwsAsync(toolrunnerErrorCatcher("node", testArgs, matchers), {
    instanceOf: Error,
    message: "🦄",
  });
});

test("matcher returns correct error message when multiple matchers defined", async (t) => {
  const testArgs = buildDummyArgs(
    "non matching string",
    "foo bar\\nblort qux",
    "",
    1
  );

  const matchers: ErrorMatcher[] = [
    { exitCode: 456, outputRegex: new RegExp("lorem ipsum"), message: "😩" },
    { exitCode: 123, outputRegex: new RegExp("foo bar"), message: "🦄" },
    { exitCode: 789, outputRegex: new RegExp("blah blah"), message: "🤦‍♂️" },
  ];

  await t.throwsAsync(exec.exec("node", testArgs), {
    instanceOf: Error,
    message: /failed with exit code 1/,
  });

  await t.throwsAsync(toolrunnerErrorCatcher("node", testArgs, matchers), {
    instanceOf: Error,
    message: "🦄",
  });
});

test("matcher returns first match to regex when multiple matches", async (t) => {
  const testArgs = buildDummyArgs(
    "non matching string",
    "foo bar\\nblort qux",
    "",
    1
  );

  const matchers: ErrorMatcher[] = [
    { exitCode: 123, outputRegex: new RegExp("foo bar"), message: "🦄" },
    { exitCode: 789, outputRegex: new RegExp("blah blah"), message: "🤦‍♂️" },
    { exitCode: 987, outputRegex: new RegExp("foo bar"), message: "🚫" },
  ];

  await t.throwsAsync(exec.exec("node", testArgs), {
    instanceOf: Error,
    message: /failed with exit code 1/,
  });

  await t.throwsAsync(toolrunnerErrorCatcher("node", testArgs, matchers), {
    instanceOf: Error,
    message: "🦄",
  });
});

test("exit code matchers are applied", async (t) => {
  const testArgs = buildDummyArgs(
    "non matching string",
    "foo bar\\nblort qux",
    "",
    123
  );

  const matchers: ErrorMatcher[] = [
    {
      exitCode: 123,
      outputRegex: new RegExp("this will not match"),
      message: "🦄",
    },
  ];

  await t.throwsAsync(exec.exec("node", testArgs), {
    instanceOf: Error,
    message: /failed with exit code 123/,
  });

  await t.throwsAsync(toolrunnerErrorCatcher("node", testArgs, matchers), {
    instanceOf: Error,
    message: "🦄",
  });
});

test("execErrorCatcher respects the ignoreReturnValue option", async (t) => {
  const testArgs = buildDummyArgs("standard output", "error output", "", 199);

  await t.throwsAsync(
    toolrunnerErrorCatcher("node", testArgs, [], { ignoreReturnCode: false }),
    { instanceOf: Error }
  );

  t.deepEqual(
    await toolrunnerErrorCatcher("node", testArgs, [], {
      ignoreReturnCode: true,
    }),
    199
  );
});

test("execErrorCatcher preserves behavior of provided listeners", async (t) => {
  const stdoutExpected = "standard output";
  const stderrExpected = "error output";

  let stdoutActual = "";
  let stderrActual = "";

  const listeners = {
    stdout: (data: Buffer) => {
      stdoutActual += data.toString();
    },
    stderr: (data: Buffer) => {
      stderrActual += data.toString();
    },
  };

  const testArgs = buildDummyArgs(stdoutExpected, stderrExpected, "", 0);

  t.deepEqual(
    await toolrunnerErrorCatcher("node", testArgs, [], {
      listeners,
    }),
    0
  );

  t.deepEqual(stdoutActual, `${stdoutExpected}\n`);
  t.deepEqual(stderrActual, `${stderrExpected}\n`);
});

function buildDummyArgs(
  stdoutContents: string,
  stderrContents: string,
  desiredErrorMessage?: string,
  desiredExitCode?: number
): string[] {
  let command = "";

  if (stdoutContents) command += `console.log("${stdoutContents}");`;
  if (stderrContents) command += `console.error("${stderrContents}");`;

  if (command.length === 0)
    throw new Error("Must provide contents for either stdout or stderr");

  if (desiredErrorMessage)
    command += `throw new Error("${desiredErrorMessage}");`;
  if (desiredExitCode) command += `process.exitCode = ${desiredExitCode};`;

  return ["-e", command];
}
