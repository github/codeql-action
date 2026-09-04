import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as github from "@actions/github";
import * as toolcache from "@actions/tool-cache";
import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as api from "./api-client";
import * as diagnostics from "./diagnostics";
import { ActionsEnvVars, EnvVar } from "./environment";
import { Feature } from "./feature-flags";
import { getRunnerLogger } from "./logging";
import { getCacheRestoreKeyPrefix } from "./overlay/caching";
import * as setupCodeql from "./setup-codeql";
import * as tar from "./tar";
import {
  LINKED_CLI_VERSION,
  LoggedMessage,
  SAMPLE_DEFAULT_CLI_VERSION,
  SAMPLE_DOTCOM_API_DETAILS,
  checkExpectedLogMessages,
  createFeatures,
  createTestConfig,
  getRecordingLogger,
  makeMacro,
  mockBundleDownloadApi,
  setupActionsVars,
  setupTests,
} from "./testing-utils";
import * as toolsDownload from "./tools-download";
import {
  getErrorMessage,
  GitHubVariant,
  initializeEnvironment,
  withTmpDir,
} from "./util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment("1.2.3");
});

test.serial("parse codeql bundle url version", (t) => {
  t.deepEqual(
    setupCodeql.getCodeQLURLVersion(
      "https://github.com/.../codeql-bundle-20200601/...",
    ),
    "20200601",
  );
});

test.serial("convert to semver", (t) => {
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

test.serial("getCodeQLActionRepository", (t) => {
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

test.serial(
  "getCodeQLSource sets CLI version for a semver tagged bundle",
  async (t) => {
    const features = createFeatures([]);

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const tagName = "codeql-bundle-v1.2.3";
      mockBundleDownloadApi({ tagName });
      const source = await setupCodeql.getCodeQLSource(
        `https://github.com/github/codeql-action/releases/download/${tagName}/codeql-bundle-linux64.tar.gz`,
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        false,
        features,
        getRunnerLogger(true),
      );

      t.is(source.sourceType, "download");
      t.is(source["cliVersion"], "1.2.3");
    });
  },
);

const LINKED_BUNDLE_TEST_CASES = [
  {
    platform: "linux",
    arch: "x64",
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-linux64.tar.zst",
    expectedCompressionMethod: "zstd",
  },
  {
    platform: "linux",
    arch: "arm64",
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-linux-arm64.tar.zst",
    expectedCompressionMethod: "zstd",
  },
  {
    platform: "darwin",
    arch: "arm64",
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-osx64.tar.zst",
    expectedCompressionMethod: "zstd",
  },
  {
    platform: "darwin",
    arch: "x64",
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-osx64.tar.zst",
    expectedCompressionMethod: "zstd",
  },
  {
    platform: "win32",
    arch: "x64",
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-win64.tar.gz",
    expectedCompressionMethod: "gzip",
  },
  {
    platform: "linux",
    arch: "x64",
    tarSupportsZstd: false,
    expectedBundleName: "codeql-bundle-linux64.tar.gz",
    expectedCompressionMethod: "gzip",
  },
] as const;

for (const {
  platform,
  arch,
  tarSupportsZstd,
  expectedBundleName,
  expectedCompressionMethod,
} of LINKED_BUNDLE_TEST_CASES) {
  test.serial(
    `getCodeQLSource selects ${expectedBundleName} for linked tools on ${platform}/${arch}`,
    async (t) => {
      const features = createFeatures([]);
      sinon.stub(process, "platform").value(platform);
      sinon.stub(process, "arch").value(arch);

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource(
          "linked",
          SAMPLE_DEFAULT_CLI_VERSION,
          undefined, // rawLanguages
          false, // useOverlayAwareDefaultCliVersion
          SAMPLE_DOTCOM_API_DETAILS,
          GitHubVariant.DOTCOM,
          tarSupportsZstd,
          features,
          getRunnerLogger(true),
        );

        t.is(source.toolsVersion, LINKED_CLI_VERSION.cliVersion);
        t.is(source.sourceType, "download");
        if (source.sourceType === "download") {
          t.is(source.compressionMethod, expectedCompressionMethod);
          t.true(source.codeqlURL.endsWith(`/${expectedBundleName}`));
        }
      });
    },
  );
}

test.serial(
  "getCodeQLSource correctly returns bundled CLI version when tools == latest",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures([]);

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const source = await setupCodeql.getCodeQLSource(
        "latest",
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
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
  },
);

