"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
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
            for (const flag of Object.values(feature_flags_1.FeatureFlag)) {
                t.assert((await featureFlags.getValue(flag)) === false);
            }
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
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, {});
        for (const flag of Object.values(feature_flags_1.FeatureFlag)) {
            t.assert((await featureFlags.getValue(flag)) === false);
        }
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
            (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureFlags);
            const actualFeatureFlags = {
                database_uploads_enabled: await featureFlags.getValue(feature_flags_1.FeatureFlag.DatabaseUploadsEnabled),
                ml_powered_queries_enabled: await featureFlags.getValue(feature_flags_1.FeatureFlag.MlPoweredQueriesEnabled),
                uploads_domain_enabled: await featureFlags.getValue(feature_flags_1.FeatureFlag.UploadsDomainEnabled),
            };
            t.deepEqual(actualFeatureFlags, expectedFeatureFlags);
        });
    });
}
//# sourceMappingURL=feature-flags.test.js.map