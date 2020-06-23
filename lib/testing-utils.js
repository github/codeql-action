"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function wrapOutput(context) {
    return (str) => {
        if (typeof str === 'string') {
            context.testOutput += str;
        }
        return true;
    };
}
function silenceDebugOutput(test) {
    const typedTest = test;
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
exports.silenceDebugOutput = silenceDebugOutput;
//# sourceMappingURL=testing-utils.js.map