test.serial(
  "setupCodeQLBundle logs the CodeQL CLI version being used when asked to use linked tools",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures([]);

    // Stub the downloadCodeQL function to prevent downloading artefacts
    // during testing from being called.
    sinon.stub(setupCodeql, "downloadCodeQL").resolves({
      codeqlFolder: "codeql",
      statusReport: {
        downloadDurationMs: 200,
        totalDurationMs: 300,
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
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
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
  },
);

test.serial(
  "setupCodeQLBundle logs the CodeQL CLI version being used when asked to download a non-default bundle",
  async (t) => {
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
        downloadDurationMs: 200,
        totalDurationMs: 300,
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
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
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
  },
);

test.serial(
  "getCodeQLSource correctly returns nightly CLI version when tools == nightly",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures([]);

    const expectedDate = "30260213";
    const expectedTag = `codeql-bundle-${expectedDate}`;

    // Ensure that we consistently select "zstd" for the test.
    sinon.stub(process, "platform").value("linux");
    sinon.stub(tar, "isZstdAvailable").resolves({
      available: true,
      foundZstdBinary: true,
    });

    const client = github.getOctokit("123");
    const listReleases = sinon.stub(client.rest.repos, "listReleases");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    listReleases.resolves({
      data: [{ tag_name: expectedTag }],
    } as any);
    sinon.stub(api, "getApiClient").value(() => client);

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const source = await setupCodeql.getCodeQLSource(
        "nightly",
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        false,
        features,
        logger,
      );

      // Check that the `CodeQLToolsSource` object matches our expectations.
      const expectedVersion = `0.0.0-${expectedDate}`;
      const expectedURL = `https://github.com/dsp-testing/codeql-cli-nightlies/releases/download/${expectedTag}/${setupCodeql.getCodeQLBundleName("zstd")}`;
      t.deepEqual(source, {
        bundleVersion: expectedDate,
        cliVersion: undefined,
        codeqlURL: expectedURL,
        compressionMethod: "zstd",
        sourceType: "download",
        toolsVersion: expectedVersion,
      } satisfies setupCodeql.CodeQLToolsSource);

      // Afterwards, ensure that we see the expected messages in the log.
      checkExpectedLogMessages(t, loggedMessages, [
        "Using the latest CodeQL CLI nightly, as requested by 'tools: nightly'.",
        `Bundle version ${expectedDate} is not in SemVer format. Will treat it as pre-release ${expectedVersion}.`,
        `Attempting to obtain CodeQL tools. CLI version: unknown, bundle tag name: ${expectedTag}`,
        `Using CodeQL CLI sourced from ${expectedURL}`,
      ]);
    });
  },
);

test.serial(
  "getCodeQLSource correctly returns nightly CLI version when forced by FF",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures([Feature.ForceNightly]);

    const expectedDate = "30260213";
    const expectedTag = `codeql-bundle-${expectedDate}`;

    // Ensure that we consistently select "zstd" for the test.
    sinon.stub(process, "platform").value("linux");
    sinon.stub(tar, "isZstdAvailable").resolves({
      available: true,
      foundZstdBinary: true,
    });

    const client = github.getOctokit("123");
    const listReleases = sinon.stub(client.rest.repos, "listReleases");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    listReleases.resolves({
      data: [{ tag_name: expectedTag }],
    } as any);
    sinon.stub(api, "getApiClient").value(() => client);

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir, { GITHUB_EVENT_NAME: "dynamic" });

      const source = await setupCodeql.getCodeQLSource(
        undefined,
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        false,
        features,
        logger,
      );

      // Check that the `CodeQLToolsSource` object matches our expectations.
      const expectedVersion = `0.0.0-${expectedDate}`;
      const expectedURL = `https://github.com/dsp-testing/codeql-cli-nightlies/releases/download/${expectedTag}/${setupCodeql.getCodeQLBundleName("zstd")}`;
      t.deepEqual(source, {
        bundleVersion: expectedDate,
        cliVersion: undefined,
        codeqlURL: expectedURL,
        compressionMethod: "zstd",
        sourceType: "download",
        toolsVersion: expectedVersion,
      } satisfies setupCodeql.CodeQLToolsSource);

      // Afterwards, ensure that we see the expected messages in the log.
      checkExpectedLogMessages(t, loggedMessages, [
        `Using the latest CodeQL CLI nightly, as forced by the ${Feature.ForceNightly} feature flag.`,
        `Bundle version ${expectedDate} is not in SemVer format. Will treat it as pre-release ${expectedVersion}.`,
        `Attempting to obtain CodeQL tools. CLI version: unknown, bundle tag name: ${expectedTag}`,
        `Using CodeQL CLI sourced from ${expectedURL}`,
      ]);
    });
  },
);

