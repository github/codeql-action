"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function silenceDebugOutput(test) {
    const typedTest = test;
    typedTest.beforeEach(t => {
        const processStdoutWrite = process.stdout.write.bind(process.stdout);
        t.context.write = processStdoutWrite;
        process.stdout.write = (str, encoding, cb) => {
            // Core library will directly call process.stdout.write for commands
            // We don't want debug output to be included in tests
            if (typeof str === "string") {
                str = str.replace(/::(info|debug|warning).*/, '');
                if (str.trim() !== "") {
                    processStdoutWrite(str, encoding, cb);
                }
            }
            else {
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
//# sourceMappingURL=testing-utils.js.map