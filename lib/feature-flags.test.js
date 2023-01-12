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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const defaults = __importStar(require("./defaults.json"));
const feature_flags_1 = require("./feature-flags");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
ava_1.default.beforeEach(() => {
    (0, util_1.initializeEnvironment)("1.2.3");
});
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
            const featureEnablement = setUpFeatureFlagTests(tmpDir, (0, testing_utils_1.getRecordingLogger)(loggedMessages), variant.gitHubVersion);
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
        const featureEnablement = setUpFeatureFlagTests(tmpDir, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
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
        const featureEnablement = setUpFeatureFlagTests(tmpDir, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, {});
        for (const feature of Object.values(feature_flags_1.Feature)) {
            t.assert((await featureEnablement.getValue(feature, includeCodeQlIfRequired(feature))) === false);
        }
        assertAllFeaturesUndefinedInApi(t, loggedMessages);
    });
});
(0, ava_1.default)("Feature flags exception is propagated if the API request errors", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const featureEnablement = setUpFeatureFlagTests(tmpDir);
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(500, {});
        await t.throwsAsync(async () => featureEnablement.getValue(feature_flags_1.Feature.MlPoweredQueriesEnabled, includeCodeQlIfRequired(feature_flags_1.Feature.MlPoweredQueriesEnabled)), {
            message: "Encountered an error while trying to determine feature enablement: Error: some error message",
        });
    });
});
for (const feature of Object.keys(feature_flags_1.featureConfig)) {
    (0, ava_1.default)(`Only feature '${feature}' is enabled if enabled in the API response. Other features disabled`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            const featureEnablement = setUpFeatureFlagTests(tmpDir);
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
            const featureEnablement = setUpFeatureFlagTests(tmpDir);
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
            const featureEnablement = setUpFeatureFlagTests(tmpDir);
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
                const featureEnablement = setUpFeatureFlagTests(tmpDir);
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
                const featureEnablement = setUpFeatureFlagTests(tmpDir);
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
(0, ava_1.default)("Feature flags are saved to disk", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const featureEnablement = setUpFeatureFlagTests(tmpDir);
        const expectedFeatureEnablement = initializeFeatures(true);
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        const cachedFeatureFlags = path.join(tmpDir, feature_flags_1.FEATURE_FLAGS_FILE_NAME);
        t.false(fs.existsSync(cachedFeatureFlags), "Feature flag cached file should not exist before getting feature flags");
        t.true(await featureEnablement.getValue(feature_flags_1.Feature.CliConfigFileEnabled, includeCodeQlIfRequired(feature_flags_1.Feature.CliConfigFileEnabled)), "Feature flag should be enabled initially");
        t.true(fs.existsSync(cachedFeatureFlags), "Feature flag cached file should exist after getting feature flags");
        const actualFeatureEnablement = JSON.parse(fs.readFileSync(cachedFeatureFlags, "utf8"));
        t.deepEqual(actualFeatureEnablement, expectedFeatureEnablement);
        // now test that we actually use the feature flag cache instead of the server
        actualFeatureEnablement[feature_flags_1.Feature.CliConfigFileEnabled] = false;
        fs.writeFileSync(cachedFeatureFlags, JSON.stringify(actualFeatureEnablement));
        // delete the in memory cache so that we are forced to use the cached file
        featureEnablement.gitHubFeatureFlags.cachedApiResponse = undefined;
        t.false(await featureEnablement.getValue(feature_flags_1.Feature.CliConfigFileEnabled, includeCodeQlIfRequired(feature_flags_1.Feature.CliConfigFileEnabled)), "Feature flag should be enabled after reading from cached file");
    });
});
(0, ava_1.default)("Environment variable can override feature flag cache", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const featureEnablement = setUpFeatureFlagTests(tmpDir);
        const expectedFeatureEnablement = initializeFeatures(true);
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        const cachedFeatureFlags = path.join(tmpDir, feature_flags_1.FEATURE_FLAGS_FILE_NAME);
        t.true(await featureEnablement.getValue(feature_flags_1.Feature.CliConfigFileEnabled, includeCodeQlIfRequired(feature_flags_1.Feature.CliConfigFileEnabled)), "Feature flag should be enabled initially");
        t.true(fs.existsSync(cachedFeatureFlags), "Feature flag cached file should exist after getting feature flags");
        process.env.CODEQL_PASS_CONFIG_TO_CLI = "false";
        t.false(await featureEnablement.getValue(feature_flags_1.Feature.CliConfigFileEnabled, includeCodeQlIfRequired(feature_flags_1.Feature.CliConfigFileEnabled)), "Feature flag should be disabled after setting env var");
    });
});
for (const variant of [util_1.GitHubVariant.GHAE, util_1.GitHubVariant.GHES]) {
    (0, ava_1.default)(`selects CLI from defaults.json on ${util_1.GitHubVariant[variant]}`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            const features = setUpFeatureFlagTests(tmpDir);
            t.deepEqual(await features.getDefaultCliVersion(variant), {
                cliVersion: defaults.cliVersion,
                tagName: defaults.bundleVersion,
                variant,
            });
        });
    });
}
(0, ava_1.default)("selects CLI v2.12.1 on Dotcom when feature flags enable v2.12.0 and v2.12.1", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const featureEnablement = setUpFeatureFlagTests(tmpDir);
        const expectedFeatureEnablement = initializeFeatures(true);
        expectedFeatureEnablement["default_codeql_version_2_12_0_enabled"] = true;
        expectedFeatureEnablement["default_codeql_version_2_12_1_enabled"] = true;
        expectedFeatureEnablement["default_codeql_version_2_12_2_enabled"] = false;
        expectedFeatureEnablement["default_codeql_version_2_12_3_enabled"] = false;
        expectedFeatureEnablement["default_codeql_version_2_12_4_enabled"] = false;
        expectedFeatureEnablement["default_codeql_version_2_12_5_enabled"] = false;
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        t.deepEqual(await featureEnablement.getDefaultCliVersion(util_1.GitHubVariant.DOTCOM), {
            cliVersion: "2.12.1",
            variant: util_1.GitHubVariant.DOTCOM,
        });
    });
});
(0, ava_1.default)(`selects CLI v2.11.6 on Dotcom when no default version feature flags are enabled`, async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const featureEnablement = setUpFeatureFlagTests(tmpDir);
        const expectedFeatureEnablement = initializeFeatures(true);
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        t.deepEqual(await featureEnablement.getDefaultCliVersion(util_1.GitHubVariant.DOTCOM), {
            cliVersion: "2.11.6",
            variant: util_1.GitHubVariant.DOTCOM,
        });
    });
});
(0, ava_1.default)("ignores invalid version numbers in default version feature flags", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const loggedMessages = [];
        const featureEnablement = setUpFeatureFlagTests(tmpDir, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        const expectedFeatureEnablement = initializeFeatures(true);
        expectedFeatureEnablement["default_codeql_version_2_12_0_enabled"] = true;
        expectedFeatureEnablement["default_codeql_version_2_12_1_enabled"] = true;
        expectedFeatureEnablement["default_codeql_version_2_12_invalid_enabled"] =
            true;
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        t.deepEqual(await featureEnablement.getDefaultCliVersion(util_1.GitHubVariant.DOTCOM), {
            cliVersion: "2.12.1",
            variant: util_1.GitHubVariant.DOTCOM,
        });
        t.assert(loggedMessages.find((v) => v.type === "warning" &&
            v.message ===
                "Ignoring feature flag default_codeql_version_2_12_invalid_enabled as it does not specify a valid CodeQL version.") !== undefined);
    });
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
function setUpFeatureFlagTests(tmpDir, logger = (0, logging_1.getRunnerLogger)(true), gitHubVersion = { type: util_1.GitHubVariant.DOTCOM }) {
    (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
    return new feature_flags_1.Features(gitHubVersion, testRepositoryNwo, tmpDir, logger);
}
function includeCodeQlIfRequired(feature) {
    return feature_flags_1.featureConfig[feature].minimumVersion !== undefined
        ? (0, testing_utils_1.mockCodeQLVersion)("9.9.9")
        : undefined;
}
//# sourceMappingURL=feature-flags.test.js.map