test.serial(
  "getCodeQLSource correctly returns latest version from toolcache when tools == toolcache",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures([]);

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
      setupActionsVars(tmpDir, tmpDir, { GITHUB_EVENT_NAME: "dynamic" });

      const source = await setupCodeql.getCodeQLSource(
        "toolcache",
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
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
  },
);

const toolcacheInputFallbackMacro = makeMacro({
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

    const findAllVersionsStub = sinon
      .stub(toolcache, "findAllVersions")
      .returns(testVersions);

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      for (const [k, v] of Object.entries(environment)) {
        process.env[k] = v;
      }

      const source = await setupCodeql.getCodeQLSource(
        "toolcache",
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
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
      t.is(
        source.toolsVersion,
        SAMPLE_DEFAULT_CLI_VERSION.enabledVersions[0].cliVersion,
      );

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

toolcacheInputFallbackMacro.serial(
  "the toolcache doesn't have a CodeQL CLI when tools == toolcache",
  [],
  { GITHUB_EVENT_NAME: "dynamic" },
  [],
  [
    `Attempting to use the latest CodeQL CLI version in the toolcache, as requested by 'tools: toolcache'.`,
    `Found no CodeQL CLI in the toolcache, ignoring 'tools: toolcache'...`,
  ],
);

toolcacheInputFallbackMacro.serial(
  "the workflow trigger is not `dynamic`",
  [],
  { GITHUB_EVENT_NAME: "pull_request" },
  [],
  [
    `Ignoring 'tools: toolcache' because the workflow was not triggered dynamically.`,
  ],
);

test.serial(
  'tryGetTagNameFromUrl extracts the right tag name for a repo name containing "codeql-bundle"',
  (t) => {
    t.is(
      setupCodeql.tryGetTagNameFromUrl(
        "https://github.com/org/codeql-bundle-testing/releases/download/codeql-bundle-v2.19.0/codeql-bundle-linux64.tar.zst",
        getRunnerLogger(true),
      ),
      "codeql-bundle-v2.19.0",
    );
  },
);

test.serial(
  "getLatestToolcacheVersion returns undefined if there are no CodeQL CLIs in the toolcache",
  (t) => {
    sinon.stub(toolcache, "findAllVersions").returns([]);
    t.is(
      setupCodeql.getLatestToolcacheVersion(getRunnerLogger(true)),
      undefined,
    );
  },
);

test.serial(
  "getLatestToolcacheVersion returns latest version in the toolcache",
  (t) => {
    const testVersions = ["2.3.1", "3.2.1", "1.2.3"];
    sinon.stub(toolcache, "findAllVersions").returns(testVersions);

    t.is(setupCodeql.getLatestToolcacheVersion(getRunnerLogger(true)), "3.2.1");
  },
);

const overlayMatchEnabledVersions = {
  enabledVersions: [
    { cliVersion: "2.20.2", tagName: "codeql-bundle-v2.20.2" },
    { cliVersion: "2.20.1", tagName: "codeql-bundle-v2.20.1" },
    { cliVersion: "2.20.0", tagName: "codeql-bundle-v2.20.0" },
  ],
  toolsFeatureFlagsValid: true,
};

async function fakeOverlayBaseCacheKey(
  language: string,
  cliVersion: string,
  suffix: string,
): Promise<string> {
  const prefix = await getCacheRestoreKeyPrefix(
    createTestConfig({ languages: [language] }),
    cliVersion,
  );
  return `${prefix}${suffix}`;
}

test.serial(
  "getCodeQLSource uses overlay-aware default version when requested for a PR",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[EnvVar.CODE_SCANNING_REF] = "refs/heads/feature-branch";
      process.env[EnvVar.CODE_SCANNING_BASE_BRANCH] = "main";

      sinon.stub(api, "getAutomationID").resolves("test/");
      const listStub = sinon.stub(api, "listActionsCaches").resolves([
        {
          key: await fakeOverlayBaseCacheKey("javascript", "2.20.1", "abc-1-1"),
        },
      ]);
      sinon
        .stub(toolcache, "find")
        .withArgs("CodeQL", "2.20.1")
        .returns("/path/to/codeql-2.20.1");

      const source = await setupCodeql.getCodeQLSource(
        undefined,
        overlayMatchEnabledVersions,
        ["javascript"],
        true,
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        false,
        createFeatures([Feature.OverlayAnalysisMatchCodeqlVersion]),
        getRunnerLogger(true),
      );

      t.assert(listStub.calledOnce);
      t.is(source.sourceType, "toolcache");
      t.is(source.toolsVersion, "2.20.1");
    });
  },
);

