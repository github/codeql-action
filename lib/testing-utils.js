"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sinon_1 = __importDefault(require("sinon"));
function wrapOutput(context) {
    // Function signature taken from Socket.write.
    // Note there are two overloads:
    // write(buffer: Uint8Array | string, cb?: (err?: Error) => void): boolean;
    // write(str: Uint8Array | string, encoding?: string, cb?: (err?: Error) => void): boolean;
    return (chunk, encoding, cb) => {
        // Work out which method overload we are in
        if (cb === undefined && typeof encoding === 'function') {
            cb = encoding;
            encoding = undefined;
        }
        // Record the output
        if (typeof chunk === 'string') {
            context.testOutput += chunk;
        }
        else {
            context.testOutput += new TextDecoder(encoding || 'utf-8').decode(chunk);
        }
        // Satisfy contract by calling callback when done
        if (cb !== undefined && typeof cb === 'function') {
            cb();
        }
        return true;
    };
}
function setupTests(test) {
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
    typedTest.afterEach.always(() => {
        sinon_1.default.restore();
    });
}
exports.setupTests = setupTests;
//# sourceMappingURL=testing-utils.js.map