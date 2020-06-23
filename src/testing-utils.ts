import {TestInterface} from 'ava';

type TestContext = {stdoutWrite: any, stderrWrite: any, testOutput: string};

function wrapOutput(context: TestContext) {
  return (str: any): boolean => {
    if (typeof str === 'string') {
      context.testOutput += str;
    }
    return true;
  }
}

export function silenceDebugOutput(test: TestInterface<any>) {
  const typedTest = test as TestInterface<TestContext>;

  typedTest.beforeEach(t => {
      t.context.testOutput = "";

      const processStdoutWrite = process.stdout.write.bind(process.stdout);
      t.context.stdoutWrite = processStdoutWrite;
      process.stdout.write = wrapOutput(t.context);

      const processStderrWrite = process.stderr.write.bind(process.stderr);
      t.context.stderrWrite = processStderrWrite;
      process.stderr.write = wrapOutput(t.context);
  });

  typedTest.afterEach.always(t => {
      process.stdout.write = t.context.stdoutWrite;
      process.stderr.write = t.context.stderrWrite;

      if (!t.passed) {
        process.stdout.write(t.context.testOutput);
      }
  });
}