test.serial(
  "getCodeQLSource skips overlay-aware default version when not requested",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env["CODE_SCANNING_REF"] = "refs/heads/feature-branch";
      process.env["CODE_SCANNING_BASE_BRANCH"] = "main";

      sinon.stub(api, "getAutomationID").resolves("test/");
      const listStub = sinon.stub(api, "listActionsCaches").resolves([
        {
          key: await fakeOverlayBaseCacheKey("javascript", "2.20.1", "abc-1-1"),
        },
      ]);
      sinon
        .stub(toolcache, "find")
        .withArgs("CodeQL", "2.20.2")
        .returns("/path/to/codeql-2.20.2");

      const source = await setupCodeql.getCodeQLSource(
        undefined,
        overlayMatchEnabledVersions,
        ["javascript"],
        false,
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        false,
        createFeatures([Feature.OverlayAnalysisMatchCodeqlVersion]),
        getRunnerLogger(true),
      );

      t.assert(listStub.notCalled);
      t.is(source.sourceType, "toolcache");
      t.is(source.toolsVersion, "2.20.2");
    });
  },
);

test.serial(
  "getEnabledVersionsWithOverlayBaseDatabases returns flag-enabled versions present in cache, sorted desc",
  async (t) => {
    sinon.stub(api, "getAutomationID").resolves("test/");
    sinon.stub(api, "listActionsCaches").resolves([
      // Flag-enabled versions present in the cache, listed in non-descending
      // order so the test exercises the sort.
      {
        key: await fakeOverlayBaseCacheKey("javascript", "2.20.0", "ghi-3-1"),
      },
      {
        key: await fakeOverlayBaseCacheKey("javascript", "2.20.1", "def-2-1"),
      },
      // Newer than any flag-enabled version: should be filtered out.
      {
        key: await fakeOverlayBaseCacheKey("javascript", "2.21.0", "abc-1-1"),
      },
    ]);

    const result = await setupCodeql.getEnabledVersionsWithOverlayBaseDatabases(
      overlayMatchEnabledVersions,
      ["javascript"],
      createFeatures([Feature.OverlayAnalysisMatchCodeqlVersion]),
      getRunnerLogger(true),
    );
    t.deepEqual(result, [
      { cliVersion: "2.20.1", tagName: "codeql-bundle-v2.20.1" },
      { cliVersion: "2.20.0", tagName: "codeql-bundle-v2.20.0" },
    ]);
  },
);

test.serial(
  "getEnabledVersionsWithOverlayBaseDatabases returns empty when no cached version is flag-enabled",
  async (t) => {
    sinon.stub(api, "getAutomationID").resolves("test/");
    sinon.stub(api, "listActionsCaches").resolves([
      {
        key: await fakeOverlayBaseCacheKey("javascript", "2.19.0", "abc-1-1"),
      },
    ]);

    const result = await setupCodeql.getEnabledVersionsWithOverlayBaseDatabases(
      overlayMatchEnabledVersions,
      ["javascript"],
      createFeatures([Feature.OverlayAnalysisMatchCodeqlVersion]),
      getRunnerLogger(true),
    );
    t.deepEqual(result, []);
  },
);

const noLanguagesMacro = makeMacro({
  exec: async (
    t: ExecutionContext<unknown>,
    rawLanguages: string[] | undefined,
  ) => {
    const listStub = sinon.stub(api, "listActionsCaches").resolves([]);

    const result = await setupCodeql.getEnabledVersionsWithOverlayBaseDatabases(
      overlayMatchEnabledVersions,
      rawLanguages,
      createFeatures([Feature.OverlayAnalysisMatchCodeqlVersion]),
      getRunnerLogger(true),
    );
    t.deepEqual(result, []);
    t.assert(
      listStub.notCalled,
      "Should not list Actions caches without any rawLanguages.",
    );
  },
  title: (providedTitle = "") =>
    `getEnabledVersionsWithOverlayBaseDatabases does not list caches when rawLanguages is ${providedTitle}`,
});

