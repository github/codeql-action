import * as fs from "fs";
import * as path from "path";

import * as github from "@actions/github";
import * as toolcache from "@actions/tool-cache";
import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as api from "./api-client";
import { EnvVar, ActionsEnvVars } from "./environment";
import { Feature } from "./feature-flags";
import { BuiltInLanguage } from "./languages";
import { getRunnerLogger } from "./logging";
import { getCacheRestoreKeyPrefix } from "./overlay/caching";
import { MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION } from "./per-language-bundles";
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
import { getToolcacheDirectory } from "./tools-download";
import {
  getErrorMessage,
  GitHubVariant,
  initializeEnvironment,
  withTmpDir,
} from "./util";
import * as util from "./util";

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
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-linux64.tar.zst",
    expectedCompressionMethod: "zstd",
  },
  {
    platform: "darwin",
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-osx64.tar.zst",
    expectedCompressionMethod: "zstd",
  },
  {
    platform: "win32",
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-win64.tar.gz",
    expectedCompressionMethod: "gzip",
  },
  {
    platform: "linux",
    tarSupportsZstd: false,
    expectedBundleName: "codeql-bundle-linux64.tar.gz",
    expectedCompressionMethod: "gzip",
  },
] as const;

for (const {
  platform,
  tarSupportsZstd,
  expectedBundleName,
  expectedCompressionMethod,
} of LINKED_BUNDLE_TEST_CASES) {
  test.serial(
    `getCodeQLSource selects ${expectedBundleName} for linked tools`,
    async (t) => {
      const features = createFeatures([]);
      sinon.stub(process, "platform").value(platform);

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
        perLanguageBundle: undefined,
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
        perLanguageBundle: undefined,
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

const PER_LANGUAGE_CLI_VERSION = {
  enabledVersions: [
    {
      cliVersion: MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION,
      tagName: `codeql-bundle-v${MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION}`,
    },
  ],
};

/**
 * Reads the `isPerLanguageBundle` argument of a call to `downloadCodeQL`, which controls whether
 * the bundle may be added to the toolcache.
 */
function isPerLanguageBundleArg(
  call: sinon.SinonSpyCall<
    Parameters<typeof setupCodeql.downloadCodeQL>,
    unknown
  >,
): boolean {
  return call.args[4];
}

test.serial("getCodeQLBundleName names the per-language bundle", (t) => {
  sinon.stub(process, "platform").value("linux");
  t.is(
    setupCodeql.getCodeQLBundleName("zstd", BuiltInLanguage.java),
    "codeql-bundle-java-linux64.tar.zst",
  );
  t.is(
    setupCodeql.getCodeQLBundleName("zstd"),
    "codeql-bundle-linux64.tar.zst",
  );
});

test.serial("getCodeQLBundleName names the Swift bundle for macOS", (t) => {
  sinon.stub(process, "platform").value("darwin");
  t.is(
    setupCodeql.getCodeQLBundleName("zstd", BuiltInLanguage.swift),
    "codeql-bundle-swift-osx64.tar.zst",
  );
});

test.serial(
  "getCodeQLSource downloads the per-language bundle for a single explicit language",
  async (t) => {
    sinon.stub(process, "platform").value("linux");
    process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const source = await setupCodeql.getCodeQLSource(
        undefined,
        PER_LANGUAGE_CLI_VERSION,
        // Default setup passes the combined language name, which needs normalizing.
        ["java-kotlin"],
        false, // useOverlayAwareDefaultCliVersion
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        true, // tarSupportsZstd
        createFeatures([Feature.PerLanguageBundles]),
        getRunnerLogger(true),
      );

      t.is(source.sourceType, "download");
      if (source.sourceType === "download") {
        t.true(
          source.codeqlURL.endsWith("/codeql-bundle-java-linux64.tar.zst"),
          `Unexpected URL ${source.codeqlURL}`,
        );
        t.is(source.perLanguageBundle?.language, BuiltInLanguage.java);
        t.true(
          source.perLanguageBundle?.combinedBundleURL?.endsWith(
            "/codeql-bundle-linux64.tar.zst",
          ),
        );
      }
    });
  },
);

test.serial(
  "getCodeQLSource downloads the combined bundle when the feature is disabled",
  async (t) => {
    sinon.stub(process, "platform").value("linux");
    process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const source = await setupCodeql.getCodeQLSource(
        undefined,
        PER_LANGUAGE_CLI_VERSION,
        ["java"],
        false, // useOverlayAwareDefaultCliVersion
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        true, // tarSupportsZstd
        createFeatures([]),
        getRunnerLogger(true),
      );

      t.is(source.sourceType, "download");
      if (source.sourceType === "download") {
        t.true(source.codeqlURL.endsWith("/codeql-bundle-linux64.tar.zst"));
        t.is(source.perLanguageBundle, undefined);
      }
    });
  },
);

