import test from "ava";

import { GitHubApiDetails } from "./api-client";
import {
  Feature,
  featureConfig,
  FeatureEnablement,
  Features,
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
import * as util from "./util";
import { GitHubVariant, initializeEnvironment, Mode, withTmpDir } from "./util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment(Mode.actions, "1.2.3");
});

const testApiDetails: GitHubApiDetails = {
  auth: "1234",
  url: "https://github.com",
  apiURL: undefined,
};

const testRepositoryNwo = parseRepositoryNwo("github/example");

const ALL_FEATURES_DISABLED_VARIANTS: Array<{
  description: string;
  gitHubVersion: util.GitHubVersion;
}> = [
  {
    description: "GHES",
    gitHubVersion: { type: GitHubVariant.GHES, version: "3.0.0" },
  },
  { description: "GHAE", gitHubVersion: { type: GitHubVariant.GHAE } },
];

for (const variant of ALL_FEATURES_DISABLED_VARIANTS) {
  test(`All features are disabled if running against ${variant.description}`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const loggedMessages = [];
      const featureEnablement = setUpTests(
        tmpDir,
        getRecordingLogger(loggedMessages),
        variant.gitHubVersion
      );

      for (const feature of Object.values(Feature)) {
        t.false(
          await featureEnablement.getValue(
            feature,
            includeCodeQlIfRequired(feature)
          )
        );
      }

      t.assert(
        loggedMessages.find(
          (v: LoggedMessage) =>
            v.type === "debug" &&
            v.message ===
              "Not running against github.com. Disabling all toggleable features."
        ) !== undefined
      );
    });
  });
}

test("API response missing", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const loggedMessages: LoggedMessage[] = [];
    const featureEnablement = setUpTests(
      tmpDir,
      getRecordingLogger(loggedMessages)
    );

    mockFeatureFlagApiEndpoint(403, {});

    for (const feature of Object.values(Feature)) {
      t.assert(
        (await featureEnablement.getValue(
          feature,
          includeCodeQlIfRequired(feature)
        )) === false
      );
    }
    assertAllFeaturesUndefinedInApi(t, loggedMessages);
  });
});

test("Features are disabled if they're not returned in API response", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const loggedMessages: LoggedMessage[] = [];
    const featureEnablement = setUpTests(
      tmpDir,
      getRecordingLogger(loggedMessages)
    );

    mockFeatureFlagApiEndpoint(200, {});

    for (const feature of Object.values(Feature)) {
      t.assert(
        (await featureEnablement.getValue(
          feature,
          includeCodeQlIfRequired(feature)
        )) === false
      );
    }

    assertAllFeaturesUndefinedInApi(t, loggedMessages);
  });
});

test("Feature flags exception is propagated if the API request errors", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const featureEnablement = setUpTests(tmpDir);

    mockFeatureFlagApiEndpoint(500, {});

    await t.throwsAsync(
      async () =>
        featureEnablement.getValue(
          Feature.MlPoweredQueriesEnabled,
          includeCodeQlIfRequired(Feature.MlPoweredQueriesEnabled)
        ),
      {
        message:
          "Encountered an error while trying to determine feature enablement: Error: some error message",
      }
    );
  });
});

