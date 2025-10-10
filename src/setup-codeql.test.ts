import * as path from "path";

import * as toolcache from "@actions/tool-cache";
import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { Feature, FeatureEnablement } from "./feature-flags";
import { getRunnerLogger } from "./logging";
import * as setupCodeql from "./setup-codeql";
import {
  LINKED_CLI_VERSION,
  LoggedMessage,
  SAMPLE_DEFAULT_CLI_VERSION,
  SAMPLE_DOTCOM_API_DETAILS,
  createFeatures,
  getRecordingLogger,
  initializeFeatures,
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
  const features = createFeatures([]);

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
      features,
      getRunnerLogger(true),
    );

    t.is(source.sourceType, "download");
    t.is(source["cliVersion"], "1.2.3");
  });
});

test("getCodeQLSource correctly returns bundled CLI version when tools == linked", async (t) => {
  const features = createFeatures([]);

  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const source = await setupCodeql.getCodeQLSource(
      "linked",
      SAMPLE_DEFAULT_CLI_VERSION,
      SAMPLE_DOTCOM_API_DETAILS,
      GitHubVariant.DOTCOM,
      false,
      features,
      getRunnerLogger(true),
    );

    t.is(source.toolsVersion, LINKED_CLI_VERSION.cliVersion);
    t.is(source.sourceType, "download");
  });
});

test("getCodeQLSource correctly returns bundled CLI version when tools == latest", async (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);
  const features = createFeatures([]);

  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const source = await setupCodeql.getCodeQLSource(
      "latest",
      SAMPLE_DEFAULT_CLI_VERSION,
      SAMPLE_DOTCOM_API_DETAILS,
      GitHubVariant.DOTCOM,
      false,
      features,
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
  const features = createFeatures([]);

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
      SAMPLE_DEFAULT_CLI_VERSION,
      features,
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
  const features = createFeatures([]);

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
      SAMPLE_DEFAULT_CLI_VERSION,
      features,
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

test("getCodeQLSource correctly returns latest version from toolcache when tools == toolcache", async (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);
  const features = createFeatures([Feature.AllowToolcacheInput]);

  process.env["GITHUB_EVENT_NAME"] = "dynamic";

  const latestToolcacheVersion = "3.2.1";
  const latestVersionPath = "/path/to/latest";
  const testVersions = ["2.3.1", latestToolcacheVersion, "1.2.3"];
  const findAllVersionsStub = sinon
    .stub(toolcache, "findAllVersions")
    .returns(testVersions);
  const findStub = sinon.stub(toolcache, "find");
  findStub
    .withArgs("CodeQL", latestToolcacheVersion)
    .returns(latestVersionPath);

  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const source = await setupCodeql.getCodeQLSource(
      "toolcache",
      SAMPLE_DEFAULT_CLI_VERSION,
      SAMPLE_DOTCOM_API_DETAILS,
      GitHubVariant.DOTCOM,
      false,
      features,
      logger,
    );

    // Check that the toolcache functions were called with the expected arguments
    t.assert(
      findAllVersionsStub.calledOnceWith("CodeQL"),
      `toolcache.findAllVersions("CodeQL") wasn't called`,
    );
    t.assert(
      findStub.calledOnceWith("CodeQL", latestToolcacheVersion),
      `toolcache.find("CodeQL", ${latestToolcacheVersion}) wasn't called`,
    );

    // Check that `sourceType` and `toolsVersion` match expectations.
    t.is(source.sourceType, "toolcache");
    t.is(source.toolsVersion, latestToolcacheVersion);

    // Check that key messages we would expect to find in the log are present.
    const expectedMessages: string[] = [
      `Attempting to use the latest CodeQL CLI version in the toolcache, as requested by 'tools: toolcache'.`,
      `CLI version ${latestToolcacheVersion} is the latest version in the toolcache.`,
      `Using CodeQL CLI version ${latestToolcacheVersion} from toolcache at ${latestVersionPath}`,
    ];
    for (const expectedMessage of expectedMessages) {
      t.assert(
        loggedMessages.some(
          (msg) =>
            typeof msg.message === "string" &&
            msg.message.includes(expectedMessage),
        ),
        `Expected '${expectedMessage}' in the logger output, but didn't find it in:\n ${loggedMessages.map((m) => ` - '${m.message}'`).join("\n")}`,
      );
    }
  });
});

