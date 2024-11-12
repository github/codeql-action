import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { Feature, FeatureEnablement } from "./feature-flags";
import { initializeFeatures } from "./feature-flags.test";
import { getRunnerLogger } from "./logging";
import * as setupCodeql from "./setup-codeql";
import {
  LINKED_CLI_VERSION,
  LoggedMessage,
  SAMPLE_DEFAULT_CLI_VERSION,
  SAMPLE_DOTCOM_API_DETAILS,
  getRecordingLogger,
  mockBundleDownloadApi,
  setupActionsVars,
  setupTests,
} from "./testing-utils";
import {
  getErrorMessage,
  GitHubVariant,
  initializeEnvironment,
  withTmpDir,
} from "./util";

setupTests(test);

// TODO: Remove when when we no longer need to pass in features (https://github.com/github/codeql-action/issues/2600)
const expectedFeatureEnablement: FeatureEnablement = initializeFeatures(
  true,
) as FeatureEnablement;
expectedFeatureEnablement.getValue = function (feature: Feature) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return expectedFeatureEnablement[feature];
};
test.beforeEach(() => {
  initializeEnvironment("1.2.3");
});

test("parse codeql bundle url version", (t) => {
  t.deepEqual(
    setupCodeql.getCodeQLURLVersion(
      "https://github.com/.../codeql-bundle-20200601/...",
    ),
    "20200601",
  );
});

test("convert to semver", (t) => {
  const tests = {
    "20200601": "0.0.0-20200601",
    "20200601.0": "0.0.0-20200601.0",
    "20200601.0.0": "20200601.0.0",
    "1.2.3": "1.2.3",
    "1.2.3-alpha": "1.2.3-alpha",
    "1.2.3-beta.1": "1.2.3-beta.1",
  };

  for (const [version, expectedVersion] of Object.entries(tests)) {
    try {
      const parsedVersion = setupCodeql.convertToSemVer(
        version,
        getRunnerLogger(true),
      );
      t.deepEqual(parsedVersion, expectedVersion);
    } catch (e) {
      t.fail(getErrorMessage(e));
    }
  }
});

test("getCodeQLActionRepository", (t) => {
  const logger = getRunnerLogger(true);

  initializeEnvironment("1.2.3");

  // isRunningLocalAction() === true
  delete process.env["GITHUB_ACTION_REPOSITORY"];
  process.env["RUNNER_TEMP"] = path.dirname(__dirname);
  const repoLocalRunner = setupCodeql.getCodeQLActionRepository(logger);
  t.deepEqual(repoLocalRunner, "github/codeql-action");

  // isRunningLocalAction() === false
  sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
  process.env["GITHUB_ACTION_REPOSITORY"] = "xxx/yyy";
  const repoEnv = setupCodeql.getCodeQLActionRepository(logger);
  t.deepEqual(repoEnv, "xxx/yyy");
});

test("getCodeQLSource sets CLI version for a semver tagged bundle", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const tagName = "codeql-bundle-v1.2.3";
    mockBundleDownloadApi({ tagName });
    const source = await setupCodeql.getCodeQLSource(
      `https://github.com/github/codeql-action/releases/download/${tagName}/codeql-bundle-linux64.tar.gz`,
      SAMPLE_DEFAULT_CLI_VERSION,
      SAMPLE_DOTCOM_API_DETAILS,
      GitHubVariant.DOTCOM,
      false,
      getRunnerLogger(true),
    );

    t.is(source.sourceType, "download");
    t.is(source["cliVersion"], "1.2.3");
  });
});

test("getCodeQLSource correctly returns bundled CLI version when tools == linked", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const source = await setupCodeql.getCodeQLSource(
      "linked",
      SAMPLE_DEFAULT_CLI_VERSION,
      SAMPLE_DOTCOM_API_DETAILS,
      GitHubVariant.DOTCOM,
      false,
      getRunnerLogger(true),
    );

    t.is(source.toolsVersion, LINKED_CLI_VERSION.cliVersion);
    t.is(source.sourceType, "download");
  });
});

