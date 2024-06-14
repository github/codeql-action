import * as fs from "fs";
import * as path from "path";

import test, { ExecutionContext } from "ava";

import * as defaults from "./defaults.json";
import {
  Feature,
  featureConfig,
  FeatureEnablement,
  Features,
  FEATURE_FLAGS_FILE_NAME,
} from "./feature-flags";
import { getRunnerLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import {
  getRecordingLogger,
  LoggedMessage,
  mockCodeQLVersion,
  mockFeatureFlagApiEndpoint,
  setupActionsVars,
  setupTests,
} from "./testing-utils";
import { ToolsFeature } from "./tools-features";
import * as util from "./util";
import { GitHubVariant, initializeEnvironment, withTmpDir } from "./util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment("1.2.3");
});

const testRepositoryNwo = parseRepositoryNwo("github/example");

test(`All features are disabled if running against GHES`, async (t) => {
  await withTmpDir(async (tmpDir) => {
    const loggedMessages = [];
    const features = setUpFeatureFlagTests(
      tmpDir,
      getRecordingLogger(loggedMessages),
      { type: GitHubVariant.GHES, version: "3.0.0" },
    );

    for (const feature of Object.values(Feature)) {
      t.deepEqual(
        await features.getValue(feature, includeCodeQlIfRequired(feature)),
        featureConfig[feature].defaultValue,
      );
    }

    t.assert(
      loggedMessages.find(
        (v: LoggedMessage) =>
          v.type === "debug" &&
          v.message ===
            "Not running against github.com. Disabling all toggleable features.",
      ) !== undefined,
    );
  });
});

test("API response missing and features use default value", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const loggedMessages: LoggedMessage[] = [];
    const features = setUpFeatureFlagTests(
      tmpDir,
      getRecordingLogger(loggedMessages),
    );

    mockFeatureFlagApiEndpoint(403, {});

    for (const feature of Object.values(Feature)) {
      t.assert(
        (await features.getValue(feature, includeCodeQlIfRequired(feature))) ===
          featureConfig[feature].defaultValue,
      );
    }
    assertAllFeaturesUndefinedInApi(t, loggedMessages);
  });
});

test("Features use default value if they're not returned in API response", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const loggedMessages: LoggedMessage[] = [];
    const features = setUpFeatureFlagTests(
      tmpDir,
      getRecordingLogger(loggedMessages),
    );

    mockFeatureFlagApiEndpoint(200, {});

    for (const feature of Object.values(Feature)) {
      t.assert(
        (await features.getValue(feature, includeCodeQlIfRequired(feature))) ===
          featureConfig[feature].defaultValue,
      );
    }

    assertAllFeaturesUndefinedInApi(t, loggedMessages);
  });
});

test("Feature flags exception is propagated if the API request errors", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const features = setUpFeatureFlagTests(tmpDir);

    mockFeatureFlagApiEndpoint(500, {});

    const someFeature = Object.values(Feature)[0];

    await t.throwsAsync(
      async () =>
        features.getValue(someFeature, includeCodeQlIfRequired(someFeature)),
      {
        message:
          "Encountered an error while trying to determine feature enablement: Error: some error message",
      },
    );
  });
});

