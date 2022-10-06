import test from "ava";

import { GitHubApiDetails } from "./api-client";
import {
  Feature,
  featureConfig,
  FeatureFlags,
  GitHubFeatureFlags,
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

const ALL_FEATURE_FLAGS_DISABLED_VARIANTS: Array<{
  description: string;
  gitHubVersion: util.GitHubVersion;
}> = [
  {
    description: "GHES",
    gitHubVersion: { type: GitHubVariant.GHES, version: "3.0.0" },
  },
  { description: "GHAE", gitHubVersion: { type: GitHubVariant.GHAE } },
];

for (const variant of ALL_FEATURE_FLAGS_DISABLED_VARIANTS) {
  test(`All feature flags are disabled if running against ${variant.description}`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const loggedMessages = [];
      const featureFlags = setUpTests(
        tmpDir,
        getRecordingLogger(loggedMessages),
        variant.gitHubVersion
      );

      for (const flag of Object.values(Feature)) {
        t.assert(
          (await featureFlags.getValue(flag, includeCodeQlIfRequired(flag))) ===
            false
        );
      }

      t.assert(
        loggedMessages.find(
          (v: LoggedMessage) =>
            v.type === "debug" &&
            v.message ===
              "Not running against github.com. Disabling all feature flags."
        ) !== undefined
      );
    });
  });
}

test("API response missing", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const loggedMessages: LoggedMessage[] = [];
    const featureFlags = setUpTests(tmpDir, getRecordingLogger(loggedMessages));

    mockFeatureFlagApiEndpoint(403, {});

    for (const flag of Object.values(Feature)) {
      t.assert(
        (await featureFlags.getValue(flag, includeCodeQlIfRequired(flag))) ===
          false
      );
    }
    assertAllFeaturesUndefinedInApi(t, loggedMessages);
  });
});

test("Feature flags are disabled if they're not returned in API response", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const loggedMessages: LoggedMessage[] = [];
    const featureFlags = setUpTests(tmpDir, getRecordingLogger(loggedMessages));

    mockFeatureFlagApiEndpoint(200, {});

    for (const flag of Object.values(Feature)) {
      t.assert(
        (await featureFlags.getValue(flag, includeCodeQlIfRequired(flag))) ===
          false
      );
    }

    assertAllFeaturesUndefinedInApi(t, loggedMessages);
  });
});

test("Feature flags exception is propagated if the API request errors", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const featureFlags = setUpTests(tmpDir);

    mockFeatureFlagApiEndpoint(500, {});

    await t.throwsAsync(
      async () =>
        featureFlags.getValue(
          Feature.MlPoweredQueriesEnabled,
          includeCodeQlIfRequired(Feature.MlPoweredQueriesEnabled)
        ),
      {
        message:
          "Encountered an error while trying to load feature flags: Error: some error message",
      }
    );
  });
});