for (const feature of Object.keys(featureConfig)) {
  test(`Only feature '${feature}' is enabled if enabled in the API response. Other features disabled`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const featureEnablement = setUpTests(tmpDir);

      // set all features to false except the one we're testing
      const expectedFeatureEnablement: { [feature: string]: boolean } = {};
      for (const f of Object.keys(featureConfig)) {
        expectedFeatureEnablement[f] = f === feature;
      }
      mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

      // retrieve the values of the actual features
      const actualFeatureEnablement: { [feature: string]: boolean } = {};
      for (const f of Object.keys(featureConfig)) {
        actualFeatureEnablement[f] = await featureEnablement.getValue(
          f as Feature,
          includeCodeQlIfRequired(f)
        );
      }

      // All features should be false except the one we're testing
      t.deepEqual(actualFeatureEnablement, expectedFeatureEnablement);
    });
  });

  test(`Only feature '${feature}' is enabled if the associated environment variable is true. Others disabled.`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const featureEnablement = setUpTests(tmpDir);

      const expectedFeatureEnablement = initializeFeatures(false);
      mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

      // feature should be disabled initially
      t.assert(
        !(await featureEnablement.getValue(
          feature as Feature,
          includeCodeQlIfRequired(feature)
        ))
      );

      // set env var to true and check that the feature is now enabled
      process.env[featureConfig[feature].envVar] = "true";
      t.assert(
        await featureEnablement.getValue(
          feature as Feature,
          includeCodeQlIfRequired(feature)
        )
      );
    });
  });

  test(`Feature '${feature}' is disabled if the associated environment variable is false, even if enabled in API`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const featureEnablement = setUpTests(tmpDir);

      const expectedFeatureEnablement = initializeFeatures(true);
      mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

      // feature should be enabled initially
      t.assert(
        await featureEnablement.getValue(
          feature as Feature,
          includeCodeQlIfRequired(feature)
        )
      );

      // set env var to false and check that the feature is now disabled
      process.env[featureConfig[feature].envVar] = "false";
      t.assert(
        !(await featureEnablement.getValue(
          feature as Feature,
          includeCodeQlIfRequired(feature)
        ))
      );
    });
  });

  if (featureConfig[feature].minimumVersion !== undefined) {
    test(`Getting feature '${feature} should throw if no codeql is provided`, async (t) => {
      await withTmpDir(async (tmpDir) => {
        const featureEnablement = setUpTests(tmpDir);

        const expectedFeatureEnablement = initializeFeatures(true);
        mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

        await t.throwsAsync(
          async () => featureEnablement.getValue(feature as Feature),
          {
            message: `Internal error: A minimum version is specified for feature ${feature}, but no instance of CodeQL was provided.`,
          }
        );
      });
    });
  }

  if (featureConfig[feature].minimumVersion !== undefined) {
    test(`Feature '${feature}' is disabled if the minimum CLI version is below ${featureConfig[feature].minimumVersion}`, async (t) => {
      await withTmpDir(async (tmpDir) => {
        const featureEnablement = setUpTests(tmpDir);

        const expectedFeatureEnablement = initializeFeatures(true);
        mockFeatureFlagApiEndpoint(200, expectedFeatureEnablement);

        // feature should be disabled when an old CLI version is set
        let codeql = mockCodeQLVersion("2.0.0");
        t.assert(
          !(await featureEnablement.getValue(feature as Feature, codeql))
        );

        // even setting the env var to true should not enable the feature if
        // the minimum CLI version is not met
        process.env[featureConfig[feature].envVar] = "true";
        t.assert(
          !(await featureEnablement.getValue(feature as Feature, codeql))
        );

        // feature should be enabled when a new CLI version is set
        // and env var is not set
        process.env[featureConfig[feature].envVar] = "";
        codeql = mockCodeQLVersion(featureConfig[feature].minimumVersion);
        t.assert(await featureEnablement.getValue(feature as Feature, codeql));

        // set env var to false and check that the feature is now disabled
        process.env[featureConfig[feature].envVar] = "false";
        t.assert(
          !(await featureEnablement.getValue(feature as Feature, codeql))
        );
      });
    });
  }
}

// If we ever run into a situation where we no longer have any features that
// specify a minimum version, then we will have a bunch of code no longer being
// tested. This is unlikely, and this test will fail if that happens.
// If we do end up in that situation, then we should consider adding a synthetic
// feature with a minimum version that is only used for tests.
test("At least one feature has a minimum version specified", (t) => {
  t.assert(
    Object.values(featureConfig).some((f) => f.minimumVersion !== undefined),
    "At least one feature should have a minimum version specified"
  );

  // An even less likely scenario is that we no longer have any features.
  t.assert(
    Object.values(featureConfig).length > 0,
    "There should be at least one feature"
  );
});

function assertAllFeaturesUndefinedInApi(t, loggedMessages: LoggedMessage[]) {
  for (const feature of Object.keys(featureConfig)) {
    t.assert(
      loggedMessages.find(
        (v) =>
          v.type === "debug" &&
          (v.message as string).includes(feature) &&
          (v.message as string).includes("considering it disabled")
      ) !== undefined
    );
  }
}

function initializeFeatures(initialValue: boolean) {
  return Object.keys(featureConfig).reduce((features, key) => {
    features[key] = initialValue;
    return features;
  }, {});
}

function setUpTests(
  tmpDir: string,
  logger = getRunnerLogger(true),
  gitHubVersion = { type: GitHubVariant.DOTCOM } as util.GitHubVersion
): FeatureEnablement {
  setupActionsVars(tmpDir, tmpDir);

  return new Features(gitHubVersion, testApiDetails, testRepositoryNwo, logger);
}

function includeCodeQlIfRequired(feature: string) {
  return featureConfig[feature].minimumVersion !== undefined
    ? mockCodeQLVersion("9.9.9")
    : undefined;
}
