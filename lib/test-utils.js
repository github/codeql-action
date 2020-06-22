"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function silenceDebugOutput(test) {
    const typedTest = test;
    typedTest.beforeEach(t => {
        const processStdoutWrite = process.stdout.write.bind(process.stdout);
        t.context.write = processStdoutWrite;
        process.stdout.write = (str, encoding, cb) => {
            // Core library will directly call process.stdout.write for commands
            // We don't want :: commands to be executed by the runner during tests
            if (!str.match(/^::/)) {
                processStdoutWrite(str, encoding, cb);
            }
            return true;
        };
    });
    typedTest.afterEach(t => {
        process.stdout.write = t.context.write;
    });
}
exports.silenceDebugOutput = silenceDebugOutput;
//# sourceMappingURL=test-utils.js.map