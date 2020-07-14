import {TestInterface} from 'ava';
import sinon from 'sinon';

type TestContext = {stdoutWrite: any, stderrWrite: any, testOutput: string};

function wrapOutput(context: TestContext) {
  // Function signature taken from Socket.write.
  // Note there are two overloads:
  // write(buffer: Uint8Array | string, cb?: (err?: Error) => void): boolean;
  // write(str: Uint8Array | string, encoding?: string, cb?: (err?: Error) => void): boolean;
  return (chunk: Uint8Array | string, encoding?: string, cb?: (err?: Error) => void): boolean => {
    // Work out which method overload we are in
    if (cb === undefined && typeof encoding === 'function') {
      cb = encoding;
      encoding = undefined;
    }

    // Record the output
    if (typeof chunk === 'string') {
      context.testOutput += chunk;
    } else {
      context.testOutput += new TextDecoder(encoding || 'utf-8').decode(chunk);
    }

    // Satisfy contract by calling callback when done
    if (cb !== undefined && typeof cb === 'function') {
      cb();
    }

    return true;
  };
}

export function setupTests(test: TestInterface<any>) {
  const typedTest = test as TestInterface<TestContext>;

  typedTest.beforeEach(t => {
    t.context.testOutput = "";

    const processStdoutWrite = process.stdout.write.bind(process.stdout);
    t.context.stdoutWrite = processStdoutWrite;
    process.stdout.write = wrapOutput(t.context) as any;

    const processStderrWrite = process.stderr.write.bind(process.stderr);
    t.context.stderrWrite = processStderrWrite;
    process.stderr.write = wrapOutput(t.context) as any;
  });

  typedTest.afterEach.always(t => {
    process.stdout.write = t.context.stdoutWrite;
    process.stderr.write = t.context.stderrWrite;

    if (!t.passed) {
      process.stdout.write(t.context.testOutput);
    }
  });

  typedTest.afterEach.always(() => {
    sinon.restore();
  });
}