for (const featureFlag of Object.keys(featureConfig)) {
  test(`Only feature flag '${featureFlag}' is enabled if enabled in the API response. Other flags disabled`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const featureFlags = setUpTests(tmpDir);

      // set all feature flags to false except the one we're testing
      const expectedFeatureFlags: { [flag: string]: boolean } = {};
      for (const f of Object.keys(featureConfig)) {
        expectedFeatureFlags[f] = f === featureFlag;
      }
      mockFeatureFlagApiEndpoint(200, expectedFeatureFlags);

      // retrieve the values of the actual feature flags
      const actualFeatureFlags: { [flag: string]: boolean } = {};
      for (const f of Object.keys(featureConfig)) {
        actualFeatureFlags[f] = await featureFlags.getValue(
          f as Feature,
          includeCodeQlIfRequired(f)
        );
      }

      // Alls flags should be false except the one we're testing
      t.deepEqual(actualFeatureFlags, expectedFeatureFlags);
    });
  });

  test(`Only feature flag '${featureFlag}' is enabled if the associated environment variable is true. Others disabled.`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const featureFlags = setUpTests(tmpDir);

      const expectedFeatureFlags = initializeFeatures(false);
      mockFeatureFlagApiEndpoint(200, expectedFeatureFlags);

      // feature flag should be disabled initially
      t.assert(
        !(await featureFlags.getValue(
          featureFlag as Feature,
          includeCodeQlIfRequired(featureFlag)
        ))
      );

      // set env var to true and check that the feature flag is now enabled
      process.env[featureConfig[featureFlag].envVar] = "true";
      t.assert(
        await featureFlags.getValue(
          featureFlag as Feature,
          includeCodeQlIfRequired(featureFlag)
        )
      );
    });
  });

  test(`Feature flag '${featureFlag}' is disabled if the associated environment variable is false, even if enabled in API`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const featureFlags = setUpTests(tmpDir);

      const expectedFeatureFlags = initializeFeatures(true);
      mockFeatureFlagApiEndpoint(200, expectedFeatureFlags);

      // feature flag should be enabled initially
      t.assert(
        await featureFlags.getValue(
          featureFlag as Feature,
          includeCodeQlIfRequired(featureFlag)
        )
      );

      // set env var to false and check that the feature flag is now disabled
      process.env[featureConfig[featureFlag].envVar] = "false";
      t.assert(
        !(await featureFlags.getValue(
          featureFlag as Feature,
          includeCodeQlIfRequired(featureFlag)
        ))
      );
    });
  });

  if (featureConfig[featureFlag].minimumVersion !== undefined) {
    test(`Getting Feature Flag '${featureFlag} should throw if no codeql is provided`, async (t) => {
      await withTmpDir(async (tmpDir) => {
        const featureFlags = setUpTests(tmpDir);

        const expectedFeatureFlags = initializeFeatures(true);
        mockFeatureFlagApiEndpoint(200, expectedFeatureFlags);

        await t.throwsAsync(
          async () => featureFlags.getValue(featureFlag as Feature),
          {
            message: `A minimum version is specified for feature flag ${featureFlag}, but no instance of CodeQL was provided.`,
          }
        );
      });
    });
  }

  if (featureConfig[featureFlag].minimumVersion !== undefined) {
    test(`Feature flag '${featureFlag}' is disabled if the minimum CLI version is below ${featureConfig[featureFlag].minimumVersion}`, async (t) => {
      await withTmpDir(async (tmpDir) => {
        const featureFlags = setUpTests(tmpDir);

        const expectedFeatureFlags = initializeFeatures(true);
        mockFeatureFlagApiEndpoint(200, expectedFeatureFlags);

        // feature flag should be disabled when an old CLI version is set
        let codeql = mockCodeQLVersion("2.0.0");
        t.assert(
          !(await featureFlags.getValue(featureFlag as Feature, codeql))
        );

        // even setting the env var to true should not enable the feature flag if
        // the minimum CLI version is not met
        process.env[featureConfig[featureFlag].envVar] = "true";
        t.assert(
          !(await featureFlags.getValue(featureFlag as Feature, codeql))
        );

        // feature flag should be enabled when a new CLI version is set
        // and env var is not set
        process.env[featureConfig[featureFlag].envVar] = "";
        codeql = mockCodeQLVersion(featureConfig[featureFlag].minimumVersion);
        t.assert(await featureFlags.getValue(featureFlag as Feature, codeql));

        // set env var to false and check that the feature flag is now disabled
        process.env[featureConfig[featureFlag].envVar] = "false";
        t.assert(
          !(await featureFlags.getValue(featureFlag as Feature, codeql))
        );
      });
    });
  }
}

function assertAllFeaturesUndefinedInApi(t, loggedMessages: LoggedMessage[]) {
  for (const featureFlag of Object.keys(featureConfig)) {
    t.assert(
      loggedMessages.find(
        (v) =>
          v.type === "debug" &&
          (v.message as string).includes(featureFlag) &&
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
): FeatureFlags {
  setupActionsVars(tmpDir, tmpDir);

  return new GitHubFeatureFlags(
    gitHubVersion,
    testApiDetails,
    testRepositoryNwo,
    logger
  );
}

function includeCodeQlIfRequired(featureFlag: string) {
  return featureConfig[featureFlag].minimumVersion !== undefined
    ? mockCodeQLVersion("9.9.9")
    : undefined;
}
