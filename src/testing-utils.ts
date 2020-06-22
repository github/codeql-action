import {TestInterface} from 'ava';

export function silenceDebugOutput(test: TestInterface<any>) {
  const typedTest = test as TestInterface<{write: any}>;

  typedTest.beforeEach(t => {
      const processStdoutWrite = process.stdout.write.bind(process.stdout);
      t.context.write = processStdoutWrite;
      process.stdout.write = (str: Uint8Array | string, encoding?: any, cb?: (err?: Error) => void) => {
          // Core library will directly call process.stdout.write for commands
          // We don't want debug output to be included in tests
          if (typeof str === "string") {
            str = str.replace(/::(info|debug|warning).*/, '');
            if (str.trim() !== "") {
                processStdoutWrite(str, encoding, cb);
            }
          } else {
            processStdoutWrite(str, encoding, cb);
          }
          return true;
      };
  });

  typedTest.afterEach(t => {
      process.stdout.write = t.context.write;
  });
}