noLanguagesMacro.serial("undefined", undefined);
noLanguagesMacro.serial("an empty array", []);

test.serial(
  "getEnabledVersionsWithOverlayBaseDatabases returns empty when listing caches throws",
  async (t) => {
    sinon.stub(api, "getAutomationID").resolves("test/");
    sinon.stub(api, "listActionsCaches").rejects(new Error("listing failed"));

    const result = await setupCodeql.getEnabledVersionsWithOverlayBaseDatabases(
      overlayMatchEnabledVersions,
      ["javascript"],
      createFeatures([Feature.OverlayAnalysisMatchCodeqlVersion]),
      getRunnerLogger(true),
    );
    t.deepEqual(result, []);
  },
);

test.serial(
  "getEnabledVersionsWithOverlayBaseDatabases returns versions present in the cache",
  async (t) => {
    sinon.stub(api, "getAutomationID").resolves("test/");
    sinon.stub(api, "listActionsCaches").resolves([
      {
        key: await fakeOverlayBaseCacheKey("javascript", "2.20.2", "abc-1-1"),
      },
    ]);

    const result = await setupCodeql.getEnabledVersionsWithOverlayBaseDatabases(
      overlayMatchEnabledVersions,
      ["javascript"],
      createFeatures([Feature.OverlayAnalysisMatchCodeqlVersion]),
      getRunnerLogger(true),
    );
    t.deepEqual(result, [
      { cliVersion: "2.20.2", tagName: "codeql-bundle-v2.20.2" },
    ]);
  },
);

test.serial(
  "getEnabledVersionsWithOverlayBaseDatabases does not list caches when both gates are off",
  async (t) => {
    const listStub = sinon.stub(api, "listActionsCaches").resolves([]);

    const result = await setupCodeql.getEnabledVersionsWithOverlayBaseDatabases(
      overlayMatchEnabledVersions,
      ["javascript"],
      createFeatures([]),
      getRunnerLogger(true),
    );
    t.deepEqual(result, []);
    t.assert(
      listStub.notCalled,
      "Should not list Actions caches when both gating feature flags are off.",
    );
  },
);

test.serial(
  "getEnabledVersionsWithOverlayBaseDatabases dry-run returns empty but lists caches",
  async (t) => {
    sinon.stub(api, "getAutomationID").resolves("test/");
    const listStub = sinon.stub(api, "listActionsCaches").resolves([
      {
        key: await fakeOverlayBaseCacheKey("javascript", "2.20.1", "abc-1-1"),
      },
    ]);

    const result = await setupCodeql.getEnabledVersionsWithOverlayBaseDatabases(
      overlayMatchEnabledVersions,
      ["javascript"],
      createFeatures([Feature.OverlayAnalysisMatchCodeqlVersionDryRun]),
      getRunnerLogger(true),
    );
    t.deepEqual(
      result,
      [],
      "Dry-run should return an empty list so the caller falls back.",
    );
    t.assert(
      listStub.calledOnce,
      "Dry-run should still list Actions caches to populate the diagnostic.",
    );
  },
);

test.serial(
  "getEnabledVersionsWithOverlayBaseDatabases match flag wins over dry-run",
  async (t) => {
    sinon.stub(api, "getAutomationID").resolves("test/");
    sinon.stub(api, "listActionsCaches").resolves([
      {
        key: await fakeOverlayBaseCacheKey("javascript", "2.20.1", "abc-1-1"),
      },
    ]);

    const result = await setupCodeql.getEnabledVersionsWithOverlayBaseDatabases(
      overlayMatchEnabledVersions,
      ["javascript"],
      createFeatures([
        Feature.OverlayAnalysisMatchCodeqlVersion,
        Feature.OverlayAnalysisMatchCodeqlVersionDryRun,
      ]),
      getRunnerLogger(true),
    );
    t.deepEqual(result, [
      { cliVersion: "2.20.1", tagName: "codeql-bundle-v2.20.1" },
    ]);
  },
);

/** The CLI version that the toolcache cleanup tests download. */
const CLEANUP_CLI_VERSION = "2.21.0";
/** The bundle version that the toolcache cleanup tests download. */
const CLEANUP_BUNDLE_VERSION = "20240101";
/** A version of the CodeQL tools that is already in the toolcache but that we are not going to use. */
const CLEANUP_STALE_VERSION = "2.20.0";

