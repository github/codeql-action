import test from "ava";

import { GitHubApiDetails } from "./api-client";
import {
  FeatureFlag,
  featureFlagConfig,
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
      const featureFlags = setUpTmpDir(
        tmpDir,
        getRecordingLogger(loggedMessages),
        variant.gitHubVersion
      );

      for (const flag of Object.values(FeatureFlag)) {
        t.assert((await featureFlags.getValue(flag)) === false);
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
    const loggedMessages = [];
    const featureFlags = setUpTmpDir(
      tmpDir,
      getRecordingLogger(loggedMessages)
    );

    mockFeatureFlagApiEndpoint(403, {});

    for (const flag of Object.values(FeatureFlag)) {
      t.assert((await featureFlags.getValue(flag)) === false);
    }

    for (const featureFlag of Object.keys(featureFlagConfig)) {
      t.assert(
        loggedMessages.find(
          (v: LoggedMessage) =>
            v.type === "debug" &&
            v.message ===
              `No feature flags API response for ${featureFlag}, considering it disabled.`
        ) !== undefined
      );
    }
  });
});

test("Feature flags are disabled if they're not returned in API response", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const loggedMessages = [];
    const featureFlags = setUpTmpDir(
      tmpDir,
      getRecordingLogger(loggedMessages)
    );

    mockFeatureFlagApiEndpoint(200, {});

    for (const flag of Object.values(FeatureFlag)) {
      t.assert((await featureFlags.getValue(flag)) === false);
    }

    for (const featureFlag of Object.keys(featureFlagConfig)) {
      t.assert(
        loggedMessages.find(
          (v: LoggedMessage) =>
            v.type === "debug" &&
            v.message ===
              `Feature flag '${featureFlag}' undefined in API response, considering it disabled.`
        ) !== undefined
      );
    }
  });
});

test("Feature flags exception is propagated if the API request errors", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const featureFlags = setUpTmpDir(tmpDir);

    mockFeatureFlagApiEndpoint(500, {});

    await t.throwsAsync(
      async () => featureFlags.getValue(FeatureFlag.MlPoweredQueriesEnabled),
      {
        message:
          "Encountered an error while trying to load feature flags: Error: some error message",
      }
    );
  });
});

for (const featureFlag of Object.keys(featureFlagConfig)) {
  test(`Feature flag '${featureFlag}' is enabled if enabled in the API response`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const featureFlags = setUpTmpDir(tmpDir);

      // set all feature flags to false except the one we're testing
      const expectedFeatureFlags: { [flag: string]: boolean } = {};
      for (const f of Object.keys(featureFlagConfig)) {
        expectedFeatureFlags[f] = f === featureFlag;
      }
      mockFeatureFlagApiEndpoint(200, expectedFeatureFlags);

      // retrieve the values of the actual feature flags
      const actualFeatureFlags: { [flag: string]: boolean } = {};
      for (const f of Object.keys(featureFlagConfig)) {
        actualFeatureFlags[f] = await featureFlags.getValue(f as FeatureFlag);
      }

      // Alls flags should be false except the one we're testing
      t.deepEqual(actualFeatureFlags, expectedFeatureFlags);
    });
  });

  test(`Feature flag '${featureFlag}' is enabled if the associated environment variable is true`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const featureFlags = setUpTmpDir(tmpDir);

      // set all feature flags to false
      const expectedFeatureFlags: { [flag: string]: boolean } = {};
      for (const f of Object.keys(featureFlagConfig)) {
        expectedFeatureFlags[f] = false;
      }
      mockFeatureFlagApiEndpoint(200, expectedFeatureFlags);

      // feature flag should be disabled initially
      t.assert(!(await featureFlags.getValue(featureFlag as FeatureFlag)));

      // set env var to true and check that the feature flag is now enabled
      process.env[featureFlagConfig[featureFlag].envVar] = "true";
      t.assert(await featureFlags.getValue(featureFlag as FeatureFlag));
    });
  });

  test(`Feature flag '${featureFlag}' is disabled if the associated environment variable is false`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      const featureFlags = setUpTmpDir(tmpDir);

      // set all feature flags to true
      const expectedFeatureFlags: { [flag: string]: boolean } = {};
      for (const f of Object.keys(featureFlagConfig)) {
        expectedFeatureFlags[f] = true;
      }
      mockFeatureFlagApiEndpoint(200, expectedFeatureFlags);

      // feature flag should be enabled initially
      t.assert(await featureFlags.getValue(featureFlag as FeatureFlag));

      // set env var to false and check that the feature flag is now disabled
      process.env[featureFlagConfig[featureFlag].envVar] = "false";
      t.assert(!(await featureFlags.getValue(featureFlag as FeatureFlag)));
    });
  });

  if (featureFlagConfig[featureFlag].minimumVersion !== undefined) {
    test(`Feature flag '${featureFlag}' is disabled if the minimum CLI version is below ${featureFlagConfig[featureFlag].minimumVersion}`, async (t) => {
      await withTmpDir(async (tmpDir) => {
        const featureFlags = setUpTmpDir(tmpDir);

        // set all feature flags to true
        const expectedFeatureFlags: { [flag: string]: boolean } = {};
        for (const f of Object.keys(featureFlagConfig)) {
          expectedFeatureFlags[f] = true;
        }
        mockFeatureFlagApiEndpoint(200, expectedFeatureFlags);

        // feature flag should be enabled initially (ignoring the minimum CLI version)
        t.assert(await featureFlags.getValue(featureFlag as FeatureFlag));

        // feature flag should be disabled when an old CLI version is set
        let codeql = mockCodeQLVersion("2.0.0");
        t.assert(
          !(await featureFlags.getValue(featureFlag as FeatureFlag, codeql))
        );

        // even setting the env var to true should not enable the feature flag if
        // the minimum CLI version is not met
        process.env[featureFlagConfig[featureFlag].envVar] = "true";
        t.assert(
          !(await featureFlags.getValue(featureFlag as FeatureFlag, codeql))
        );

        // feature flag should be enabled when a new CLI version is set
        // and env var is not set
        process.env[featureFlagConfig[featureFlag].envVar] = "";
        codeql = mockCodeQLVersion(
          featureFlagConfig[featureFlag].minimumVersion
        );
        t.assert(
          await featureFlags.getValue(featureFlag as FeatureFlag, codeql)
        );

        // set env var to false and check that the feature flag is now disabled
        process.env[featureFlagConfig[featureFlag].envVar] = "false";
        t.assert(
          !(await featureFlags.getValue(featureFlag as FeatureFlag, codeql))
        );
      });
    });
  }
}

function setUpTmpDir(
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