/**
 * Stubs out the download of the CodeQL bundle, creating the destination directory as the real
 * implementation does.
 */
function stubDownloadAndExtract() {
  return sinon
    .stub(toolsDownload, "downloadAndExtract")
    .callsFake(async (_url, _compressionMethod, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      return { totalDurationMs: 100 };
    });
}

test.serial(
  "downloadCodeQL does not add a per-language bundle to the toolcache",
  async (t) => {
    const extractStub = stubDownloadAndExtract();

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      const { codeqlFolder } = await setupCodeql.downloadCodeQL(
        "https://github.com/github/codeql-action/releases/download/codeql-bundle-v9.9.9/codeql-bundle-java-linux64.tar.zst",
        "zstd",
        "v9.9.9",
        "9.9.9",
        true, // isPerLanguageBundle
        SAMPLE_DOTCOM_API_DETAILS,
        undefined,
        tmpDir,
        getRunnerLogger(true),
      );

      // Even though we know the bundle version, the bundle must be extracted somewhere that a
      // later job analyzing a different language cannot pick it up from.
      t.is(codeqlFolder, extractStub.firstCall.args[2]);
      t.false(codeqlFolder.startsWith(getToolcacheDirectory("9.9.9")));
      t.true(codeqlFolder.startsWith(tmpDir));
      t.false(fs.existsSync(`${codeqlFolder}.complete`));
    });
  },
);

test.serial(
  "downloadCodeQL adds the combined bundle to the toolcache",
  async (t) => {
    const extractStub = stubDownloadAndExtract();

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      const { codeqlFolder } = await setupCodeql.downloadCodeQL(
        "https://github.com/github/codeql-action/releases/download/codeql-bundle-v9.9.9/codeql-bundle-linux64.tar.zst",
        "zstd",
        "v9.9.9",
        "9.9.9",
        false, // isPerLanguageBundle
        SAMPLE_DOTCOM_API_DETAILS,
        undefined,
        tmpDir,
        getRunnerLogger(true),
      );

      t.is(codeqlFolder, extractStub.firstCall.args[2]);
      t.is(codeqlFolder, getToolcacheDirectory("9.9.9"));
      t.true(fs.existsSync(`${codeqlFolder}.complete`));
    });
  },
);

test.serial(
  "setupCodeQLBundle asks for the per-language bundle to be kept out of the toolcache",
  async (t) => {
    sinon.stub(process, "platform").value("linux");
    process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

    const downloadStub = sinon.stub(setupCodeql, "downloadCodeQL").resolves({
      codeqlFolder: "codeql",
      statusReport: { totalDurationMs: 100 },
      toolsVersion: MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION,
    });

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const result = await setupCodeql.setupCodeQLBundle(
        undefined,
        SAMPLE_DOTCOM_API_DETAILS,
        tmpDir,
        GitHubVariant.DOTCOM,
        PER_LANGUAGE_CLI_VERSION,
        ["java"],
        false, // useOverlayAwareDefaultCliVersion
        createFeatures([Feature.PerLanguageBundles]),
        getRunnerLogger(true),
      );

      t.true(downloadStub.calledOnce);
      t.true(isPerLanguageBundleArg(downloadStub.firstCall));
      t.is(
        result.toolsDownloadStatusReport?.bundleLanguage,
        BuiltInLanguage.java,
      );
      t.is(
        result.toolsDownloadStatusReport?.perLanguageBundleFallback,
        undefined,
      );
    });
  },
);