/** Creates a directory in the toolcache that looks like a tool that `tool-cache` has cached. */
function createToolcacheEntry(
  toolcacheRoot: string,
  tool: string,
  version: string,
): string {
  const versionDirectory = path.join(toolcacheRoot, tool, version);
  const archDirectory = path.join(versionDirectory, os.arch());
  fs.mkdirSync(archDirectory, { recursive: true });
  fs.writeFileSync(path.join(archDirectory, "contents"), "x".repeat(1024));
  fs.writeFileSync(`${archDirectory}.complete`, "");
  return versionDirectory;
}

/**
 * Stubs out the download and the diagnostic sink, then downloads the CodeQL tools into a toolcache
 * rooted at `toolcacheRoot`.
 *
 * @returns the attributes of the toolcache cleanup diagnostic, or `undefined` if we didn't emit one.
 */
async function runDownloadCodeQL(
  toolcacheRoot: string,
  features: Feature[],
  bundleVersion: string | undefined = CLEANUP_BUNDLE_VERSION,
): Promise<toolsDownload.ToolcacheCleanupResult | undefined> {
  sinon
    .stub(toolsDownload, "downloadAndExtract")
    .callsFake(async (_url, _compressionMethod, dest) => {
      // The real implementation creates the destination directory, which matters here because the
      // cleanup deletes it first and `writeToolcacheMarkerFile` writes into its parent afterwards.
      fs.mkdirSync(dest, { recursive: true });
      return { totalDurationMs: 1 };
    });
  const addDiagnostic = sinon.stub(diagnostics, "addNoLanguageDiagnostic");

  await setupCodeql.downloadCodeQL(
    "https://example.com/codeql-bundle.tar.gz",
    "gzip",
    bundleVersion,
    CLEANUP_CLI_VERSION,
    SAMPLE_DOTCOM_API_DETAILS,
    undefined, // tarVersion
    toolcacheRoot, // tempDir
    createFeatures(features),
    getRunnerLogger(true),
  );

  const diagnostic = addDiagnostic
    .getCalls()
    .map((call) => call.args[1])
    .find((d) => d.source?.id === "codeql-action/toolcache-bundle-cleanup");

  return diagnostic?.attributes as
    | toolsDownload.ToolcacheCleanupResult
    | undefined;
}

/**
 * Sets up a toolcache containing the version of the CodeQL tools that we are about to download, a
 * different version of the CodeQL tools, and an unrelated tool, then downloads the CodeQL tools.
 */
async function testToolcacheCleanup(
  t: ExecutionContext<unknown>,
  {
    features,
    runnerEnvironment,
    setUp,
  }: {
    features: Feature[];
    runnerEnvironment: string | undefined;
    setUp?: () => void;
  },
  check: (context: {
    cleanupDiagnostic: toolsDownload.ToolcacheCleanupResult | undefined;
    destinationDirectory: string;
    staleDirectory: string;
  }) => void,
) {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    if (runnerEnvironment === undefined) {
      delete process.env[ActionsEnvVars.RUNNER_ENVIRONMENT];
    } else {
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = runnerEnvironment;
    }
    setUp?.();

    // The extraction of the bundle would normally create this directory.
    const destinationDirectory = createToolcacheEntry(
      tmpDir,
      "CodeQL",
      CLEANUP_CLI_VERSION,
    );
    const staleDirectory = createToolcacheEntry(
      tmpDir,
      "CodeQL",
      CLEANUP_STALE_VERSION,
    );
    const otherToolDirectory = createToolcacheEntry(tmpDir, "Node", "20.0.0");

    const cleanupDiagnostic = await runDownloadCodeQL(tmpDir, features);

    t.true(
      fs.existsSync(otherToolDirectory),
      "Should never delete other tools from the toolcache.",
    );

    check({ cleanupDiagnostic, destinationDirectory, staleDirectory });
  });
}

test.serial(
  "downloadCodeQL does not clean up the toolcache when the feature flag is disabled",
  async (t) => {
    await testToolcacheCleanup(
      t,
      { features: [], runnerEnvironment: "github-hosted" },
      ({ cleanupDiagnostic, destinationDirectory, staleDirectory }) => {
        t.true(fs.existsSync(staleDirectory));
        t.true(fs.existsSync(destinationDirectory));
        t.is(cleanupDiagnostic, undefined);
      },
    );
  },
);