const toolcacheInputFallbackMacro = test.macro({
  exec: async (
    t: ExecutionContext<unknown>,
    featureList: Feature[],
    environment: Record<string, string>,
    testVersions: string[],
    expectedMessages: string[],
  ) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures(featureList);

    for (const [k, v] of Object.entries(environment)) {
      process.env[k] = v;
    }

    const findAllVersionsStub = sinon
      .stub(toolcache, "findAllVersions")
      .returns(testVersions);

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const source = await setupCodeql.getCodeQLSource(
        "toolcache",
        SAMPLE_DEFAULT_CLI_VERSION,
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        false,
        features,
        logger,
      );

      // Check that the toolcache functions were called with the expected arguments
      t.assert(
        findAllVersionsStub.calledWith("CodeQL"),
        `toolcache.findAllVersions("CodeQL") wasn't called`,
      );

      // Check that `sourceType` and `toolsVersion` match expectations.
      t.is(source.sourceType, "download");
      t.is(source.toolsVersion, SAMPLE_DEFAULT_CLI_VERSION.cliVersion);

      // Check that key messages we would expect to find in the log are present.
      for (const expectedMessage of expectedMessages) {
        t.assert(
          loggedMessages.some(
            (msg) =>
              typeof msg.message === "string" &&
              msg.message.includes(expectedMessage),
          ),
          `Expected '${expectedMessage}' in the logger output, but didn't find it in:\n ${loggedMessages.map((m) => ` - '${m.message}'`).join("\n")}`,
        );
      }
    });
  },
  title: (providedTitle = "") =>
    `getCodeQLSource falls back to downloading the CLI if ${providedTitle}`,
});

test(
  "the toolcache doesn't have a CodeQL CLI when tools == toolcache",
  toolcacheInputFallbackMacro,
  [Feature.AllowToolcacheInput],
  { GITHUB_EVENT_NAME: "dynamic" },
  [],
  [
    `Attempting to use the latest CodeQL CLI version in the toolcache, as requested by 'tools: toolcache'.`,
    `Found no CodeQL CLI in the toolcache, ignoring 'tools: toolcache'...`,
  ],
);

test(
  "the workflow trigger is not `dynamic`",
  toolcacheInputFallbackMacro,
  [Feature.AllowToolcacheInput],
  { GITHUB_EVENT_NAME: "pull_request" },
  [],
  [
    `Ignoring 'tools: toolcache' because the workflow was not triggered dynamically.`,
  ],
);

test(
  "the feature flag is not enabled",
  toolcacheInputFallbackMacro,
  [],
  { GITHUB_EVENT_NAME: "dynamic" },
  [],
  [`Ignoring 'tools: toolcache' because the feature is not enabled.`],
);

test('tryGetTagNameFromUrl extracts the right tag name for a repo name containing "codeql-bundle"', (t) => {
  t.is(
    setupCodeql.tryGetTagNameFromUrl(
      "https://github.com/org/codeql-bundle-testing/releases/download/codeql-bundle-v2.19.0/codeql-bundle-linux64.tar.zst",
      getRunnerLogger(true),
    ),
    "codeql-bundle-v2.19.0",
  );
});

test("getLatestToolcacheVersion returns undefined if there are no CodeQL CLIs in the toolcache", (t) => {
  sinon.stub(toolcache, "findAllVersions").returns([]);
  t.is(setupCodeql.getLatestToolcacheVersion(getRunnerLogger(true)), undefined);
});

test("getLatestToolcacheVersion returns latest version in the toolcache", (t) => {
  const testVersions = ["2.3.1", "3.2.1", "1.2.3"];
  sinon.stub(toolcache, "findAllVersions").returns(testVersions);

  t.is(setupCodeql.getLatestToolcacheVersion(getRunnerLogger(true)), "3.2.1");
});