for (const feature of Object.keys(featureConfig)) {
  test(`Only feature '${feature}' is enabled if enabled in the API response. Other features disabled`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const features = setUpFeatureFlagTests(tmpDir);

      // set all features to false except the one we're testing
      const expectedFeatureEnablement: { [feature: string]: boolean } = {};
      for (const f of Object.keys(featureConfig)) {
        expectedFeatureEnablement[f] = f === feature;
      }
      mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

      // retrieve the values of the actual features
      const actualFeatureEnablement: { [feature: string]: boolean } = {};
      for (const f of Object.keys(featureConfig)) {
        actualFeatureEnablement[f] = await features.getValue(
          f as Feature,
          includeCodeQlIfRequired(f),
        );
      }

      // All features should be false except the one we're testing
      t.deepEqual(actualFeatureEnablement, expectedFeatureEnablement);
    });
  });

  test(`Only feature '${feature}' is enabled if the associated environment variable is true. Others disabled.`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const features = setUpFeatureFlagTests(tmpDir);

      const expectedFeatureEnablement = initializeFeatures(false);
      mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

      // feature should be disabled initially
      t.assert(
        !(await features.getValue(
          feature as Feature,
          includeCodeQlIfRequired(feature),
        )),
      );

      // set env var to true and check that the feature is now enabled
      process.env[featureConfig[feature].envVar] = "true";
      t.assert(
        await features.getValue(
          feature as Feature,
          includeCodeQlIfRequired(feature),
        ),
      );
    });
  });

  test(`Feature '${feature}' is disabled if the associated environment variable is false, even if enabled in API`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const features = setUpFeatureFlagTests(tmpDir);

      const expectedFeatureEnablement = initializeFeatures(true);
      mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

      // feature should be enabled initially
      t.assert(
        await features.getValue(
          feature as Feature,
          includeCodeQlIfRequired(feature),
        ),
      );

      // set env var to false and check that the feature is now disabled
      process.env[featureConfig[feature].envVar] = "false";
      t.assert(
        !(await features.getValue(
          feature as Feature,
          includeCodeQlIfRequired(feature),
        )),
      );
    });
  });

  if (
    featureConfig[feature].minimumVersion !== undefined ||
    featureConfig[feature].toolsFeature !== undefined
  ) {
    test(`Getting feature '${feature} should throw if no codeql is provided`, async (t) => {
      await withTmpDir(async (tmpDir) => {
        const features = setUpFeatureFlagTests(tmpDir);

        const expectedFeatureEnablement = initializeFeatures(true);
        mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

        await t.throwsAsync(async () => features.getValue(feature as Feature), {
          message: `Internal error: A ${
            featureConfig[feature].minimumVersion !== undefined
              ? "minimum version"
              : "required tools feature"
          } is specified for feature ${feature}, but no instance of CodeQL was provided.`,
        });
      });
    });
  }

  if (featureConfig[feature].minimumVersion !== undefined) {
    test(`Feature '${feature}' is disabled if the minimum CLI version is below ${featureConfig[feature].minimumVersion}`, async (t) => {
      await withTmpDir(async (tmpDir) => {
        const features = setUpFeatureFlagTests(tmpDir);

        const expectedFeatureEnablement = initializeFeatures(true);
        mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

        // feature should be disabled when an old CLI version is set
        let codeql = mockCodeQLVersion("2.0.0");
        t.assert(!(await features.getValue(feature as Feature, codeql)));

        // even setting the env var to true should not enable the feature if
        // the minimum CLI version is not met
        process.env[featureConfig[feature].envVar] = "true";
        t.assert(!(await features.getValue(feature as Feature, codeql)));

        // feature should be enabled when a new CLI version is set
        // and env var is not set
        process.env[featureConfig[feature].envVar] = "";
        codeql = mockCodeQLVersion(
          featureConfig[feature].minimumVersion as string,
        );
        t.assert(await features.getValue(feature as Feature, codeql));

        // set env var to false and check that the feature is now disabled
        process.env[featureConfig[feature].envVar] = "false";
        t.assert(!(await features.getValue(feature as Feature, codeql)));
      });
    });
  }

  if (featureConfig[feature].toolsFeature !== undefined) {
    test(`Feature '${feature}' is disabled if the required tools feature is not enabled`, async (t) => {
      await withTmpDir(async (tmpDir) => {
        const features = setUpFeatureFlagTests(tmpDir);

        const expectedFeatureEnablement = initializeFeatures(true);
        mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

        // feature should be disabled when the required tools feature is not enabled
        let codeql = mockCodeQLVersion("2.0.0");
        t.assert(!(await features.getValue(feature as Feature, codeql)));

        // even setting the env var to true should not enable the feature if
        // the required tools feature is not enabled
        process.env[featureConfig[feature].envVar] = "true";
        t.assert(!(await features.getValue(feature as Feature, codeql)));

        // feature should be enabled when the required tools feature is enabled
        // and env var is not set
        process.env[featureConfig[feature].envVar] = "";
        codeql = mockCodeQLVersion("2.0.0", {
          [featureConfig[feature].toolsFeature]: true,
        });
        t.assert(await features.getValue(feature as Feature, codeql));

        // set env var to false and check that the feature is now disabled
        process.env[featureConfig[feature].envVar] = "false";
        t.assert(!(await features.getValue(feature as Feature, codeql)));
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
test("At least one feature has a minimum version specified", (t) => {
  t.assert(
    Object.values(featureConfig).some((f) => f.minimumVersion !== undefined),
    "At least one feature should have a minimum version specified",
  );

  t.assert(
    Object.values(featureConfig).some((f) => f.toolsFeature !== undefined),
    "At least one feature should have a required tools feature specified",
  );

  // An even less likely scenario is that we no longer have any features.
  t.assert(
    Object.values(featureConfig).length > 0,
    "There should be at least one feature",
  );
});

test("Feature flags are saved to disk", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const features = setUpFeatureFlagTests(tmpDir);
    const expectedFeatureEnablement = initializeFeatures(true);
    mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

    const cachedFeatureFlags = path.join(tmpDir, FEATURE_FLAGS_FILE_NAME);

    t.false(
      fs.existsSync(cachedFeatureFlags),
      "Feature flag cached file should not exist before getting feature flags",
    );

    t.true(
      await features.getValue(
        Feature.QaTelemetryEnabled,
        includeCodeQlIfRequired(Feature.QaTelemetryEnabled),
      ),
      "Feature flag should be enabled initially",
    );

    t.true(
      fs.existsSync(cachedFeatureFlags),
      "Feature flag cached file should exist after getting feature flags",
    );

    const actualFeatureEnablement = JSON.parse(
      fs.readFileSync(cachedFeatureFlags, "utf8"),
    );
    t.deepEqual(actualFeatureEnablement, expectedFeatureEnablement);

    // now test that we actually use the feature flag cache instead of the server
    actualFeatureEnablement[Feature.QaTelemetryEnabled] = false;
    fs.writeFileSync(
      cachedFeatureFlags,
      JSON.stringify(actualFeatureEnablement),
    );

    // delete the in memory cache so that we are forced to use the cached file
    (features as any).gitHubFeatureFlags.cachedApiResponse = undefined;

    t.false(
      await features.getValue(
        Feature.QaTelemetryEnabled,
        includeCodeQlIfRequired(Feature.QaTelemetryEnabled),
      ),
      "Feature flag should be enabled after reading from cached file",
    );
  });
});

test("Environment variable can override feature flag cache", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const features = setUpFeatureFlagTests(tmpDir);
    const expectedFeatureEnablement = initializeFeatures(true);
    mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

    const cachedFeatureFlags = path.join(tmpDir, FEATURE_FLAGS_FILE_NAME);
    t.true(
      await features.getValue(
        Feature.QaTelemetryEnabled,
        includeCodeQlIfRequired(Feature.QaTelemetryEnabled),
      ),
      "Feature flag should be enabled initially",
    );

    t.true(
      fs.existsSync(cachedFeatureFlags),
      "Feature flag cached file should exist after getting feature flags",
    );
    process.env.CODEQL_ACTION_QA_TELEMETRY = "false";

    t.false(
      await features.getValue(
        Feature.QaTelemetryEnabled,
        includeCodeQlIfRequired(Feature.QaTelemetryEnabled),
      ),
      "Feature flag should be disabled after setting env var",
    );
  });
});