test.serial(
  "downloadCodeQL does not clean up the toolcache when the runner is not GitHub-hosted",
  async (t) => {
    await testToolcacheCleanup(
      t,
      {
        features: [Feature.CleanupToolcacheBundles],
        runnerEnvironment: "self-hosted",
      },
      ({ cleanupDiagnostic, destinationDirectory, staleDirectory }) => {
        t.true(fs.existsSync(staleDirectory));
        t.true(fs.existsSync(destinationDirectory));
        t.is(cleanupDiagnostic, undefined);
      },
    );
  },
);

test.serial(
  "downloadCodeQL does not clean up the toolcache when the runner environment is unknown",
  async (t) => {
    // A runner that doesn't report its environment must be treated as not GitHub-hosted, since its
    // toolcache may well outlive the job.
    await testToolcacheCleanup(
      t,
      {
        features: [Feature.CleanupToolcacheBundles],
        runnerEnvironment: undefined,
      },
      ({ cleanupDiagnostic, destinationDirectory, staleDirectory }) => {
        t.true(fs.existsSync(staleDirectory));
        t.true(fs.existsSync(destinationDirectory));
        t.is(cleanupDiagnostic, undefined);
      },
    );
  },
);

test.serial(
  "downloadCodeQL deletes other CodeQL bundles from the toolcache when enabled on a GitHub-hosted runner",
  async (t) => {
    await testToolcacheCleanup(
      t,
      {
        features: [Feature.CleanupToolcacheBundles],
        runnerEnvironment: "github-hosted",
      },
      ({ cleanupDiagnostic, destinationDirectory, staleDirectory }) => {
        t.false(
          fs.existsSync(staleDirectory),
          "Should delete the version directory, including the `tool-cache` marker file it contains.",
        );
        t.false(
          fs.existsSync(path.join(destinationDirectory, os.arch(), "contents")),
          "Should also delete a partial entry for the version we are about to download, rather " +
            "than extracting over it.",
        );
        t.deepEqual(cleanupDiagnostic, {
          deletedVersions: [CLEANUP_STALE_VERSION, CLEANUP_CLI_VERSION].sort(),
          failed: false,
        });
      },
    );
  },
);

test.serial(
  "downloadCodeQL reports no deleted versions when the toolcache has no CodeQL bundles",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

      // A toolcache with other tools in it, but no CodeQL.
      const otherToolDirectory = createToolcacheEntry(tmpDir, "Node", "20.0.0");

      const cleanupDiagnostic = await runDownloadCodeQL(tmpDir, [
        Feature.CleanupToolcacheBundles,
      ]);

      t.true(fs.existsSync(otherToolDirectory));
      t.deepEqual(cleanupDiagnostic, { deletedVersions: [], failed: false });
    });
  },
);

test.serial(
  "downloadCodeQL continues when deleting a CodeQL bundle from the toolcache fails",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

      createToolcacheEntry(tmpDir, "CodeQL", CLEANUP_CLI_VERSION);
      const staleDirectory = createToolcacheEntry(
        tmpDir,
        "CodeQL",
        CLEANUP_STALE_VERSION,
      );

      const rmStub = sinon
        .stub(fs.promises, "rm")
        .rejects(new Error("EACCES: permission denied"));

      const cleanupDiagnostic = await runDownloadCodeQL(tmpDir, [
        Feature.CleanupToolcacheBundles,
      ]);

      // Restore before `withTmpDir` cleans up after itself.
      rmStub.restore();

      t.true(fs.existsSync(staleDirectory));
      t.deepEqual(
        cleanupDiagnostic,
        { deletedVersions: [], failed: true },
        "Should not report versions that we failed to delete.",
      );
    });
  },
);

test.serial(
  "downloadCodeQL continues when cleaning up the toolcache throws",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

      createToolcacheEntry(tmpDir, "CodeQL", CLEANUP_CLI_VERSION);

      sinon
        .stub(toolsDownload, "deleteToolcacheBundles")
        .rejects(new Error("RUNNER_TOOL_CACHE is not set"));

      const cleanupDiagnostic = await runDownloadCodeQL(tmpDir, [
        Feature.CleanupToolcacheBundles,
      ]);

      t.deepEqual(cleanupDiagnostic, { deletedVersions: [], failed: true });
    });
  },
);

