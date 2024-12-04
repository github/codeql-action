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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const feature_flags_test_1 = require("./feature-flags.test");
const logging_1 = require("./logging");
const setupCodeql = __importStar(require("./setup-codeql"));
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
// TODO: Remove when when we no longer need to pass in features (https://github.com/github/codeql-action/issues/2600)
const expectedFeatureEnablement = (0, feature_flags_test_1.initializeFeatures)(true);
expectedFeatureEnablement.getValue = function (feature) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return expectedFeatureEnablement[feature];
};
ava_1.default.beforeEach(() => {
    (0, util_1.initializeEnvironment)("1.2.3");
});
(0, ava_1.default)("parse codeql bundle url version", (t) => {
    t.deepEqual(setupCodeql.getCodeQLURLVersion("https://github.com/.../codeql-bundle-20200601/..."), "20200601");
});
(0, ava_1.default)("convert to semver", (t) => {
    const tests = {
        "20200601": "0.0.0-20200601",
        "20200601.0": "0.0.0-20200601.0",
        "20200601.0.0": "20200601.0.0",
        "1.2.3": "1.2.3",
        "1.2.3-alpha": "1.2.3-alpha",
        "1.2.3-beta.1": "1.2.3-beta.1",
    };
    for (const [version, expectedVersion] of Object.entries(tests)) {
        try {
            const parsedVersion = setupCodeql.convertToSemVer(version, (0, logging_1.getRunnerLogger)(true));
            t.deepEqual(parsedVersion, expectedVersion);
        }
        catch (e) {
            t.fail((0, util_1.getErrorMessage)(e));
        }
    }
});
(0, ava_1.default)("getCodeQLActionRepository", (t) => {
    const logger = (0, logging_1.getRunnerLogger)(true);
    (0, util_1.initializeEnvironment)("1.2.3");
    // isRunningLocalAction() === true
    delete process.env["GITHUB_ACTION_REPOSITORY"];
    process.env["RUNNER_TEMP"] = path.dirname(__dirname);
    const repoLocalRunner = setupCodeql.getCodeQLActionRepository(logger);
    t.deepEqual(repoLocalRunner, "github/codeql-action");
    // isRunningLocalAction() === false
    sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
    process.env["GITHUB_ACTION_REPOSITORY"] = "xxx/yyy";
    const repoEnv = setupCodeql.getCodeQLActionRepository(logger);
    t.deepEqual(repoEnv, "xxx/yyy");
});
(0, ava_1.default)("getCodeQLSource sets CLI version for a semver tagged bundle", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const tagName = "codeql-bundle-v1.2.3";
        (0, testing_utils_1.mockBundleDownloadApi)({ tagName });
        const source = await setupCodeql.getCodeQLSource(`https://github.com/github/codeql-action/releases/download/${tagName}/codeql-bundle-linux64.tar.gz`, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, util_1.GitHubVariant.DOTCOM, false, (0, logging_1.getRunnerLogger)(true));
        t.is(source.sourceType, "download");
        t.is(source["cliVersion"], "1.2.3");
    });
});
(0, ava_1.default)("getCodeQLSource correctly returns bundled CLI version when tools == linked", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource("linked", testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, util_1.GitHubVariant.DOTCOM, false, (0, logging_1.getRunnerLogger)(true));
        t.is(source.toolsVersion, testing_utils_1.LINKED_CLI_VERSION.cliVersion);
        t.is(source.sourceType, "download");
    });
});
(0, ava_1.default)("getCodeQLSource correctly returns bundled CLI version when tools == latest", async (t) => {
    const loggedMessages = [];
    const logger = (0, testing_utils_1.getRecordingLogger)(loggedMessages);
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource("latest", testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, util_1.GitHubVariant.DOTCOM, false, logger);
        // First, ensure that the CLI version is the linked version, so that backwards
        // compatibility is maintained.
        t.is(source.toolsVersion, testing_utils_1.LINKED_CLI_VERSION.cliVersion);
        t.is(source.sourceType, "download");
        // Afterwards, ensure that we see the deprecation message in the log.
        const expected_message = "`tools: latest` has been renamed to `tools: linked`, but the old name is still supported. No action is required.";
        t.assert(loggedMessages.some((msg) => typeof msg.message === "string" &&
            msg.message.includes(expected_message)));
    });
});
(0, ava_1.default)("setupCodeQLBundle logs the CodeQL CLI version being used when asked to use linked tools", async (t) => {
    const loggedMessages = [];
    const logger = (0, testing_utils_1.getRecordingLogger)(loggedMessages);
    // Stub the downloadCodeQL function to prevent downloading artefacts
    // during testing from being called.
    sinon.stub(setupCodeql, "downloadCodeQL").resolves({
        codeqlFolder: "codeql",
        statusReport: {
            combinedDurationMs: 500,
            compressionMethod: "gzip",
            downloadDurationMs: 200,
            extractionDurationMs: 300,
            streamExtraction: false,
            toolsUrl: "toolsUrl",
        },
        toolsVersion: testing_utils_1.LINKED_CLI_VERSION.cliVersion,
    });
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const result = await setupCodeql.setupCodeQLBundle("linked", testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, "tmp/codeql_action_test/", util_1.GitHubVariant.DOTCOM, expectedFeatureEnablement, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, logger);
        // Basic sanity check that the version we got back is indeed
        // the linked (default) CLI version.
        t.is(result.toolsVersion, testing_utils_1.LINKED_CLI_VERSION.cliVersion);
        // Ensure message logging CodeQL CLI version was present in user logs.
        const expected_message = `Using CodeQL CLI version ${testing_utils_1.LINKED_CLI_VERSION.cliVersion}`;
        t.assert(loggedMessages.some((msg) => typeof msg.message === "string" &&
            msg.message.includes(expected_message)));
    });
});
(0, ava_1.default)("setupCodeQLBundle logs the CodeQL CLI version being used when asked to download a non-default bundle", async (t) => {
    const loggedMessages = [];
    const logger = (0, testing_utils_1.getRecordingLogger)(loggedMessages);
    const bundleUrl = "https://github.com/github/codeql-action/releases/download/codeql-bundle-v2.16.0/codeql-bundle-linux64.tar.gz";
    const expectedVersion = "2.16.0";
    // Stub the downloadCodeQL function to prevent downloading artefacts
    // during testing from being called.
    sinon.stub(setupCodeql, "downloadCodeQL").resolves({
        codeqlFolder: "codeql",
        statusReport: {
            combinedDurationMs: 500,
            compressionMethod: "gzip",
            downloadDurationMs: 200,
            extractionDurationMs: 300,
            streamExtraction: false,
            toolsUrl: bundleUrl,
        },
        toolsVersion: expectedVersion,
    });
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const result = await setupCodeql.setupCodeQLBundle(bundleUrl, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, "tmp/codeql_action_test/", util_1.GitHubVariant.DOTCOM, expectedFeatureEnablement, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, logger);
        // Basic sanity check that the version we got back is indeed the version that the
        // bundle contains..
        t.is(result.toolsVersion, expectedVersion);
        // Ensure message logging CodeQL CLI version was present in user logs.
        const expected_message = `Using CodeQL CLI version 2.16.0 sourced from ${bundleUrl} .`;
        t.assert(loggedMessages.some((msg) => typeof msg.message === "string" &&
            msg.message.includes(expected_message)));
    });
});
(0, ava_1.default)('tryGetTagNameFromUrl extracts the right tag name for a repo name containing "codeql-bundle"', (t) => {
    t.is(setupCodeql.tryGetTagNameFromUrl("https://github.com/org/codeql-bundle-testing/releases/download/codeql-bundle-v2.19.0/codeql-bundle-linux64.tar.zst", (0, logging_1.getRunnerLogger)(true)), "codeql-bundle-v2.19.0");
});
//# sourceMappingURL=setup-codeql.test.js.map