test(`selects CLI from defaults.json on GHES`, async (t) => {
  await withTmpDir(async (tmpDir) => {
    const features = setUpFeatureFlagTests(tmpDir);

    const defaultCliVersion = await features.getDefaultCliVersion(
      GitHubVariant.GHES,
    );
    t.deepEqual(defaultCliVersion, {
      cliVersion: defaults.cliVersion,
      tagName: defaults.bundleVersion,
    });
  });
});

test("selects CLI v2.20.1 on Dotcom when feature flags enable v2.20.0 and v2.20.1", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const features = setUpFeatureFlagTests(tmpDir);
    const expectedFeatureEnablement = initializeFeatures(true);
    expectedFeatureEnablement["default_codeql_version_2_20_0_enabled"] = true;
    expectedFeatureEnablement["default_codeql_version_2_20_1_enabled"] = true;
    expectedFeatureEnablement["default_codeql_version_2_20_2_enabled"] = false;
    expectedFeatureEnablement["default_codeql_version_2_20_3_enabled"] = false;
    expectedFeatureEnablement["default_codeql_version_2_20_4_enabled"] = false;
    expectedFeatureEnablement["default_codeql_version_2_20_5_enabled"] = false;
    mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

    const defaultCliVersion = await features.getDefaultCliVersion(
      GitHubVariant.DOTCOM,
    );
    t.deepEqual(defaultCliVersion, {
      cliVersion: "2.20.1",
      tagName: "codeql-bundle-v2.20.1",
      toolsFeatureFlagsValid: true,
    });
  });
});

test("includes tag name when feature flags enable version greater than v2.13.4", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const features = setUpFeatureFlagTests(tmpDir);
    const expectedFeatureEnablement = initializeFeatures(true);
    expectedFeatureEnablement["default_codeql_version_2_20_0_enabled"] = true;
    mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

    const defaultCliVersion = await features.getDefaultCliVersion(
      GitHubVariant.DOTCOM,
    );
    t.deepEqual(defaultCliVersion, {
      cliVersion: "2.20.0",
      tagName: "codeql-bundle-v2.20.0",
      toolsFeatureFlagsValid: true,
    });
  });
});

