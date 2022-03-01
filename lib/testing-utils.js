"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockFeatureFlagApiEndpoint = exports.getRecordingLogger = exports.setupActionsVars = exports.setupTests = void 0;
const github = __importStar(require("@actions/github"));
const sinon = __importStar(require("sinon"));
const apiClient = __importStar(require("./api-client"));
const CodeQL = __importStar(require("./codeql"));
const util_1 = require("./util");
function wrapOutput(context) {
    // Function signature taken from Socket.write.
    // Note there are two overloads:
    // write(buffer: Uint8Array | string, cb?: (err?: Error) => void): boolean;
    // write(str: Uint8Array | string, encoding?: string, cb?: (err?: Error) => void): boolean;
    return (chunk, encoding, cb) => {
        // Work out which method overload we are in
        if (cb === undefined && typeof encoding === "function") {
            cb = encoding;
            encoding = undefined;
        }
        // Record the output
        if (typeof chunk === "string") {
            context.testOutput += chunk;
        }
        else {
            context.testOutput += new TextDecoder(encoding || "utf-8").decode(chunk);
        }
        // Satisfy contract by calling callback when done
        if (cb !== undefined && typeof cb === "function") {
            cb();
        }
        return true;
    };
}
function setupTests(test) {
    const typedTest = test;
    typedTest.beforeEach((t) => {
        // Set an empty CodeQL object so that all method calls will fail
        // unless the test explicitly sets one up.
        CodeQL.setCodeQL({});
        // Replace stdout and stderr so we can record output during tests
        t.context.testOutput = "";
        const processStdoutWrite = process.stdout.write.bind(process.stdout);
        t.context.stdoutWrite = processStdoutWrite;
        process.stdout.write = wrapOutput(t.context);
        const processStderrWrite = process.stderr.write.bind(process.stderr);
        t.context.stderrWrite = processStderrWrite;
        process.stderr.write = wrapOutput(t.context);
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
exports.setupTests = setupTests;
// Sets environment variables that make using some libraries designed for
// use only on actions safe to use outside of actions.
function setupActionsVars(tempDir, toolsDir) {
    process.env["RUNNER_TEMP"] = tempDir;
    process.env["RUNNER_TOOL_CACHE"] = toolsDir;
    process.env["GITHUB_WORKSPACE"] = tempDir;
}
exports.setupActionsVars = setupActionsVars;
function getRecordingLogger(messages) {
    return {
        debug: (message) => {
            messages.push({ type: "debug", message });
            console.debug(message);
        },
        info: (message) => {
            messages.push({ type: "info", message });
            console.info(message);
        },
        warning: (message) => {
            messages.push({ type: "warning", message });
            console.warn(message);
        },
        error: (message) => {
            messages.push({ type: "error", message });
            console.error(message);
        },
        isDebug: () => true,
        startGroup: () => undefined,
        endGroup: () => undefined,
    };
}
exports.getRecordingLogger = getRecordingLogger;
/** Mock the HTTP request to the feature flags enablement API endpoint. */
function mockFeatureFlagApiEndpoint(responseStatusCode, response) {
    // Passing an auth token is required, so we just use a dummy value
    const client = github.getOctokit("123");
    const requestSpy = sinon.stub(client, "request");
    const optInSpy = requestSpy.withArgs("GET /repos/:owner/:repo/code-scanning/codeql-action/features");
    if (responseStatusCode < 300) {
        optInSpy.resolves({
            status: responseStatusCode,
            data: response,
            headers: {},
            url: "GET /repos/:owner/:repo/code-scanning/codeql-action/features",
        });
    }
    else {
        optInSpy.throws(new util_1.HTTPError("some error message", responseStatusCode));
    }
    sinon.stub(apiClient, "getApiClient").value(() => client);
}
exports.mockFeatureFlagApiEndpoint = mockFeatureFlagApiEndpoint;
//# sourceMappingURL=testing-utils.js.map