test.serial(
  "setupCodeQLBundle falls back to the combined bundle if the per-language bundle is missing",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    sinon.stub(process, "platform").value("linux");
    process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

    const downloadStub = sinon.stub(setupCodeql, "downloadCodeQL");
    downloadStub
      .onFirstCall()
      .rejects(new util.HTTPError("Not Found", 404))
      .onSecondCall()
      .resolves({
        codeqlFolder: "codeql",
        statusReport: { totalDurationMs: 100 },
        toolsVersion: MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION,
      });

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const result = await setupCodeql.setupCodeQLBundle(
        undefined,
        SAMPLE_DOTCOM_API_DETAILS,
        tmpDir,
        GitHubVariant.DOTCOM,
        PER_LANGUAGE_CLI_VERSION,
        ["java"],
        false, // useOverlayAwareDefaultCliVersion
        createFeatures([Feature.PerLanguageBundles]),
        logger,
      );

      t.true(downloadStub.calledTwice);
      t.true(
        downloadStub.secondCall.args[0].endsWith(
          "/codeql-bundle-linux64.tar.zst",
        ),
      );
      // The combined bundle may be added to the toolcache.
      t.false(isPerLanguageBundleArg(downloadStub.secondCall));
      t.is(result.toolsDownloadStatusReport?.perLanguageBundleFallback, true);
      t.is(result.toolsDownloadStatusReport?.bundleLanguage, undefined);
      checkExpectedLogMessages(t, loggedMessages, [
        "No java CodeQL bundle was found at",
      ]);
    });
  },
);

test.serial(
  "setupCodeQLBundle keeps an explicitly requested per-language bundle out of the toolcache",
  async (t) => {
    const downloadStub = sinon.stub(setupCodeql, "downloadCodeQL").resolves({
      codeqlFolder: "codeql",
      statusReport: { totalDurationMs: 100 },
      toolsVersion: "9.9.9",
    });

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const result = await setupCodeql.setupCodeQLBundle(
        "https://github.com/github/codeql-action/releases/download/codeql-bundle-v9.9.9/codeql-bundle-ruby-linux64.tar.zst",
        SAMPLE_DOTCOM_API_DETAILS,
        tmpDir,
        GitHubVariant.DOTCOM,
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        createFeatures([]),
        getRunnerLogger(true),
      );

      // Even though we did not choose this bundle, it is still missing most of its extractors.
      t.true(downloadStub.calledOnce);
      t.true(isPerLanguageBundleArg(downloadStub.firstCall));
      t.is(
        result.toolsDownloadStatusReport?.bundleLanguage,
        BuiltInLanguage.ruby,
      );
    });
  },
);

test.serial(
  "setupCodeQLBundle does not substitute a bundle for an explicitly requested one that is missing",
  async (t) => {
    const downloadStub = sinon
      .stub(setupCodeql, "downloadCodeQL")
      .rejects(new util.HTTPError("Not Found", 404));

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      await t.throwsAsync(
        setupCodeql.setupCodeQLBundle(
          "https://github.com/github/codeql-action/releases/download/codeql-bundle-v9.9.9/codeql-bundle-ruby-linux64.tar.zst",
          SAMPLE_DOTCOM_API_DETAILS,
          tmpDir,
          GitHubVariant.DOTCOM,
          SAMPLE_DEFAULT_CLI_VERSION,
          undefined, // rawLanguages
          false, // useOverlayAwareDefaultCliVersion
          createFeatures([]),
          getRunnerLogger(true),
        ),
      );

      // Falling back would silently ignore the bundle that was asked for.
      t.true(downloadStub.calledOnce);
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
