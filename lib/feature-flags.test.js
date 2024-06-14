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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const defaults = __importStar(require("./defaults.json"));
const feature_flags_1 = require("./feature-flags");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const testing_utils_1 = require("./testing-utils");
const tools_features_1 = require("./tools-features");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
ava_1.default.beforeEach(() => {
    (0, util_1.initializeEnvironment)("1.2.3");
});
const testRepositoryNwo = (0, repository_1.parseRepositoryNwo)("github/example");
(0, ava_1.default)(`All features are disabled if running against GHES`, async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const loggedMessages = [];
        const features = setUpFeatureFlagTests(tmpDir, (0, testing_utils_1.getRecordingLogger)(loggedMessages), { type: util_1.GitHubVariant.GHES, version: "3.0.0" });
        for (const feature of Object.values(feature_flags_1.Feature)) {
            t.deepEqual(await features.getValue(feature, includeCodeQlIfRequired(feature)), feature_flags_1.featureConfig[feature].defaultValue);
        }
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message ===
                "Not running against github.com. Disabling all toggleable features.") !== undefined);
    });
});
(0, ava_1.default)("API response missing and features use default value", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const loggedMessages = [];
        const features = setUpFeatureFlagTests(tmpDir, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(403, {});
        for (const feature of Object.values(feature_flags_1.Feature)) {
            t.assert((await features.getValue(feature, includeCodeQlIfRequired(feature))) ===
                feature_flags_1.featureConfig[feature].defaultValue);
        }
        assertAllFeaturesUndefinedInApi(t, loggedMessages);
    });
});
(0, ava_1.default)("Features use default value if they're not returned in API response", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const loggedMessages = [];
        const features = setUpFeatureFlagTests(tmpDir, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, {});
        for (const feature of Object.values(feature_flags_1.Feature)) {
            t.assert((await features.getValue(feature, includeCodeQlIfRequired(feature))) ===
                feature_flags_1.featureConfig[feature].defaultValue);
        }
        assertAllFeaturesUndefinedInApi(t, loggedMessages);
    });
});
(0, ava_1.default)("Feature flags exception is propagated if the API request errors", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const features = setUpFeatureFlagTests(tmpDir);
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(500, {});
        const someFeature = Object.values(feature_flags_1.Feature)[0];
        await t.throwsAsync(async () => features.getValue(someFeature, includeCodeQlIfRequired(someFeature)), {
            message: "Encountered an error while trying to determine feature enablement: Error: some error message",
        });
    });
});
for (const feature of Object.keys(feature_flags_1.featureConfig)) {
    (0, ava_1.default)(`Only feature '${feature}' is enabled if enabled in the API response. Other features disabled`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            const features = setUpFeatureFlagTests(tmpDir);
            // set all features to false except the one we're testing
            const expectedFeatureEnablement = {};
            for (const f of Object.keys(feature_flags_1.featureConfig)) {
                expectedFeatureEnablement[f] = f === feature;
            }
            (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
            // retrieve the values of the actual features
            const actualFeatureEnablement = {};
            for (const f of Object.keys(feature_flags_1.featureConfig)) {
                actualFeatureEnablement[f] = await features.getValue(f, includeCodeQlIfRequired(f));
            }
            // All features should be false except the one we're testing
            t.deepEqual(actualFeatureEnablement, expectedFeatureEnablement);
        });
    });
    (0, ava_1.default)(`Only feature '${feature}' is enabled if the associated environment variable is true. Others disabled.`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            const features = setUpFeatureFlagTests(tmpDir);
            const expectedFeatureEnablement = initializeFeatures(false);
            (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
            // feature should be disabled initially
            t.assert(!(await features.getValue(feature, includeCodeQlIfRequired(feature))));
            // set env var to true and check that the feature is now enabled
            process.env[feature_flags_1.featureConfig[feature].envVar] = "true";
            t.assert(await features.getValue(feature, includeCodeQlIfRequired(feature)));
        });
    });
    (0, ava_1.default)(`Feature '${feature}' is disabled if the associated environment variable is false, even if enabled in API`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            const features = setUpFeatureFlagTests(tmpDir);
            const expectedFeatureEnablement = initializeFeatures(true);
            (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
            // feature should be enabled initially
            t.assert(await features.getValue(feature, includeCodeQlIfRequired(feature)));
            // set env var to false and check that the feature is now disabled
            process.env[feature_flags_1.featureConfig[feature].envVar] = "false";
            t.assert(!(await features.getValue(feature, includeCodeQlIfRequired(feature))));
        });
    });
    if (feature_flags_1.featureConfig[feature].minimumVersion !== undefined ||
        feature_flags_1.featureConfig[feature].toolsFeature !== undefined) {
        (0, ava_1.default)(`Getting feature '${feature} should throw if no codeql is provided`, async (t) => {
            await (0, util_1.withTmpDir)(async (tmpDir) => {
                const features = setUpFeatureFlagTests(tmpDir);
                const expectedFeatureEnablement = initializeFeatures(true);
                (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
                await t.throwsAsync(async () => features.getValue(feature), {
                    message: `Internal error: A ${feature_flags_1.featureConfig[feature].minimumVersion !== undefined
                        ? "minimum version"
                        : "required tools feature"} is specified for feature ${feature}, but no instance of CodeQL was provided.`,
                });
            });
        });
    }
    if (feature_flags_1.featureConfig[feature].minimumVersion !== undefined) {
        (0, ava_1.default)(`Feature '${feature}' is disabled if the minimum CLI version is below ${feature_flags_1.featureConfig[feature].minimumVersion}`, async (t) => {
            await (0, util_1.withTmpDir)(async (tmpDir) => {
                const features = setUpFeatureFlagTests(tmpDir);
                const expectedFeatureEnablement = initializeFeatures(true);
                (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
                // feature should be disabled when an old CLI version is set
                let codeql = (0, testing_utils_1.mockCodeQLVersion)("2.0.0");
                t.assert(!(await features.getValue(feature, codeql)));
                // even setting the env var to true should not enable the feature if
                // the minimum CLI version is not met
                process.env[feature_flags_1.featureConfig[feature].envVar] = "true";
                t.assert(!(await features.getValue(feature, codeql)));
                // feature should be enabled when a new CLI version is set
                // and env var is not set
                process.env[feature_flags_1.featureConfig[feature].envVar] = "";
                codeql = (0, testing_utils_1.mockCodeQLVersion)(feature_flags_1.featureConfig[feature].minimumVersion);
                t.assert(await features.getValue(feature, codeql));
                // set env var to false and check that the feature is now disabled
                process.env[feature_flags_1.featureConfig[feature].envVar] = "false";
                t.assert(!(await features.getValue(feature, codeql)));
            });
        });
    }
    if (feature_flags_1.featureConfig[feature].toolsFeature !== undefined) {
        (0, ava_1.default)(`Feature '${feature}' is disabled if the required tools feature is not enabled`, async (t) => {
            await (0, util_1.withTmpDir)(async (tmpDir) => {
                const features = setUpFeatureFlagTests(tmpDir);
                const expectedFeatureEnablement = initializeFeatures(true);
                (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
                // feature should be disabled when the required tools feature is not enabled
                let codeql = (0, testing_utils_1.mockCodeQLVersion)("2.0.0");
                t.assert(!(await features.getValue(feature, codeql)));
                // even setting the env var to true should not enable the feature if
                // the required tools feature is not enabled
                process.env[feature_flags_1.featureConfig[feature].envVar] = "true";
                t.assert(!(await features.getValue(feature, codeql)));
                // feature should be enabled when the required tools feature is enabled
                // and env var is not set
                process.env[feature_flags_1.featureConfig[feature].envVar] = "";
                codeql = (0, testing_utils_1.mockCodeQLVersion)("2.0.0", {
                    [feature_flags_1.featureConfig[feature].toolsFeature]: true,
                });
                t.assert(await features.getValue(feature, codeql));
                // set env var to false and check that the feature is now disabled
                process.env[feature_flags_1.featureConfig[feature].envVar] = "false";
                t.assert(!(await features.getValue(feature, codeql)));
            });
        });
    }
}
// If we ever run into a situation where we no longer have any features that
// specify a minimum version or required tools feature, then we will have a
// bunch of code no longer being tested. This is unlikely, and this test will
// fail if that happens.
// If we do end up in that situation, then we should consider adding a synthetic
// feature with a minimum version that is only used for tests.
(0, ava_1.default)("At least one feature has a minimum version specified", (t) => {
    t.assert(Object.values(feature_flags_1.featureConfig).some((f) => f.minimumVersion !== undefined), "At least one feature should have a minimum version specified");
    t.assert(Object.values(feature_flags_1.featureConfig).some((f) => f.toolsFeature !== undefined), "At least one feature should have a required tools feature specified");
    // An even less likely scenario is that we no longer have any features.
    t.assert(Object.values(feature_flags_1.featureConfig).length > 0, "There should be at least one feature");
});
(0, ava_1.default)("Feature flags are saved to disk", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const features = setUpFeatureFlagTests(tmpDir);
        const expectedFeatureEnablement = initializeFeatures(true);
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        const cachedFeatureFlags = path.join(tmpDir, feature_flags_1.FEATURE_FLAGS_FILE_NAME);
        t.false(fs.existsSync(cachedFeatureFlags), "Feature flag cached file should not exist before getting feature flags");
        t.true(await features.getValue(feature_flags_1.Feature.QaTelemetryEnabled, includeCodeQlIfRequired(feature_flags_1.Feature.QaTelemetryEnabled)), "Feature flag should be enabled initially");
        t.true(fs.existsSync(cachedFeatureFlags), "Feature flag cached file should exist after getting feature flags");
        const actualFeatureEnablement = JSON.parse(fs.readFileSync(cachedFeatureFlags, "utf8"));
        t.deepEqual(actualFeatureEnablement, expectedFeatureEnablement);
        // now test that we actually use the feature flag cache instead of the server
        actualFeatureEnablement[feature_flags_1.Feature.QaTelemetryEnabled] = false;
        fs.writeFileSync(cachedFeatureFlags, JSON.stringify(actualFeatureEnablement));
        // delete the in memory cache so that we are forced to use the cached file
        features.gitHubFeatureFlags.cachedApiResponse = undefined;
        t.false(await features.getValue(feature_flags_1.Feature.QaTelemetryEnabled, includeCodeQlIfRequired(feature_flags_1.Feature.QaTelemetryEnabled)), "Feature flag should be enabled after reading from cached file");
    });
});
(0, ava_1.default)("Environment variable can override feature flag cache", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const features = setUpFeatureFlagTests(tmpDir);
        const expectedFeatureEnablement = initializeFeatures(true);
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        const cachedFeatureFlags = path.join(tmpDir, feature_flags_1.FEATURE_FLAGS_FILE_NAME);
        t.true(await features.getValue(feature_flags_1.Feature.QaTelemetryEnabled, includeCodeQlIfRequired(feature_flags_1.Feature.QaTelemetryEnabled)), "Feature flag should be enabled initially");
        t.true(fs.existsSync(cachedFeatureFlags), "Feature flag cached file should exist after getting feature flags");
        process.env.CODEQL_ACTION_QA_TELEMETRY = "false";
        t.false(await features.getValue(feature_flags_1.Feature.QaTelemetryEnabled, includeCodeQlIfRequired(feature_flags_1.Feature.QaTelemetryEnabled)), "Feature flag should be disabled after setting env var");
    });
});
(0, ava_1.default)(`selects CLI from defaults.json on GHES`, async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const features = setUpFeatureFlagTests(tmpDir);
        const defaultCliVersion = await features.getDefaultCliVersion(util_1.GitHubVariant.GHES);
        t.deepEqual(defaultCliVersion, {
            cliVersion: defaults.cliVersion,
            tagName: defaults.bundleVersion,
        });
    });
});
(0, ava_1.default)("selects CLI v2.20.1 on Dotcom when feature flags enable v2.20.0 and v2.20.1", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const features = setUpFeatureFlagTests(tmpDir);
        const expectedFeatureEnablement = initializeFeatures(true);
        expectedFeatureEnablement["default_codeql_version_2_20_0_enabled"] = true;
        expectedFeatureEnablement["default_codeql_version_2_20_1_enabled"] = true;
        expectedFeatureEnablement["default_codeql_version_2_20_2_enabled"] = false;
        expectedFeatureEnablement["default_codeql_version_2_20_3_enabled"] = false;
        expectedFeatureEnablement["default_codeql_version_2_20_4_enabled"] = false;
        expectedFeatureEnablement["default_codeql_version_2_20_5_enabled"] = false;
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        const defaultCliVersion = await features.getDefaultCliVersion(util_1.GitHubVariant.DOTCOM);
        t.deepEqual(defaultCliVersion, {
            cliVersion: "2.20.1",
            tagName: "codeql-bundle-v2.20.1",
            toolsFeatureFlagsValid: true,
        });
    });
});
(0, ava_1.default)("includes tag name when feature flags enable version greater than v2.13.4", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const features = setUpFeatureFlagTests(tmpDir);
        const expectedFeatureEnablement = initializeFeatures(true);
        expectedFeatureEnablement["default_codeql_version_2_20_0_enabled"] = true;
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        const defaultCliVersion = await features.getDefaultCliVersion(util_1.GitHubVariant.DOTCOM);
        t.deepEqual(defaultCliVersion, {
            cliVersion: "2.20.0",
            tagName: "codeql-bundle-v2.20.0",
            toolsFeatureFlagsValid: true,
        });
    });
});
(0, ava_1.default)(`selects CLI from defaults.json on Dotcom when no default version feature flags are enabled`, async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const features = setUpFeatureFlagTests(tmpDir);
        const expectedFeatureEnablement = initializeFeatures(true);
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        const defaultCliVersion = await features.getDefaultCliVersion(util_1.GitHubVariant.DOTCOM);
        t.deepEqual(defaultCliVersion, {
            cliVersion: defaults.cliVersion,
            tagName: defaults.bundleVersion,
            toolsFeatureFlagsValid: false,
        });
    });
});
(0, ava_1.default)(`selects CLI from defaults.json on Dotcom when default version feature flags are unsupported`, async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const features = setUpFeatureFlagTests(tmpDir);
        const expectedFeatureEnablement = initializeFeatures(true);
        // Doesn't have a semantically versioned bundle
        expectedFeatureEnablement["default_codeql_version_2_13_3_enabled"] = true;
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        const defaultCliVersion = await features.getDefaultCliVersion(util_1.GitHubVariant.DOTCOM);
        t.deepEqual(defaultCliVersion, {
            cliVersion: defaults.cliVersion,
            tagName: defaults.bundleVersion,
            toolsFeatureFlagsValid: false,
        });
    });
});
(0, ava_1.default)("ignores invalid version numbers in default version feature flags", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const loggedMessages = [];
        const features = setUpFeatureFlagTests(tmpDir, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        const expectedFeatureEnablement = initializeFeatures(true);
        expectedFeatureEnablement["default_codeql_version_2_20_0_enabled"] = true;
        expectedFeatureEnablement["default_codeql_version_2_20_1_enabled"] = true;
        expectedFeatureEnablement["default_codeql_version_2_20_invalid_enabled"] =
            true;
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, expectedFeatureEnablement);
        const defaultCliVersion = await features.getDefaultCliVersion(util_1.GitHubVariant.DOTCOM);
        t.deepEqual(defaultCliVersion, {
            cliVersion: "2.20.1",
            tagName: "codeql-bundle-v2.20.1",
            toolsFeatureFlagsValid: true,
        });
        t.assert(loggedMessages.find((v) => v.type === "warning" &&
            v.message ===
                "Ignoring feature flag default_codeql_version_2_20_invalid_enabled as it does not specify a valid CodeQL version.") !== undefined);
    });
});
(0, ava_1.default)("legacy feature flags should end with _enabled", async (t) => {
    for (const [feature, config] of Object.entries(feature_flags_1.featureConfig)) {
        if (config.legacyApi) {
            t.assert(feature.endsWith("_enabled"), `legacy feature ${feature} should end with '_enabled'`);
        }
    }
});
(0, ava_1.default)("non-legacy feature flags should not end with _enabled", async (t) => {
    for (const [feature, config] of Object.entries(feature_flags_1.featureConfig)) {
        if (!config.legacyApi) {
            t.false(feature.endsWith("_enabled"), `non-legacy feature ${feature} should not end with '_enabled'`);
        }
    }
});
function assertAllFeaturesUndefinedInApi(t, loggedMessages) {
    for (const feature of Object.keys(feature_flags_1.featureConfig)) {
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message.includes(feature) &&
            v.message.includes("undefined in API response")) !== undefined);
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
/**
 * Returns an argument to pass to `getValue` that if required includes a CodeQL object meeting the
 * minimum version or tool feature requirements specified by the feature.
 */
function includeCodeQlIfRequired(feature) {
    return feature_flags_1.featureConfig[feature].minimumVersion !== undefined ||
        feature_flags_1.featureConfig[feature].toolsFeature !== undefined
        ? (0, testing_utils_1.mockCodeQLVersion)("9.9.9", Object.fromEntries(Object.values(tools_features_1.ToolsFeature).map((v) => [v, true])))
        : undefined;
}
//# sourceMappingURL=feature-flags.test.js.map