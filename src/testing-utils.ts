import { TestInterface } from "ava";
import sinon from "sinon";

import * as CodeQL from "./codeql";

type TestContext = {
  stdoutWrite: any;
  stderrWrite: any;
  testOutput: string;
  env: NodeJS.ProcessEnv;
};

function wrapOutput(context: TestContext) {
  // Function signature taken from Socket.write.
  // Note there are two overloads:
  // write(buffer: Uint8Array | string, cb?: (err?: Error) => void): boolean;
  // write(str: Uint8Array | string, encoding?: string, cb?: (err?: Error) => void): boolean;
  return (
    chunk: Uint8Array | string,
    encoding?: string,
    cb?: (err?: Error) => void
  ): boolean => {
    // Work out which method overload we are in
    if (cb === undefined && typeof encoding === "function") {
      cb = encoding;
      encoding = undefined;
    }

    // Record the output
    if (typeof chunk === "string") {
      context.testOutput += chunk;
    } else {
      context.testOutput += new TextDecoder(encoding || "utf-8").decode(chunk);
    }

    // Satisfy contract by calling callback when done
    if (cb !== undefined && typeof cb === "function") {
      cb();
    }

    return true;
  };
}

export function setupTests(test: TestInterface<any>) {
  const typedTest = test as TestInterface<TestContext>;

  typedTest.beforeEach((t) => {
    // Set an empty CodeQL object so that all method calls will fail
    // unless the test explicitly sets one up.
    CodeQL.setCodeQL({});

    // Replace stdout and stderr so we can record output during tests
    t.context.testOutput = "";
    const processStdoutWrite = process.stdout.write.bind(process.stdout);
    t.context.stdoutWrite = processStdoutWrite;
    process.stdout.write = wrapOutput(t.context) as any;
    const processStderrWrite = process.stderr.write.bind(process.stderr);
    t.context.stderrWrite = processStderrWrite;
    process.stderr.write = wrapOutput(t.context) as any;

    // Many tests modify environment variables. Take a copy now so that
    // we reset them after the test to keep tests independent of each other.
    // process.env only has strings fields, so a shallow copy is fine.
    t.context.env = {};
    Object.assign(t.context.env, process.env);
  });

  typedTest.afterEach.always((t) => {
    // Restore stdout and stderr
    // The captured output is only replayed if the test failed
    process.stdout.write = t.context.stdoutWrite;
    process.stderr.write = t.context.stderrWrite;
    if (!t.passed) {
      process.stdout.write(t.context.testOutput);
    }

    // Undo any modifications made by sinon
    sinon.restore();

    // Undo any modifications to the env
    process.env = t.context.env;
  });
}

// Sets environment variables that make using some libraries designed for
// use only on actions safe to use outside of actions.
export function setupActionsVars(tempDir: string, toolsDir: string) {
  process.env["RUNNER_TEMP"] = tempDir;
  process.env["RUNNER_TOOL_CACHE"] = toolsDir;
}
