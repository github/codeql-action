import * as github from "@actions/github";
import test from "ava";
import * as sinon from "sinon";

import * as apiClient from "./api-client";
import { GitHubApiDetails } from "./api-client";
import { FeatureFlag, GitHubFeatureFlags } from "./feature-flags";
import { getRunnerLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import {
  getRecordingLogger,
  LoggedMessage,
  setupActionsVars,
  setupTests,
} from "./testing-utils";
import * as util from "./util";
import {
  GitHubVariant,
  HTTPError,
  initializeEnvironment,
  Mode,
  withTmpDir,
} from "./util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment(Mode.actions, "1.2.3");
});

const testApiDetails: GitHubApiDetails = {
  auth: "1234",
  url: "https://github.com",
};

const testRepositoryNwo = parseRepositoryNwo("github/example");

function mockHttpRequests(
  responseStatusCode: number,
  flags: { [flagName: string]: boolean }
) {
  // Passing an auth token is required, so we just use a dummy value
  const client = github.getOctokit("123");

  const requestSpy = sinon.stub(client, "request");

  const optInSpy = requestSpy.withArgs(
    "GET /repos/:owner/:repo/code-scanning/codeql-action/features"
  );
  if (responseStatusCode < 300) {
    optInSpy.resolves({
      status: responseStatusCode,
      data: flags,
      headers: {},
      url: "GET /repos/:owner/:repo/code-scanning/codeql-action/features",
    });
  } else {
    optInSpy.throws(new HTTPError("some error message", responseStatusCode));
  }

  sinon.stub(apiClient, "getApiClient").value(() => client);
}

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
      setupActionsVars(tmpDir, tmpDir);

      const loggedMessages = [];
      const featureFlags = new GitHubFeatureFlags(
        variant.gitHubVersion,
        testApiDetails,
        testRepositoryNwo,
        getRecordingLogger(loggedMessages)
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

test("Feature flags are disabled if they're not returned in API response", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const loggedMessages = [];
    const featureFlags = new GitHubFeatureFlags(
      { type: GitHubVariant.DOTCOM },
      testApiDetails,
      testRepositoryNwo,
      getRecordingLogger(loggedMessages)
    );

    mockHttpRequests(200, {});

    for (const flag of Object.values(FeatureFlag)) {
      t.assert((await featureFlags.getValue(flag)) === false);
    }

    for (const featureFlag of [
      "database_uploads_enabled",
      "ml_powered_queries_enabled",
      "uploads_domain_enabled",
    ]) {
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
    setupActionsVars(tmpDir, tmpDir);

    const featureFlags = new GitHubFeatureFlags(
      { type: GitHubVariant.DOTCOM },
      testApiDetails,
      testRepositoryNwo,
      getRunnerLogger(true)
    );

    mockHttpRequests(500, {});

    await t.throwsAsync(async () => featureFlags.preloadFeatureFlags(), {
      message:
        "Encountered an error while trying to load feature flags: Error: some error message",
    });
  });
});

const FEATURE_FLAGS = [
  "database_uploads_enabled",
  "ml_powered_queries_enabled",
  "uploads_domain_enabled",
];

for (const featureFlag of FEATURE_FLAGS) {
  test(`Feature flag '${featureFlag}' is enabled if enabled in the API response`, async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      const featureFlags = new GitHubFeatureFlags(
        { type: GitHubVariant.DOTCOM },
        testApiDetails,
        testRepositoryNwo,
        getRunnerLogger(true)
      );

      const expectedFeatureFlags = {};
      for (const f of FEATURE_FLAGS) {
        expectedFeatureFlags[f] = false;
      }
      expectedFeatureFlags[featureFlag] = true;
      mockHttpRequests(200, expectedFeatureFlags);

      const actualFeatureFlags = {
        database_uploads_enabled: await featureFlags.getValue(
          FeatureFlag.DatabaseUploadsEnabled
        ),
        ml_powered_queries_enabled: await featureFlags.getValue(
          FeatureFlag.MlPoweredQueriesEnabled
        ),
        uploads_domain_enabled: await featureFlags.getValue(
          FeatureFlag.UploadsDomainEnabled
        ),
      };

      t.deepEqual(actualFeatureFlags, expectedFeatureFlags);
    });
  });
}