test.serial(
  "downloadCodeQL does not follow a symlinked CodeQL toolcache directory",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      const toolcacheRoot = path.join(tmpDir, "toolcache");
      setupActionsVars(tmpDir, toolcacheRoot);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

      // Somewhere the toolcache cleanup must never reach.
      const outsideDirectory = path.join(tmpDir, "outside");
      createToolcacheEntry(outsideDirectory, "CodeQL", CLEANUP_STALE_VERSION);
      createToolcacheEntry(outsideDirectory, "CodeQL", CLEANUP_CLI_VERSION);

      fs.mkdirSync(toolcacheRoot, { recursive: true });
      fs.symlinkSync(
        path.join(outsideDirectory, "CodeQL"),
        path.join(toolcacheRoot, "CodeQL"),
      );

      const cleanupDiagnostic = await runDownloadCodeQL(toolcacheRoot, [
        Feature.CleanupToolcacheBundles,
      ]);

      t.true(
        fs.existsSync(
          path.join(outsideDirectory, "CodeQL", CLEANUP_STALE_VERSION),
        ),
        "Should not delete anything through a symlinked CodeQL directory.",
      );
      t.deepEqual(cleanupDiagnostic, { deletedVersions: [], failed: true });
    });
  },
);

test.serial(
  "downloadCodeQL does not clean up the toolcache once a step has already obtained the tools",
  async (t) => {
    // `.github/workflows/codeql.yml` sets up CodeQL twice and then runs both returned paths. If the
    // second setup downloads, it must not delete the bundle the first one handed out.
    await testToolcacheCleanup(
      t,
      {
        features: [Feature.CleanupToolcacheBundles],
        runnerEnvironment: "github-hosted",
        setUp: () => {
          process.env[EnvVar.HAS_OBTAINED_CODEQL_TOOLS] = "true";
        },
      },
      ({ cleanupDiagnostic, destinationDirectory, staleDirectory }) => {
        t.true(fs.existsSync(staleDirectory));
        t.true(fs.existsSync(destinationDirectory));
        t.is(cleanupDiagnostic, undefined);
      },
    );
  },
);

test.serial(
  "setupCodeQLBundle records that this job has obtained the CodeQL tools",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      delete process.env[EnvVar.HAS_OBTAINED_CODEQL_TOOLS];

      sinon.stub(setupCodeql, "downloadCodeQL").resolves({
        codeqlFolder: "codeql",
        statusReport: { totalDurationMs: 1 },
        toolsVersion: LINKED_CLI_VERSION.cliVersion,
      });

      await setupCodeql.setupCodeQLBundle(
        "linked",
        SAMPLE_DOTCOM_API_DETAILS,
        tmpDir,
        GitHubVariant.DOTCOM,
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        createFeatures([]),
        getRunnerLogger(true),
      );

      t.is(
        process.env[EnvVar.HAS_OBTAINED_CODEQL_TOOLS],
        "true",
        "A later step must be able to tell that the toolcache is in use.",
      );
    });
  },
);

test.serial(
  "downloadCodeQL cleans up the toolcache even when the download will not be cached",
  async (t) => {
    // A `tools` URL we can't derive a bundle version from is extracted to a temporary directory
    // rather than the toolcache, but the toolcache is on the same filesystem, so emptying it still
    // frees up space for the analysis.
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

      const staleDirectory = createToolcacheEntry(
        tmpDir,
        "CodeQL",
        CLEANUP_STALE_VERSION,
      );

      const cleanupDiagnostic = await runDownloadCodeQL(
        tmpDir,
        [Feature.CleanupToolcacheBundles],
        undefined, // bundleVersion
      );

      t.false(fs.existsSync(staleDirectory));
      t.deepEqual(cleanupDiagnostic, {
        deletedVersions: [CLEANUP_STALE_VERSION],
        failed: false,
      });
    });
  },
);

test.serial(
  "downloadCodeQL reports a failure when the toolcache cannot be inspected",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

      createToolcacheEntry(tmpDir, "CodeQL", CLEANUP_STALE_VERSION);

      const lstatStub = sinon.stub(fs.promises, "lstat").rejects(
        Object.assign(new Error("permission denied"), {
          code: "EACCES",
        }),
      );

      const cleanupDiagnostic = await runDownloadCodeQL(tmpDir, [
        Feature.CleanupToolcacheBundles,
      ]);

      lstatStub.restore();

      t.deepEqual(
        cleanupDiagnostic,
        { deletedVersions: [], failed: true },
        "An error other than the toolcache being absent must not be reported as success.",
      );
    });
  },
);
