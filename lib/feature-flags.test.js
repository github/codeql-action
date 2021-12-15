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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const github = __importStar(require("@actions/github"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const apiClient = __importStar(require("./api-client"));
const feature_flags_1 = require("./feature-flags");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
ava_1.default.beforeEach(() => {
    (0, util_1.initializeEnvironment)(util_1.Mode.actions, "1.2.3");
});
const testApiDetails = {
    auth: "1234",
    url: "https://github.com",
};
const testRepositoryNwo = (0, repository_1.parseRepositoryNwo)("github/example");
function mockHttpRequests(responseStatusCode, flags) {
    // Passing an auth token is required, so we just use a dummy value
    const client = github.getOctokit("123");
    const requestSpy = sinon.stub(client, "request");
    const optInSpy = requestSpy.withArgs("GET /repos/:owner/:repo/code-scanning/codeql-action/features");
    if (responseStatusCode < 300) {
        optInSpy.resolves({
            status: responseStatusCode,
            data: flags,
            headers: {},
            url: "GET /repos/:owner/:repo/code-scanning/codeql-action/features",
        });
    }
    else {
        optInSpy.throws(new util_1.HTTPError("some error message", responseStatusCode));
    }
    sinon.stub(apiClient, "getApiClient").value(() => client);
}
const ALL_FEATURE_FLAGS_DISABLED_VARIANTS = [
    {
        description: "GHES",
        gitHubVersion: { type: util_1.GitHubVariant.GHES, version: "3.0.0" },
    },
    { description: "GHAE", gitHubVersion: { type: util_1.GitHubVariant.GHAE } },
];
for (const variant of ALL_FEATURE_FLAGS_DISABLED_VARIANTS) {
    (0, ava_1.default)(`All feature flags are disabled if running against ${variant.description}`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
            const loggedMessages = [];
            const featureFlags = new feature_flags_1.GitHubFeatureFlags(variant.gitHubVersion, testApiDetails, testRepositoryNwo, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
            t.assert((await featureFlags.getDatabaseUploadsEnabled()) === false);
            t.assert((await featureFlags.getMlPoweredQueriesEnabled()) === false);
            t.assert((await featureFlags.getUploadsDomainEnabled()) === false);
            t.assert(loggedMessages.find((v) => v.type === "debug" &&
                v.message ===
                    "Not running against github.com. Disabling all feature flags.") !== undefined);
        });
    });
}
(0, ava_1.default)("Feature flags are disabled if they're not returned in API response", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const loggedMessages = [];
        const featureFlags = new feature_flags_1.GitHubFeatureFlags({ type: util_1.GitHubVariant.DOTCOM }, testApiDetails, testRepositoryNwo, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        mockHttpRequests(200, {});
        t.assert((await featureFlags.getDatabaseUploadsEnabled()) === false);
        t.assert((await featureFlags.getMlPoweredQueriesEnabled()) === false);
        t.assert((await featureFlags.getUploadsDomainEnabled()) === false);
        for (const featureFlag of [
            "database_uploads_enabled",
            "ml_powered_queries_enabled",
            "uploads_domain_enabled",
        ]) {
            t.assert(loggedMessages.find((v) => v.type === "debug" &&
                v.message ===
                    `Feature flag '${featureFlag}' undefined in API response, considering it disabled.`) !== undefined);
        }
    });
});
(0, ava_1.default)("Feature flags exception is propagated if the API request errors", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const featureFlags = new feature_flags_1.GitHubFeatureFlags({ type: util_1.GitHubVariant.DOTCOM }, testApiDetails, testRepositoryNwo, (0, logging_1.getRunnerLogger)(true));
        mockHttpRequests(500, {});
        await t.throwsAsync(async () => featureFlags.preloadFeatureFlags(), {
            message: "Encountered an error while trying to load feature flags: Error: some error message",
        });
    });
});
const FEATURE_FLAGS = [
    "database_uploads_enabled",
    "ml_powered_queries_enabled",
    "uploads_domain_enabled",
];
for (const featureFlag of FEATURE_FLAGS) {
    (0, ava_1.default)(`Feature flag '${featureFlag}' is enabled if enabled in the API response`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
            const featureFlags = new feature_flags_1.GitHubFeatureFlags({ type: util_1.GitHubVariant.DOTCOM }, testApiDetails, testRepositoryNwo, (0, logging_1.getRunnerLogger)(true));
            const expectedFeatureFlags = {};
            for (const f of FEATURE_FLAGS) {
                expectedFeatureFlags[f] = false;
            }
            expectedFeatureFlags[featureFlag] = true;
            mockHttpRequests(200, expectedFeatureFlags);
            const actualFeatureFlags = {
                database_uploads_enabled: await featureFlags.getDatabaseUploadsEnabled(),
                ml_powered_queries_enabled: await featureFlags.getMlPoweredQueriesEnabled(),
                uploads_domain_enabled: await featureFlags.getUploadsDomainEnabled(),
            };
            t.deepEqual(actualFeatureFlags, expectedFeatureFlags);
        });
    });
}
//# sourceMappingURL=feature-flags.test.js.map