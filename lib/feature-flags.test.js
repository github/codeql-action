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
    apiURL: undefined,
};
const testRepositoryNwo = (0, repository_1.parseRepositoryNwo)("github/example");
const ALL_FEATURES_DISABLED_VARIANTS = [
    {
        description: "GHES",
        gitHubVersion: { type: util_1.GitHubVariant.GHES, version: "3.0.0" },
    },
    { description: "GHAE", gitHubVersion: { type: util_1.GitHubVariant.GHAE } },
];
for (const variant of ALL_FEATURES_DISABLED_VARIANTS) {
    (0, ava_1.default)(`All features are disabled if running against ${variant.description}`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            const loggedMessages = [];
            const featureEnablement = setUpTests(tmpDir, (0, testing_utils_1.getRecordingLogger)(loggedMessages), variant.gitHubVersion);
            for (const feature of Object.values(feature_flags_1.Feature)) {
                t.false(await featureEnablement.getValue(feature, includeCodeQlIfRequired(feature)));
            }
            t.assert(loggedMessages.find((v) => v.type === "debug" &&
                v.message ===
                    "Not running against github.com. Disabling all toggleable features.") !== undefined);
        });
    });
}
(0, ava_1.default)("API response missing", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const loggedMessages = [];
        const featureEnablement = setUpTests(tmpDir, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(403, {});
        for (const feature of Object.values(feature_flags_1.Feature)) {
            t.assert((await featureEnablement.getValue(feature, includeCodeQlIfRequired(feature))) === false);
        }
        assertAllFeaturesUndefinedInApi(t, loggedMessages);
    });
});
(0, ava_1.default)("Features are disabled if they're not returned in API response", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const loggedMessages = [];
        const featureEnablement = setUpTests(tmpDir, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, {});
        for (const feature of Object.values(feature_flags_1.Feature)) {
            t.assert((await featureEnablement.getValue(feature, includeCodeQlIfRequired(feature))) === false);
        }
        assertAllFeaturesUndefinedInApi(t, loggedMessages);
    });
});
(0, ava_1.default)("Feature flags exception is propagated if the API request errors", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const featureEnablement = setUpTests(tmpDir);
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(500, {});
        await t.throwsAsync(async () => featureEnablement.getValue(feature_flags_1.Feature.MlPoweredQueriesEnabled, includeCodeQlIfRequired(feature_flags_1.Feature.MlPoweredQueriesEnabled)), {
            message: "Encountered an error while trying to determine feature enablement: Error: some error message",
        });
    });
});
for (const feature of Object.keys(feature_flags_1.featureConfig)) {
    (0, ava_1.default)(`Only feature '${feature}' is enabled if enabled in the API response. Other features disabled`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            const featureEnablement = setUpTests(tmpDir);
            // set all features to false except the one we're testing
            const expectedFeatureEnablement = {};
            for (const f of Object.keys(feature_flags_1.featureConfig)) {
                expectedFeatureEnablement[f] = f === feature;
            }
            (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
            // retrieve the values of the actual features
            const actualFeatureEnablement = {};
            for (const f of Object.keys(feature_flags_1.featureConfig)) {
                actualFeatureEnablement[f] = await featureEnablement.getValue(f, includeCodeQlIfRequired(f));
            }
            // All features should be false except the one we're testing
            t.deepEqual(actualFeatureEnablement, expectedFeatureEnablement);
        });
    });
    (0, ava_1.default)(`Only feature '${feature}' is enabled if the associated environment variable is true. Others disabled.`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            const featureEnablement = setUpTests(tmpDir);
            const expectedFeatureEnablement = initializeFeatures(false);
            (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
            // feature should be disabled initially
            t.assert(!(await featureEnablement.getValue(feature, includeCodeQlIfRequired(feature))));
            // set env var to true and check that the feature is now enabled
            process.env[feature_flags_1.featureConfig[feature].envVar] = "true";
            t.assert(await featureEnablement.getValue(feature, includeCodeQlIfRequired(feature)));
        });
    });
    (0, ava_1.default)(`Feature '${feature}' is disabled if the associated environment variable is false, even if enabled in API`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            const featureEnablement = setUpTests(tmpDir);
            const expectedFeatureEnablement = initializeFeatures(true);
            (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
            // feature should be enabled initially
            t.assert(await featureEnablement.getValue(feature, includeCodeQlIfRequired(feature)));
            // set env var to false and check that the feature is now disabled
            process.env[feature_flags_1.featureConfig[feature].envVar] = "false";
            t.assert(!(await featureEnablement.getValue(feature, includeCodeQlIfRequired(feature))));
        });
    });
    if (feature_flags_1.featureConfig[feature].minimumVersion !== undefined) {
        (0, ava_1.default)(`Getting feature '${feature} should throw if no codeql is provided`, async (t) => {
            await (0, util_1.withTmpDir)(async (tmpDir) => {
                const featureEnablement = setUpTests(tmpDir);
                const expectedFeatureEnablement = initializeFeatures(true);
                (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
                await t.throwsAsync(async () => featureEnablement.getValue(feature), {
                    message: `Internal error: A minimum version is specified for feature ${feature}, but no instance of CodeQL was provided.`,
                });
            });
        });
    }
    if (feature_flags_1.featureConfig[feature].minimumVersion !== undefined) {
        (0, ava_1.default)(`Feature '${feature}' is disabled if the minimum CLI version is below ${feature_flags_1.featureConfig[feature].minimumVersion}`, async (t) => {
            await (0, util_1.withTmpDir)(async (tmpDir) => {
                const featureEnablement = setUpTests(tmpDir);
                const expectedFeatureEnablement = initializeFeatures(true);
                (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
                // feature should be disabled when an old CLI version is set
                let codeql = (0, testing_utils_1.mockCodeQLVersion)("2.0.0");
                t.assert(!(await featureEnablement.getValue(feature, codeql)));
                // even setting the env var to true should not enable the feature if
                // the minimum CLI version is not met
                process.env[feature_flags_1.featureConfig[feature].envVar] = "true";
                t.assert(!(await featureEnablement.getValue(feature, codeql)));
                // feature should be enabled when a new CLI version is set
                // and env var is not set
                process.env[feature_flags_1.featureConfig[feature].envVar] = "";
                codeql = (0, testing_utils_1.mockCodeQLVersion)(feature_flags_1.featureConfig[feature].minimumVersion);
                t.assert(await featureEnablement.getValue(feature, codeql));
                // set env var to false and check that the feature is now disabled
                process.env[feature_flags_1.featureConfig[feature].envVar] = "false";
                t.assert(!(await featureEnablement.getValue(feature, codeql)));
            });
        });
    }
}
// If we ever run into a situation where we no longer have any features that
// specify a minimum version, then we will have a bunch of code no longer being
// tested. This is unlikely, and this test will fail if that happens.
// If we do end up in that situation, then we should consider adding a synthetic
// feature with a minimum version that is only used for tests.
(0, ava_1.default)("At least one feature has a minimum version specified", (t) => {
    t.assert(Object.values(feature_flags_1.featureConfig).some((f) => f.minimumVersion !== undefined), "At least one feature should have a minimum version specified");
    // An even less likely scenario is that we no longer have any features.
    t.assert(Object.values(feature_flags_1.featureConfig).length > 0, "There should be at least one feature");
});
function assertAllFeaturesUndefinedInApi(t, loggedMessages) {
    for (const feature of Object.keys(feature_flags_1.featureConfig)) {
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message.includes(feature) &&
            v.message.includes("considering it disabled")) !== undefined);
    }
}
function initializeFeatures(initialValue) {
    return Object.keys(feature_flags_1.featureConfig).reduce((features, key) => {
        features[key] = initialValue;
        return features;
    }, {});
}
function setUpTests(tmpDir, logger = (0, logging_1.getRunnerLogger)(true), gitHubVersion = { type: util_1.GitHubVariant.DOTCOM }) {
    (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
    return new feature_flags_1.Features(gitHubVersion, testApiDetails, testRepositoryNwo, logger);
}
function includeCodeQlIfRequired(feature) {
    return feature_flags_1.featureConfig[feature].minimumVersion !== undefined
        ? (0, testing_utils_1.mockCodeQLVersion)("9.9.9")
        : undefined;
}
//# sourceMappingURL=feature-flags.test.js.map