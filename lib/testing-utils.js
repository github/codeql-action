"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestConfig = exports.mockBundleDownloadApi = exports.createFeatures = exports.mockCodeQLVersion = exports.makeVersionInfo = exports.mockLanguagesInRepo = exports.mockFeatureFlagApiEndpoint = exports.getRecordingLogger = exports.setupActionsVars = exports.setupTests = exports.LINKED_CLI_VERSION = exports.SAMPLE_DEFAULT_CLI_VERSION = exports.SAMPLE_DOTCOM_API_DETAILS = void 0;
const node_util_1 = require("node:util");
const path_1 = __importDefault(require("path"));
const github = __importStar(require("@actions/github"));
const nock_1 = __importDefault(require("nock"));
const sinon = __importStar(require("sinon"));
const apiClient = __importStar(require("./api-client"));
const codeql = __importStar(require("./codeql"));
const defaults = __importStar(require("./defaults.json"));
const util_1 = require("./util");
exports.SAMPLE_DOTCOM_API_DETAILS = {
    auth: "token",
    url: "https://github.com",
    apiURL: "https://api.github.com",
};
exports.SAMPLE_DEFAULT_CLI_VERSION = {
    cliVersion: "2.20.0",
    tagName: "codeql-bundle-v2.20.0",
};
exports.LINKED_CLI_VERSION = {
    cliVersion: defaults.cliVersion,
    tagName: defaults.bundleVersion,
};
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
            context.testOutput += new node_util_1.TextDecoder(encoding || "utf-8").decode(chunk);
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
        codeql.setCodeQL({});
        // Replace stdout and stderr so we can record output during tests
        t.context.testOutput = "";
        const processStdoutWrite = process.stdout.write.bind(process.stdout);
        t.context.stdoutWrite = processStdoutWrite;
        process.stdout.write = wrapOutput(t.context);
        const processStderrWrite = process.stderr.write.bind(process.stderr);
        t.context.stderrWrite = processStderrWrite;
        process.stderr.write = wrapOutput(t.context);
        // Workaround an issue in tests where the case insensitivity of the `$PATH`
        // environment variable on Windows isn't preserved, i.e. `process.env.PATH`
        // is not the same as `process.env.Path`.
        const pathKeys = Object.keys(process.env).filter((k) => k.toLowerCase() === "path");
        if (pathKeys.length > 0) {
            process.env.PATH = process.env[pathKeys[0]];
        }
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
        // Undo any modifications made by nock
        nock_1.default.cleanAll();
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
function mockLanguagesInRepo(languages) {
    const mockClient = sinon.stub(apiClient, "getApiClient");
    const listLanguages = sinon.stub().resolves({
        status: 200,
        data: languages.reduce((acc, lang) => {
            acc[lang] = 1;
            return acc;
        }, {}),
        headers: {},
        url: "GET /repos/:owner/:repo/languages",
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    mockClient.returns({
        rest: {
            repos: {
                listLanguages,
            },
        },
    });
    return listLanguages;
}
exports.mockLanguagesInRepo = mockLanguagesInRepo;
/**
 * Constructs a `VersionInfo` object for testing purposes only.
 */
const makeVersionInfo = (version, features) => ({
    version,
    features,
});
exports.makeVersionInfo = makeVersionInfo;
function mockCodeQLVersion(version, features) {
    return codeql.setCodeQL({
        async getVersion() {
            return (0, exports.makeVersionInfo)(version, features);
        },
    });
}
exports.mockCodeQLVersion = mockCodeQLVersion;
/**
 * Create a feature enablement instance with the specified set of enabled features.
 *
 * This should be only used within tests.
 */
function createFeatures(enabledFeatures) {
    return {
        getDefaultCliVersion: async () => {
            throw new Error("not implemented");
        },
        getValue: async (feature) => {
            return enabledFeatures.includes(feature);
        },
    };
}
exports.createFeatures = createFeatures;
/**
 * Mocks the API for downloading the bundle tagged `tagName`.
 *
 * @returns the download URL for the bundle. This can be passed to the tools parameter of
 * `codeql.setupCodeQL`.
 */
function mockBundleDownloadApi({ apiDetails = exports.SAMPLE_DOTCOM_API_DETAILS, isPinned, repo = "github/codeql-action", platformSpecific = true, tagName, }) {
    const platform = process.platform === "win32"
        ? "win64"
        : process.platform === "linux"
            ? "linux64"
            : "osx64";
    const baseUrl = apiDetails?.url ?? "https://example.com";
    const relativeUrl = apiDetails
        ? `/${repo}/releases/download/${tagName}/codeql-bundle${platformSpecific ? `-${platform}` : ""}.tar.gz`
        : `/download/${tagName}/codeql-bundle.tar.gz`;
    (0, nock_1.default)(baseUrl)
        .get(relativeUrl)
        .replyWithFile(200, path_1.default.join(__dirname, `/../src/testdata/codeql-bundle${isPinned ? "-pinned" : ""}.tar.gz`));
    return `${baseUrl}${relativeUrl}`;
}
exports.mockBundleDownloadApi = mockBundleDownloadApi;
function createTestConfig(overrides) {
    return Object.assign({}, {
        languages: [],
        buildMode: undefined,
        originalUserInput: {},
        tempDir: "",
        codeQLCmd: "",
        gitHubVersion: {
            type: util_1.GitHubVariant.DOTCOM,
        },
        dbLocation: "",
        debugMode: false,
        debugArtifactName: util_1.DEFAULT_DEBUG_ARTIFACT_NAME,
        debugDatabaseName: util_1.DEFAULT_DEBUG_DATABASE_NAME,
        augmentationProperties: {
            packsInputCombines: false,
            queriesInputCombines: false,
        },
        trapCaches: {},
        trapCacheDownloadTime: 0,
    }, overrides);
}
exports.createTestConfig = createTestConfig;
//# sourceMappingURL=testing-utils.js.map