test(`selects CLI from defaults.json on Dotcom when no default version feature flags are enabled`, async (t) => {
  await withTmpDir(async (tmpDir) => {
    const features = setUpFeatureFlagTests(tmpDir);
    const expectedFeatureEnablement = initializeFeatures(true);
    mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

    const defaultCliVersion = await features.getDefaultCliVersion(
      GitHubVariant.DOTCOM,
    );
    t.deepEqual(defaultCliVersion, {
      cliVersion: defaults.cliVersion,
      tagName: defaults.bundleVersion,
      toolsFeatureFlagsValid: false,
    });
  });
});

test(`selects CLI from defaults.json on Dotcom when default version feature flags are unsupported`, async (t) => {
  await withTmpDir(async (tmpDir) => {
    const features = setUpFeatureFlagTests(tmpDir);
    const expectedFeatureEnablement = initializeFeatures(true);
    // Doesn't have a semantically versioned bundle
    expectedFeatureEnablement["default_codeql_version_2_13_3_enabled"] = true;
    mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

    const defaultCliVersion = await features.getDefaultCliVersion(
      GitHubVariant.DOTCOM,
    );
    t.deepEqual(defaultCliVersion, {
      cliVersion: defaults.cliVersion,
      tagName: defaults.bundleVersion,
      toolsFeatureFlagsValid: false,
    });
  });
});

test("ignores invalid version numbers in default version feature flags", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const loggedMessages = [];
    const features = setUpFeatureFlagTests(
      tmpDir,
      getRecordingLogger(loggedMessages),
    );
    const expectedFeatureEnablement = initializeFeatures(true);
    expectedFeatureEnablement["default_codeql_version_2_20_0_enabled"] = true;
    expectedFeatureEnablement["default_codeql_version_2_20_1_enabled"] = true;
    expectedFeatureEnablement["default_codeql_version_2_20_invalid_enabled"] =
      true;
    mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

    const defaultCliVersion = await features.getDefaultCliVersion(
      GitHubVariant.DOTCOM,
    );
    t.deepEqual(defaultCliVersion, {
      cliVersion: "2.20.1",
      tagName: "codeql-bundle-v2.20.1",
      toolsFeatureFlagsValid: true,
    });

    t.assert(
      loggedMessages.find(
        (v: LoggedMessage) =>
          v.type === "warning" &&
          v.message ===
            "Ignoring feature flag default_codeql_version_2_20_invalid_enabled as it does not specify a valid CodeQL version.",
      ) !== undefined,
    );
  });
});

test("legacy feature flags should end with _enabled", async (t) => {
  for (const [feature, config] of Object.entries(featureConfig)) {
    if (config.legacyApi) {
      t.assert(
        feature.endsWith("_enabled"),
        `legacy feature ${feature} should end with '_enabled'`,
      );
    }
  }
});

test("non-legacy feature flags should not end with _enabled", async (t) => {
  for (const [feature, config] of Object.entries(featureConfig)) {
    if (!config.legacyApi) {
      t.false(
        feature.endsWith("_enabled"),
        `non-legacy feature ${feature} should not end with '_enabled'`,
      );
    }
  }
});

function assertAllFeaturesUndefinedInApi(
  t: ExecutionContext<unknown>,
  loggedMessages: LoggedMessage[],
) {
  for (const feature of Object.keys(featureConfig)) {
    t.assert(
      loggedMessages.find(
        (v) =>
          v.type === "debug" &&
          (v.message as string).includes(feature) &&
          (v.message as string).includes("undefined in API response"),
      ) !== undefined,
    );
  }
}

function initializeFeatures(initialValue: boolean) {
  return Object.keys(featureConfig).reduce((features, key) => {
    features[key] = initialValue;
    return features;
  }, {});
}

function setUpFeatureFlagTests(
  tmpDir: string,
  logger = getRunnerLogger(true),
  gitHubVersion = { type: GitHubVariant.DOTCOM } as util.GitHubVersion,
): FeatureEnablement {
  setupActionsVars(tmpDir, tmpDir);

  return new Features(gitHubVersion, testRepositoryNwo, tmpDir, logger);
}

/**
 * Returns an argument to pass to `getValue` that if required includes a CodeQL object meeting the
 * minimum version or tool feature requirements specified by the feature.
 */
function includeCodeQlIfRequired(feature: string) {
  return featureConfig[feature].minimumVersion !== undefined ||
    featureConfig[feature].toolsFeature !== undefined
    ? mockCodeQLVersion(
        "9.9.9",
        Object.fromEntries(Object.values(ToolsFeature).map((v) => [v, true])),
      )
    : undefined;
}