test("getCodeQLSource correctly returns bundled CLI version when tools == latest", async (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const source = await setupCodeql.getCodeQLSource(
      "latest",
      SAMPLE_DEFAULT_CLI_VERSION,
      SAMPLE_DOTCOM_API_DETAILS,
      GitHubVariant.DOTCOM,
      false,
      logger,
    );

    // First, ensure that the CLI version is the linked version, so that backwards
    // compatibility is maintained.
    t.is(source.toolsVersion, LINKED_CLI_VERSION.cliVersion);
    t.is(source.sourceType, "download");

    // Afterwards, ensure that we see the deprecation message in the log.
    const expected_message: string =
      "`tools: latest` has been renamed to `tools: linked`, but the old name is still supported. No action is required.";
    t.assert(
      loggedMessages.some(
        (msg) =>
          typeof msg.message === "string" &&
          msg.message.includes(expected_message),
      ),
    );
  });
});

test("setupCodeQLBundle logs the CodeQL CLI version being used when asked to use linked tools", async (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  // Stub the downloadCodeQL function to prevent downloading artefacts
  // during testing from being called.
  sinon.stub(setupCodeql, "downloadCodeQL").resolves({
    codeqlFolder: "codeql",
    statusReport: {
      combinedDurationMs: 500,
      compressionMethod: "gzip",
      downloadDurationMs: 200,
      extractionDurationMs: 300,
      streamExtraction: false,
      toolsUrl: "toolsUrl",
    },
    toolsVersion: LINKED_CLI_VERSION.cliVersion,
  });

  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const result = await setupCodeql.setupCodeQLBundle(
      "linked",
      SAMPLE_DOTCOM_API_DETAILS,
      "tmp/codeql_action_test/",
      GitHubVariant.DOTCOM,
      expectedFeatureEnablement,
      SAMPLE_DEFAULT_CLI_VERSION,
      logger,
    );

    // Basic sanity check that the version we got back is indeed
    // the linked (default) CLI version.
    t.is(result.toolsVersion, LINKED_CLI_VERSION.cliVersion);

    // Ensure message logging CodeQL CLI version was present in user logs.
    const expected_message: string = `Using CodeQL CLI version ${LINKED_CLI_VERSION.cliVersion}`;
    t.assert(
      loggedMessages.some(
        (msg) =>
          typeof msg.message === "string" &&
          msg.message.includes(expected_message),
      ),
    );
  });
});

test("setupCodeQLBundle logs the CodeQL CLI version being used when asked to download a non-default bundle", async (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const bundleUrl =
    "https://github.com/github/codeql-action/releases/download/codeql-bundle-v2.16.0/codeql-bundle-linux64.tar.gz";
  const expectedVersion = "2.16.0";

  // Stub the downloadCodeQL function to prevent downloading artefacts
  // during testing from being called.
  sinon.stub(setupCodeql, "downloadCodeQL").resolves({
    codeqlFolder: "codeql",
    statusReport: {
      combinedDurationMs: 500,
      compressionMethod: "gzip",
      downloadDurationMs: 200,
      extractionDurationMs: 300,
      streamExtraction: false,
      toolsUrl: bundleUrl,
    },
    toolsVersion: expectedVersion,
  });

  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const result = await setupCodeql.setupCodeQLBundle(
      bundleUrl,
      SAMPLE_DOTCOM_API_DETAILS,
      "tmp/codeql_action_test/",
      GitHubVariant.DOTCOM,
      expectedFeatureEnablement,
      SAMPLE_DEFAULT_CLI_VERSION,
      logger,
    );

    // Basic sanity check that the version we got back is indeed the version that the
    // bundle contains..
    t.is(result.toolsVersion, expectedVersion);

    // Ensure message logging CodeQL CLI version was present in user logs.
    const expected_message: string = `Using CodeQL CLI version 2.16.0 sourced from ${bundleUrl} .`;
    t.assert(
      loggedMessages.some(
        (msg) =>
          typeof msg.message === "string" &&
          msg.message.includes(expected_message),
      ),
    );
  });
});

test('tryGetTagNameFromUrl extracts the right tag name for a repo name containing "codeql-bundle"', (t) => {
  t.is(
    setupCodeql.tryGetTagNameFromUrl(
      "https://github.com/org/codeql-bundle-testing/releases/download/codeql-bundle-v2.19.0/codeql-bundle-linux64.tar.zst",
      getRunnerLogger(true),
    ),
    "codeql-bundle-v2.19.0",
  );
});
