import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { performance } from "perf_hooks";

import * as github from "@actions/github";
import * as toolcache from "@actions/tool-cache";
import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as api from "./api-client";
import * as diagnostics from "./diagnostics";
import { ActionsEnvVars, EnvVar, getEnv, ReadOnlyEnv } from "./environment";
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
  checkUnexpectedLogMessages,
  createFeatures,
  createTestConfig,
  getRecordingLogger,
  getTestEnv,
  makeMacro,
  mockBundleDownloadApi,
  setupActionsVars,
  setupTests,
} from "./testing-utils";
import * as toolsDownload from "./tools-download";
import {
  getErrorMessage,
  GitHubVariant,
  HTTPError,
  initializeEnvironment,
  withTmpDir,
} from "./util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment("1.2.3");
});

function stubDownloadAndExtract() {
  return sinon
    .stub(toolsDownload, "downloadAndExtract")
    .callsFake(async (_url, _compressionMethod, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      return { downloadDurationMs: 200, totalDurationMs: 300 };
    });
}

/** Models a hosted Linux runner with zstd and the latest nightly release. */
function stubHostedNightly(tagName: string) {
  sinon.stub(process, "platform").value("linux");
  sinon.stub(process, "arch").value("x64");
  process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";
  sinon.stub(tar, "isZstdAvailable").resolves({
    available: true,
    foundZstdBinary: true,
  });
  const fetchRelease = sinon
    .stub<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    .rejects(new Error("Unexpected API request in nightly bundle test"));
  fetchRelease
    .withArgs(
      "https://api.github.com/repos/dsp-testing/codeql-cli-nightlies/releases?per_page=1&page=1&prerelease=true",
      sinon.match({ method: "GET" }),
    )
    .callsFake(
      async () =>
        new Response(JSON.stringify([{ tag_name: tagName }]), {
          headers: { "content-type": "application/json" },
        }),
    );
  const client = github.getOctokit("123", {
    request: { fetch: fetchRelease },
  });
  sinon.stub(api, "getApiClient").value(() => client);
  return fetchRelease;
}

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
      const url = mockBundleDownloadApi({ tagName });
      const source = await setupCodeql.getCodeQLSource(
        url,
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        false,
        features,
        getRunnerLogger(true),
      );

      t.deepEqual(source, {
        bundle: { kind: "combined", url },
        bundleVersion: "v1.2.3",
        cliVersion: "1.2.3",
        compressionMethod: "gzip",
        sourceType: "download",
        toolsVersion: "1.2.3",
      } satisfies setupCodeql.CodeQLDownloadSource);
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
          t.is(source.bundle.kind, "combined");
          t.true(source.bundle.url.endsWith(`/${expectedBundleName}`));
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

    const extractStub = stubDownloadAndExtract();

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const result = await setupCodeql.setupCodeQLBundle(
        "linked",
        SAMPLE_DOTCOM_API_DETAILS,
        tmpDir,
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
      t.true(extractStub.calledOnce);
      t.is(
        result.codeqlFolder,
        toolcache.find("CodeQL", LINKED_CLI_VERSION.cliVersion),
      );
      t.deepEqual(result.toolsDownloadStatusReport, {
        downloadDurationMs: 200,
        totalDurationMs: 300,
      });
      checkUnexpectedLogMessages(t, loggedMessages, [
        "Not caching the CodeQL tools",
        "Could not cache CodeQL tools",
      ]);

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

    const extractStub = stubDownloadAndExtract();

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const result = await setupCodeql.setupCodeQLBundle(
        bundleUrl,
        SAMPLE_DOTCOM_API_DETAILS,
        tmpDir,
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
      t.true(extractStub.calledOnce);
      t.is(extractStub.firstCall.args[0], bundleUrl);
      t.is(result.codeqlFolder, toolcache.find("CodeQL", expectedVersion));
      t.deepEqual(result.toolsDownloadStatusReport, {
        downloadDurationMs: 200,
        totalDurationMs: 300,
      });

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
  "getCodeQLSource and setupCodeQLBundle preserve the nightly version when tools == nightly",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures([]);
    const extractStub = stubDownloadAndExtract();

    const expectedDate = "30260213";
    const expectedTag = `codeql-bundle-${expectedDate}`;

    stubHostedNightly(expectedTag);

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
        bundle: { kind: "combined", url: expectedURL },
        bundleVersion: expectedDate,
        cliVersion: undefined,
        compressionMethod: "zstd",
        sourceType: "download",
        toolsVersion: expectedVersion,
      } satisfies setupCodeql.CodeQLToolsSource);

      const result = await setupCodeql.setupCodeQLBundle(
        "nightly",
        SAMPLE_DOTCOM_API_DETAILS,
        tmpDir,
        GitHubVariant.DOTCOM,
        SAMPLE_DEFAULT_CLI_VERSION,
        ["javascript"],
        false, // useOverlayAwareDefaultCliVersion
        features,
        logger,
      );

      t.true(extractStub.calledOnce);
      t.is(extractStub.firstCall.args[0], expectedURL);
      t.is(result.toolsVersion, source.toolsVersion);
      t.is(result.toolsSource, setupCodeql.ToolsSource.Download);
      t.is(result.codeqlFolder, toolcache.find("CodeQL", expectedVersion));
      t.true(fs.existsSync(`${result.codeqlFolder}.complete`));
      t.deepEqual(toolcache.findAllVersions("CodeQL"), [expectedVersion]);

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

    stubHostedNightly(expectedTag);

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
        bundle: { kind: "combined", url: expectedURL },
        bundleVersion: expectedDate,
        cliVersion: undefined,
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

for (const bundlePath of [
  "codeql-bundle.tar.gz",
  "codeql-bundle.tar.zst",
  "codeql-bundle-/codeql-bundle.tar.gz",
  "codeql-bundle-linux64.tar.zst",
  "codeql-bundle-ruby-linux64.tar.zst",
]) {
  test.serial(
    `setupCodeQLBundle reports an unknown version for ${bundlePath}`,
    async (t) => {
      const extractStub = stubDownloadAndExtract();
      const downloadSpy = sinon.spy(setupCodeql, "downloadCodeQL");
      const url = `https://example.com/${bundlePath}`;
      const messages: LoggedMessage[] = [];

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const result = await setupCodeql.setupCodeQLBundle(
          url,
          SAMPLE_DOTCOM_API_DETAILS,
          tmpDir,
          GitHubVariant.DOTCOM,
          SAMPLE_DEFAULT_CLI_VERSION,
          undefined, // rawLanguages
          false, // useOverlayAwareDefaultCliVersion
          createFeatures([]),
          getRecordingLogger(messages),
        );

        t.true(extractStub.calledOnce);
        t.is(extractStub.firstCall.args[0], url);
        t.is(downloadSpy.firstCall.args[0].bundleVersion, undefined);
        t.is(downloadSpy.firstCall.args[0].toolsVersion, "unknown");
        t.is(result.toolsVersion, "unknown");
        t.is(result.toolsSource, setupCodeql.ToolsSource.Download);
        t.is(
          result.toolsDownloadStatusReport?.perLanguage?.tools_bundle_language,
          bundlePath === "codeql-bundle-ruby-linux64.tar.zst"
            ? BuiltInLanguage.ruby
            : undefined,
        );
        t.is(path.dirname(result.codeqlFolder), tmpDir);
        t.true(fs.existsSync(result.codeqlFolder));
        t.false(fs.existsSync(`${result.codeqlFolder}.complete`));
        t.deepEqual(toolcache.findAllVersions("CodeQL"), []);
        checkExpectedLogMessages(t, messages, [
          `Using CodeQL CLI sourced from ${url}`,
          bundlePath === "codeql-bundle-ruby-linux64.tar.zst"
            ? "Not caching the CodeQL tools because they came from a bundle that contains only a single language."
            : `Could not cache CodeQL tools because we could not determine the bundle version from the URL ${url}.`,
        ]);
      });
    },
  );
}

test.serial(
  "setupCodeQLBundle preserves local installation without cleaning the toolcache",
  async (t) => {
    const cleanupSpy = sinon.spy(toolsDownload, "deleteToolcacheBundles");
    const downloadSpy = sinon.spy(setupCodeql, "downloadCodeQL");

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";
      const cachedDirectory = createToolcacheEntry(
        tmpDir,
        "CodeQL",
        CLEANUP_STALE_VERSION,
      );
      const result = await setupCodeql.setupCodeQLBundle(
        path.join(__dirname, "../src/testdata/codeql-bundle.tar.gz"),
        SAMPLE_DOTCOM_API_DETAILS,
        tmpDir,
        GitHubVariant.DOTCOM,
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        createFeatures([Feature.CleanupToolcacheBundles]),
        getRunnerLogger(true),
      );

      t.is(result.toolsVersion, "local");
      t.is(result.toolsSource, setupCodeql.ToolsSource.Local);
      t.is(result.toolsDownloadStatusReport, undefined);
      t.is(path.dirname(result.codeqlFolder), tmpDir);
      t.true(fs.existsSync(result.codeqlFolder));
      t.false(fs.existsSync(`${result.codeqlFolder}.complete`));
      t.true(fs.existsSync(cachedDirectory));
      t.true(cleanupSpy.notCalled);
      t.true(downloadSpy.notCalled);
      t.is(process.env[EnvVar.HAS_SET_UP_CODEQL], "true");
    });
  },
);

for (const toolsInput of ["nightly", "nightly-latest"]) {
  test.serial(
    `getCodeQLSource selects the latest per-language nightly for tools == ${toolsInput}`,
    async (t) => {
      const expectedTag = "codeql-bundle-30260213";
      const baseURL = `https://github.com/dsp-testing/codeql-cli-nightlies/releases/download/${expectedTag}`;
      const latestNightlyRequest = stubHostedNightly(expectedTag);

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource(
          toolsInput,
          SAMPLE_DEFAULT_CLI_VERSION,
          ["java"],
          false, // useOverlayAwareDefaultCliVersion
          SAMPLE_DOTCOM_API_DETAILS,
          GitHubVariant.DOTCOM,
          true, // tarSupportsZstd
          createFeatures([Feature.PerLanguageBundles]),
          getRunnerLogger(true),
        );

        t.deepEqual(source, {
          sourceType: "download",
          bundle: {
            kind: "per-language",
            language: BuiltInLanguage.java,
            url: `${baseURL}/codeql-bundle-java-linux64.tar.zst`,
            combinedBundleURL: `${baseURL}/codeql-bundle-linux64.tar.zst`,
          },
          bundleVersion: "30260213",
          cliVersion: undefined,
          compressionMethod: "zstd",
          toolsVersion: "0.0.0-30260213",
        } satisfies setupCodeql.CodeQLDownloadSource);
        t.true(latestNightlyRequest.calledOnce);
      });
    },
  );
}

test.serial(
  "getCodeQLSource downloads a combined nightly bundle when per-language selection is ineligible",
  async (t) => {
    const expectedTag = "codeql-bundle-30260213";
    stubHostedNightly(expectedTag);

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      for (const { languages, features } of [
        // The per-language feature is disabled.
        { languages: ["java"], features: createFeatures([]) },
        // More than one language requires a combined bundle.
        {
          languages: ["java", "python"],
          features: createFeatures([Feature.PerLanguageBundles]),
        },
      ]) {
        const source = await setupCodeql.getCodeQLSource(
          "nightly",
          SAMPLE_DEFAULT_CLI_VERSION,
          languages,
          false, // useOverlayAwareDefaultCliVersion
          SAMPLE_DOTCOM_API_DETAILS,
          GitHubVariant.DOTCOM,
          true, // tarSupportsZstd
          features,
          getRunnerLogger(true),
        );

        t.is(source.sourceType, "download");
        if (source.sourceType === "download") {
          t.deepEqual(source.bundle, {
            kind: "combined",
            url: `https://github.com/dsp-testing/codeql-cli-nightlies/releases/download/${expectedTag}/codeql-bundle-linux64.tar.zst`,
          });
        }
      }
    });
  },
);

for (const perLanguageBundles of [false, true]) {
  test.serial(
    `getCodeQLSource uses the latest ${perLanguageBundles ? "per-language" : "combined"} bundle for a forced nightly`,
    async (t) => {
      const expectedTag = "codeql-bundle-30260213";
      const baseURL = `https://github.com/dsp-testing/codeql-cli-nightlies/releases/download/${expectedTag}`;
      const latestNightlyRequest = stubHostedNightly(expectedTag);

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir, { GITHUB_EVENT_NAME: "dynamic" });
        const source = await setupCodeql.getCodeQLSource(
          undefined, // toolsInput: the nightly is selected by ForceNightly
          SAMPLE_DEFAULT_CLI_VERSION,
          ["java"],
          false, // useOverlayAwareDefaultCliVersion
          SAMPLE_DOTCOM_API_DETAILS,
          GitHubVariant.DOTCOM,
          true, // tarSupportsZstd
          createFeatures(
            perLanguageBundles
              ? [Feature.ForceNightly, Feature.PerLanguageBundles]
              : [Feature.ForceNightly],
          ),
          getRunnerLogger(true),
        );

        t.is(source.sourceType, "download");
        t.true(latestNightlyRequest.calledOnce);
        if (source.sourceType === "download") {
          const combinedURL = `${baseURL}/codeql-bundle-linux64.tar.zst`;
          t.deepEqual(
            source.bundle,
            perLanguageBundles
              ? {
                  kind: "per-language",
                  language: BuiltInLanguage.java,
                  url: `${baseURL}/codeql-bundle-java-linux64.tar.zst`,
                  combinedBundleURL: combinedURL,
                }
              : { kind: "combined", url: combinedURL },
          );
        }
      });
    },
  );
}

for (const date of ["20200101", "30260213"]) {
  for (const bundle of ["combined", "per-language"] as const) {
    test.serial(
      `getCodeQLSource preserves an explicit ${bundle} nightly URL for ${date}`,
      async (t) => {
        const latestNightlyRequest = stubHostedNightly(
          "codeql-bundle-30260213",
        );
        const asset =
          bundle === "combined"
            ? "codeql-bundle-linux64.tar.zst"
            : "codeql-bundle-java-linux64.tar.zst";
        const url = `https://github.com/dsp-testing/codeql-cli-nightlies/releases/download/codeql-bundle-${date}/${asset}`;
        const features = createFeatures([Feature.PerLanguageBundles]);
        const logger = getRecordingLogger([], { logToConsole: false });
        const error = new HTTPError("Not Found", 404);
        const extractStub = sinon
          .stub(toolsDownload, "downloadAndExtract")
          .rejects(error);

        await withTmpDir(async (tmpDir) => {
          setupActionsVars(tmpDir, tmpDir);
          const source = await setupCodeql.getCodeQLSource(
            url,
            SAMPLE_DEFAULT_CLI_VERSION,
            ["java"],
            false,
            SAMPLE_DOTCOM_API_DETAILS,
            GitHubVariant.DOTCOM,
            true,
            features,
            logger,
          );
          t.deepEqual(source, {
            sourceType: "download",
            bundle:
              bundle === "combined"
                ? { kind: "combined", url }
                : { kind: "per-language", url, language: BuiltInLanguage.java },
            bundleVersion: date,
            cliVersion: undefined,
            compressionMethod: "zstd",
            toolsVersion: `0.0.0-${date}`,
          } satisfies setupCodeql.CodeQLDownloadSource);

          await t.throwsAsync(
            setupCodeql.setupCodeQLBundle(
              url,
              SAMPLE_DOTCOM_API_DETAILS,
              tmpDir,
              GitHubVariant.DOTCOM,
              SAMPLE_DEFAULT_CLI_VERSION,
              ["java"],
              false,
              features,
              logger,
            ),
            { is: error },
          );
          t.true(extractStub.calledOnce);
          t.is(extractStub.firstCall.args[0], url);
          t.true(latestNightlyRequest.notCalled);
        });
      },
    );
  }
}

test.serial(
  "getCodeQLSource reports a missing release tag when a toolcache entry disappears",
  async (t) => {
    sinon
      .stub(toolcache, "findAllVersions")
      .returns([MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION]);
    sinon.stub(toolcache, "find").returns("");

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir, { GITHUB_EVENT_NAME: "dynamic" });
      await t.throwsAsync(
        setupCodeql.getCodeQLSource(
          "toolcache",
          SAMPLE_DEFAULT_CLI_VERSION,
          ["java"],
          false,
          SAMPLE_DOTCOM_API_DETAILS,
          GitHubVariant.DOTCOM,
          true,
          createFeatures([]),
          getRunnerLogger(true),
        ),
        {
          message:
            "Could not determine a release tag for the requested CodeQL bundle.",
        },
      );
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

test.serial(
  "getCodeQLBundleName returns a per-language bundle name only when a language is specified",
  (t) => {
    sinon.stub(process, "platform").value("linux");
    sinon.stub(process, "arch").value("x64");
    t.is(
      setupCodeql.getCodeQLBundleName("zstd", BuiltInLanguage.java),
      "codeql-bundle-java-linux64.tar.zst",
    );
    t.is(
      setupCodeql.getCodeQLBundleName("zstd"),
      "codeql-bundle-linux64.tar.zst",
    );
  },
);

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
    sinon.stub(process, "arch").value("x64");
    process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const source = await setupCodeql.getCodeQLSource(
        undefined,
        PER_LANGUAGE_CLI_VERSION,
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
          source.bundle.url.endsWith("/codeql-bundle-java-linux64.tar.zst"),
          `Unexpected URL ${source.bundle.url}`,
        );
        t.is(source.bundle.kind, "per-language");
        if (source.bundle.kind === "per-language") {
          t.is(source.bundle.language, BuiltInLanguage.java);
          t.true(
            source.bundle.combinedBundleURL?.endsWith(
              "/codeql-bundle-linux64.tar.zst",
            ),
          );
        }
      }
    });
  },
);

test.serial(
  "getCodeQLSource downloads the combined bundle when the feature is disabled",
  async (t) => {
    sinon.stub(process, "platform").value("linux");
    sinon.stub(process, "arch").value("x64");
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
        t.true(source.bundle.url.endsWith("/codeql-bundle-linux64.tar.zst"));
        t.is(source.bundle.kind, "combined");
      }
    });
  },
);

for (const fallback of [false, true]) {
  test.serial(
    `setupCodeQLBundle retains the selected release identity for an opaque asset URL${fallback ? " with fallback" : ""}`,
    async (t) => {
      sinon.stub(process, "platform").value("linux");
      sinon.stub(process, "arch").value("x64");
      sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";
      sinon.stub(tar, "isZstdAvailable").resolves({
        available: true,
        foundZstdBinary: true,
      });
      const tag = PER_LANGUAGE_CLI_VERSION.enabledVersions[0].tagName;
      const assetURL =
        "https://api.github.com/repos/codeql-testing/action-fork/releases/assets/123";
      const combinedURL = `${assetURL}4`;
      const fetchRelease = sinon
        .stub<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
        .callsFake(
          async () =>
            new Response(
              JSON.stringify({
                assets: [
                  { name: "codeql-bundle-java-linux64.tar.zst", url: assetURL },
                  {
                    name: "codeql-bundle-linux64.tar.zst",
                    url: combinedURL,
                  },
                ],
              }),
              { headers: { "content-type": "application/json" } },
            ),
        );
      const client = github.getOctokit("123", {
        request: { fetch: fetchRelease },
      });
      sinon.stub(api, "getApiClient").value(() => client);
      const authorizationSpy = sinon.spy(api, "getAuthorizationHeaderFor");
      const extractStub = stubDownloadAndExtract();
      if (fallback) {
        extractStub.onFirstCall().rejects(new HTTPError("Not Found", 404));
      }

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir, {
          GITHUB_ACTION_REPOSITORY: "codeql-testing/action-fork",
        });
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

        t.true(fetchRelease.calledTwice);
        t.is(
          fetchRelease.firstCall.args[0],
          `https://api.github.com/repos/codeql-testing/action-fork/releases/tags/${tag}`,
        );
        t.is(extractStub.callCount, fallback ? 2 : 1);
        t.is(extractStub.firstCall.args[0], assetURL);
        t.is(extractStub.lastCall.args[0], fallback ? combinedURL : assetURL);
        t.is(authorizationSpy.callCount, extractStub.callCount);
        t.is(authorizationSpy.firstCall.args[2], assetURL);
        t.is(
          authorizationSpy.lastCall.args[2],
          fallback ? combinedURL : assetURL,
        );
        t.is(extractStub.lastCall.args[3], "token token");
        t.is(result.toolsVersion, MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION);
        t.is(
          result.toolsDownloadStatusReport?.perLanguage?.tools_bundle_language,
          fallback ? undefined : BuiltInLanguage.java,
        );
        t.is(
          result.toolsDownloadStatusReport?.perLanguage
            ?.tools_per_language_bundle_fallback,
          fallback ? true : undefined,
        );
        if (fallback) {
          t.is(
            result.codeqlFolder,
            toolcache.find("CodeQL", MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION),
          );
          t.true(fs.existsSync(`${result.codeqlFolder}.complete`));
        } else {
          t.is(path.dirname(result.codeqlFolder), tmpDir);
          t.deepEqual(toolcache.findAllVersions("CodeQL"), []);
          t.false(fs.existsSync(`${result.codeqlFolder}.complete`));
        }
      });
    },
  );
}

for (const bundle of ["per-language", "combined", "fallback"] as const) {
  test.serial(
    `setupCodeQLBundle preserves the nightly version for a ${bundle} download`,
    async (t) => {
      const expectedDate = "30260213";
      const expectedTag = `codeql-bundle-${expectedDate}`;
      const expectedVersion = `0.0.0-${expectedDate}`;
      const baseURL = `https://github.com/dsp-testing/codeql-cli-nightlies/releases/download/${expectedTag}`;
      const combinedURL = `${baseURL}/codeql-bundle-linux64.tar.zst`;
      const perLanguageURL = `${baseURL}/codeql-bundle-javascript-linux64.tar.zst`;
      const loggedMessages: LoggedMessage[] = [];
      const logger = getRecordingLogger(loggedMessages);

      stubHostedNightly(expectedTag);
      delete process.env[EnvVar.HAS_SET_UP_CODEQL];

      const downloadSpy = sinon.spy(setupCodeql, "downloadCodeQL");
      let elapsedMs = 1000;
      sinon.stub(performance, "now").callsFake(() => elapsedMs);
      const extractStub = sinon
        .stub(toolsDownload, "downloadAndExtract")
        .callsFake(async (_url, _compressionMethod, dest) => {
          if (bundle === "fallback" && extractStub.callCount === 1) {
            elapsedMs += 700.2;
            throw new HTTPError("Not Found", 404);
          }
          elapsedMs += 300.2;
          fs.mkdirSync(dest, { recursive: true });
          return {
            downloadDurationMs: 200,
            extractionDurationMs: 100,
            totalDurationMs: 300,
          };
        });
      const addDiagnostic = sinon.stub(diagnostics, "addNoLanguageDiagnostic");
      const features = createFeatures([
        Feature.PerLanguageBundles,
        Feature.CleanupToolcacheBundles,
      ]);

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const result = await setupCodeql.setupCodeQLBundle(
          "nightly",
          SAMPLE_DOTCOM_API_DETAILS,
          tmpDir,
          GitHubVariant.DOTCOM,
          SAMPLE_DEFAULT_CLI_VERSION,
          bundle === "combined" ? ["javascript", "python"] : ["javascript"],
          false, // useOverlayAwareDefaultCliVersion
          features,
          logger,
        );

        const source = downloadSpy.firstCall.args[0];
        t.is(result.toolsVersion, expectedVersion);
        t.is(result.toolsVersion, source.toolsVersion);
        t.is(
          source.bundle.kind,
          bundle === "combined" ? "combined" : "per-language",
        );
        t.is(result.codeqlFolder, extractStub.lastCall.args[2]);
        t.is(
          result.toolsDownloadStatusReport?.totalDurationMs,
          bundle === "fallback" ? 1000 : 300,
        );
        t.is(result.toolsDownloadStatusReport?.downloadDurationMs, 200);
        t.is(result.toolsDownloadStatusReport?.extractionDurationMs, 100);
        t.is(
          (await downloadSpy.lastCall.returnValue).statusReport.perLanguage
            ?.tools_bundle_language,
          bundle === "per-language" ? BuiltInLanguage.javascript : undefined,
        );
        t.is(extractStub.callCount, bundle === "fallback" ? 2 : 1);
        t.is(downloadSpy.callCount, extractStub.callCount);
        t.is(
          extractStub.firstCall.args[0],
          bundle === "combined" ? combinedURL : perLanguageURL,
        );
        t.is(
          extractStub.lastCall.args[0],
          bundle === "per-language" ? perLanguageURL : combinedURL,
        );
        t.is(
          result.toolsDownloadStatusReport?.perLanguage?.tools_bundle_language,
          bundle === "per-language" ? BuiltInLanguage.javascript : undefined,
        );
        t.is(
          result.toolsDownloadStatusReport?.perLanguage
            ?.tools_per_language_bundle_fallback,
          bundle === "fallback" ? true : undefined,
        );
        t.is(
          addDiagnostic
            .getCalls()
            .filter(
              (call) =>
                call.args[1].source?.id ===
                "codeql-action/toolcache-bundle-cleanup",
            ).length,
          1,
        );
        if (bundle === "fallback") {
          t.deepEqual(downloadSpy.secondCall.args[0], {
            ...source,
            bundle: { kind: "combined", url: combinedURL },
          });
          checkExpectedLogMessages(t, loggedMessages, [
            `No per-language CodeQL bundle for 'javascript' was found at ${perLanguageURL}`,
          ]);
        }
        if (bundle === "per-language") {
          t.is(path.dirname(result.codeqlFolder), tmpDir);
          t.deepEqual(toolcache.findAllVersions("CodeQL"), []);
          t.false(fs.existsSync(`${result.codeqlFolder}.complete`));
        } else {
          t.is(
            result.codeqlFolder,
            toolsDownload.getToolcacheDirectory(expectedVersion),
          );
          t.true(fs.existsSync(`${result.codeqlFolder}.complete`));

          const cachedResult = await setupCodeql.setupCodeQLBundle(
            "nightly",
            SAMPLE_DOTCOM_API_DETAILS,
            tmpDir,
            GitHubVariant.DOTCOM,
            SAMPLE_DEFAULT_CLI_VERSION,
            ["javascript"],
            false, // useOverlayAwareDefaultCliVersion
            features,
            logger,
          );
          t.is(cachedResult.toolsSource, setupCodeql.ToolsSource.Toolcache);
          t.is(cachedResult.toolsVersion, expectedVersion);
          t.is(cachedResult.codeqlFolder, result.codeqlFolder);
          t.is(extractStub.callCount, bundle === "fallback" ? 2 : 1);
        }
      });
    },
  );
}

for (const asset of [
  "codeql-bundle-ruby-linux64.tar.zst",
  "codeql-bundle-%72uby-linux64.tar.zst",
]) {
  test.serial(
    `setupCodeQLBundle keeps explicitly requested ${asset} out of the toolcache`,
    async (t) => {
      const extractStub = stubDownloadAndExtract();
      const messages: LoggedMessage[] = [];
      const url = `https://github.com/github/codeql-action/releases/download/codeql-bundle-v9.9.9/${asset}`;
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "self-hosted";

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const result = await setupCodeql.setupCodeQLBundle(
          url,
          SAMPLE_DOTCOM_API_DETAILS,
          tmpDir,
          GitHubVariant.DOTCOM,
          SAMPLE_DEFAULT_CLI_VERSION,
          undefined, // rawLanguages
          false, // useOverlayAwareDefaultCliVersion
          createFeatures([]),
          getRecordingLogger(messages),
        );

        t.true(extractStub.calledOnce);
        t.is(extractStub.firstCall.args[0], url);
        t.is(result.toolsVersion, "9.9.9");
        t.is(
          result.toolsDownloadStatusReport?.perLanguage?.tools_bundle_language,
          BuiltInLanguage.ruby,
        );
        t.is(path.dirname(result.codeqlFolder), tmpDir);
        t.deepEqual(toolcache.findAllVersions("CodeQL"), []);
        t.false(fs.existsSync(`${result.codeqlFolder}.complete`));
        checkExpectedLogMessages(t, messages, [
          "Not caching the CodeQL tools because they came from a bundle that contains only a single language.",
        ]);
        checkUnexpectedLogMessages(t, messages, [
          "Could not cache CodeQL tools because we could not determine the bundle version",
        ]);
      });
    },
  );
}

for (const error of [
  new HTTPError("Internal Server Error", 500),
  new Error("Connection reset"),
]) {
  test.serial(
    `setupCodeQLBundle does not fall back after ${error.message}`,
    async (t) => {
      sinon.stub(process, "platform").value("linux");
      sinon.stub(process, "arch").value("x64");
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";
      sinon.stub(tar, "isZstdAvailable").resolves({
        available: true,
        foundZstdBinary: true,
      });
      const extractStub = sinon
        .stub(toolsDownload, "downloadAndExtract")
        .rejects(error);

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        await t.throwsAsync(
          setupCodeql.setupCodeQLBundle(
            undefined,
            SAMPLE_DOTCOM_API_DETAILS,
            tmpDir,
            GitHubVariant.DOTCOM,
            PER_LANGUAGE_CLI_VERSION,
            ["java"],
            false, // useOverlayAwareDefaultCliVersion
            createFeatures([Feature.PerLanguageBundles]),
            getRunnerLogger(true),
          ),
          { is: error },
        );
        t.true(extractStub.calledOnce);
        t.true(
          extractStub.firstCall.args[0].endsWith(
            "/codeql-bundle-java-linux64.tar.zst",
          ),
        );
      });
    },
  );
}

test.serial(
  "setupCodeQLBundle does not substitute a bundle for an explicitly requested one that is missing",
  async (t) => {
    const error = new HTTPError("Not Found", 404);
    const extractStub = sinon
      .stub(toolsDownload, "downloadAndExtract")
      .rejects(error);

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
        { is: error },
      );

      t.true(extractStub.calledOnce);
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
 * Stubs out the download and the diagnostic sink, then downloads the CodeQL tools.
 *
 * @returns the extraction directory and the toolcache cleanup diagnostic, if emitted.
 */
async function runDownloadCodeQL(
  toolcacheRoot: string,
  features: Feature[],
  bundleVersion: string | undefined,
  env: ReadOnlyEnv = getEnv(),
): Promise<{
  codeqlFolder: string;
  cleanupDiagnostic: toolsDownload.ToolcacheCleanupResult | undefined;
}> {
  stubDownloadAndExtract();
  const addDiagnostic = sinon.stub(diagnostics, "addNoLanguageDiagnostic");

  const { codeqlFolder } = await setupCodeql.downloadCodeQLBundle(
    {
      env,
      features: createFeatures(features),
      logger: getRunnerLogger(true),
    },
    {
      bundle: {
        kind: "combined",
        url: "https://example.com/codeql-bundle.tar.gz",
      },
      compressionMethod: "gzip",
      bundleVersion,
      cliVersion: CLEANUP_CLI_VERSION,
      sourceType: "download",
      toolsVersion: CLEANUP_CLI_VERSION,
    },
    SAMPLE_DOTCOM_API_DETAILS,
    undefined, // tarVersion
    toolcacheRoot, // tempDir
  );

  const diagnostic = addDiagnostic
    .getCalls()
    .map((call) => call.args[1])
    .find((d) => d.source?.id === "codeql-action/toolcache-bundle-cleanup");

  return {
    codeqlFolder,
    cleanupDiagnostic: diagnostic?.attributes as
      | toolsDownload.ToolcacheCleanupResult
      | undefined,
  };
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

    const { cleanupDiagnostic } = await runDownloadCodeQL(
      tmpDir,
      features,
      CLEANUP_BUNDLE_VERSION,
    );

    t.true(
      fs.existsSync(otherToolDirectory),
      "Should never delete other tools from the toolcache.",
    );

    check({ cleanupDiagnostic, destinationDirectory, staleDirectory });
  });
}

test.serial(
  "downloadCodeQLBundle does not clean up the toolcache when the feature flag is disabled",
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
  "downloadCodeQLBundle does not clean up the toolcache when the runner is not GitHub-hosted",
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
  "downloadCodeQLBundle does not clean up the toolcache when the runner environment is unknown",
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
  "downloadCodeQLBundle deletes other CodeQL bundles from the toolcache when enabled on a GitHub-hosted runner",
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
  "downloadCodeQLBundle reports no deleted versions when the toolcache has no CodeQL bundles",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

      // A toolcache with other tools in it, but no CodeQL.
      const otherToolDirectory = createToolcacheEntry(tmpDir, "Node", "20.0.0");

      const { cleanupDiagnostic } = await runDownloadCodeQL(
        tmpDir,
        [Feature.CleanupToolcacheBundles],
        CLEANUP_BUNDLE_VERSION,
      );

      t.true(fs.existsSync(otherToolDirectory));
      t.deepEqual(cleanupDiagnostic, { deletedVersions: [], failed: false });
    });
  },
);

test.serial(
  "downloadCodeQLBundle continues when deleting a CodeQL bundle from the toolcache fails",
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

      const { cleanupDiagnostic } = await runDownloadCodeQL(
        tmpDir,
        [Feature.CleanupToolcacheBundles],
        CLEANUP_BUNDLE_VERSION,
      );

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
  "deleteToolcacheBundles reports a failure when the toolcache location is unknown",
  async (t) => {
    const messages: LoggedMessage[] = [];

    const result = await toolsDownload.deleteToolcacheBundles({
      env: new ReadOnlyEnv({}),
      logger: getRecordingLogger(messages),
    });

    t.deepEqual(
      result,
      { deletedVersions: [], failed: true },
      "Should report a failure rather than throwing, so the download can continue.",
    );
    checkExpectedLogMessages(t, messages, [
      "Unable to determine toolcache directory: RUNNER_TOOL_CACHE environment variable must be set",
    ]);
  },
);

test.serial(
  "deleteToolcacheBundles uses the supplied environment rather than process.env",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      const ambientRoot = path.join(tmpDir, "ambient");
      const injectedRoot = path.join(tmpDir, "injected");
      setupActionsVars(tmpDir, ambientRoot);

      const ambientVersion = createToolcacheEntry(
        ambientRoot,
        "CodeQL",
        CLEANUP_STALE_VERSION,
      );
      const injectedVersion = createToolcacheEntry(
        injectedRoot,
        "CodeQL",
        CLEANUP_STALE_VERSION,
      );
      const fileEntry = path.join(injectedRoot, "CodeQL", "not-a-directory");
      fs.writeFileSync(fileEntry, "keep");

      const result = await toolsDownload.deleteToolcacheBundles({
        env: new ReadOnlyEnv({
          [ActionsEnvVars.RUNNER_TOOL_CACHE]: injectedRoot,
        }),
        logger: getRunnerLogger(true),
      });

      t.deepEqual(result, {
        deletedVersions: [CLEANUP_STALE_VERSION],
        failed: false,
      });
      t.false(fs.existsSync(injectedVersion));
      t.true(fs.existsSync(ambientVersion));
      t.is(fs.readFileSync(fileEntry, "utf8"), "keep");
    });
  },
);

test.serial(
  "deleteToolcacheBundles reports a failure when the toolcache directory cannot be read",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      const versionDirectory = createToolcacheEntry(
        tmpDir,
        "CodeQL",
        CLEANUP_STALE_VERSION,
      );
      const messages: LoggedMessage[] = [];
      const readdir = sinon
        .stub(fs.promises, "readdir")
        .rejects(new Error("permission denied"));

      try {
        const result = await toolsDownload.deleteToolcacheBundles({
          env: new ReadOnlyEnv({
            [ActionsEnvVars.RUNNER_TOOL_CACHE]: tmpDir,
          }),
          logger: getRecordingLogger(messages),
        });

        t.deepEqual(result, { deletedVersions: [], failed: true });
        t.true(fs.existsSync(versionDirectory));
        checkExpectedLogMessages(t, messages, [
          `Failed to clean up the CodeQL toolcache at '${path.join(tmpDir, "CodeQL")}': permission denied`,
        ]);
      } finally {
        readdir.restore();
      }
    });
  },
);

test.serial(
  "downloadCodeQLBundle does not follow a symlinked CodeQL toolcache directory",
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

      const { cleanupDiagnostic } = await runDownloadCodeQL(
        toolcacheRoot,
        [Feature.CleanupToolcacheBundles],
        CLEANUP_BUNDLE_VERSION,
      );

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
  "downloadCodeQLBundle does not clean up the toolcache once a step has already set up CodeQL",
  async (t) => {
    // `.github/workflows/codeql.yml` sets up CodeQL twice and then runs both returned paths. If the
    // second setup downloads, it must not delete the bundle the first one handed out.
    await testToolcacheCleanup(
      t,
      {
        features: [Feature.CleanupToolcacheBundles],
        runnerEnvironment: "github-hosted",
        setUp: () => {
          process.env[EnvVar.HAS_SET_UP_CODEQL] = "true";
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
  "downloadCodeQLBundle checks the supplied environment before cleaning the toolcache",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";
      delete process.env[EnvVar.HAS_SET_UP_CODEQL];

      const staleDirectory = createToolcacheEntry(
        tmpDir,
        "CodeQL",
        CLEANUP_STALE_VERSION,
      );
      const { codeqlFolder, cleanupDiagnostic } = await runDownloadCodeQL(
        tmpDir,
        [Feature.CleanupToolcacheBundles],
        CLEANUP_BUNDLE_VERSION,
        getTestEnv({ [EnvVar.HAS_SET_UP_CODEQL]: "true" }),
      );

      t.true(fs.existsSync(staleDirectory));
      t.true(fs.existsSync(`${codeqlFolder}.complete`));
      t.is(cleanupDiagnostic, undefined);
    });
  },
);

test.serial(
  "setupCodeQLBundle records that this job has set up CodeQL",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      delete process.env[EnvVar.HAS_SET_UP_CODEQL];

      stubDownloadAndExtract();

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
        process.env[EnvVar.HAS_SET_UP_CODEQL],
        "true",
        "A later step must be able to tell that the toolcache is in use.",
      );
    });
  },
);

test.serial(
  "setupCodeQLBundle cleans up once and propagates a failed combined download",
  async (t) => {
    const error = new HTTPError("Not Found", 404);
    const extractStub = stubDownloadAndExtract().rejects(error);
    const cleanupSpy = sinon.spy(toolsDownload, "deleteToolcacheBundles");

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";
      delete process.env[EnvVar.HAS_SET_UP_CODEQL];
      const staleDirectory = createToolcacheEntry(
        tmpDir,
        "CodeQL",
        CLEANUP_STALE_VERSION,
      );

      await t.throwsAsync(
        setupCodeql.setupCodeQLBundle(
          "linked",
          SAMPLE_DOTCOM_API_DETAILS,
          tmpDir,
          GitHubVariant.DOTCOM,
          SAMPLE_DEFAULT_CLI_VERSION,
          undefined, // rawLanguages
          false, // useOverlayAwareDefaultCliVersion
          createFeatures([Feature.CleanupToolcacheBundles]),
          getRunnerLogger(true),
        ),
        { is: error },
      );

      t.true(cleanupSpy.calledOnce);
      t.true(cleanupSpy.calledBefore(extractStub));
      t.true(extractStub.calledOnce);
      t.false(fs.existsSync(staleDirectory));
      t.false(fs.existsSync(`${extractStub.firstCall.args[2]}.complete`));
      t.deepEqual(toolcache.findAllVersions("CodeQL"), []);
      t.is(process.env[EnvVar.HAS_SET_UP_CODEQL], undefined);
    });
  },
);

test.serial(
  "downloadCodeQLBundle cleans up the toolcache even when the download will not be cached",
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

      const { codeqlFolder, cleanupDiagnostic } = await runDownloadCodeQL(
        tmpDir,
        [Feature.CleanupToolcacheBundles],
        undefined, // bundleVersion
      );

      t.is(path.dirname(codeqlFolder), tmpDir);
      t.not(codeqlFolder, path.join(tmpDir, "CodeQL"));
      t.true(fs.existsSync(codeqlFolder));
      t.false(fs.existsSync(`${codeqlFolder}.complete`));
      t.false(fs.existsSync(staleDirectory));
      t.deepEqual(cleanupDiagnostic, {
        deletedVersions: [CLEANUP_STALE_VERSION],
        failed: false,
      });
    });
  },
);

test.serial(
  "downloadCodeQLBundle reports a failure when the toolcache cannot be inspected",
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

      const { cleanupDiagnostic } = await runDownloadCodeQL(
        tmpDir,
        [Feature.CleanupToolcacheBundles],
        CLEANUP_BUNDLE_VERSION,
      );

      lstatStub.restore();

      t.deepEqual(
        cleanupDiagnostic,
        { deletedVersions: [], failed: true },
        "An error other than the toolcache being absent must not be reported as success.",
      );
    });
  },
);

test.serial(
  "downloadCodeQLBundle does not clean up a toolcache on a different filesystem to the workspace",
  async (t) => {
    // Some runner images keep the toolcache on a different volume to the workspace, in which case
    // deleting the tools frees up disk space that the analysis cannot use.
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

      const staleDirectory = createToolcacheEntry(
        tmpDir,
        "CodeQL",
        CLEANUP_STALE_VERSION,
      );

      sinon
        .stub(toolsDownload, "isToolcacheOnWorkspaceFilesystem")
        .returns(false);

      const { cleanupDiagnostic } = await runDownloadCodeQL(
        tmpDir,
        [Feature.CleanupToolcacheBundles],
        CLEANUP_BUNDLE_VERSION,
      );

      t.true(fs.existsSync(staleDirectory));
      t.is(cleanupDiagnostic, undefined);
    });
  },
);

test.serial(
  "isToolcacheOnWorkspaceFilesystem assumes a different filesystem when it cannot tell",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      const logger = getRunnerLogger(true);

      setupActionsVars(tmpDir, tmpDir);
      t.true(toolsDownload.isToolcacheOnWorkspaceFilesystem(logger));

      // If we can't tell, we assume the toolcache is not somewhere we can reclaim space from.
      process.env[ActionsEnvVars.RUNNER_TOOL_CACHE] = path.join(
        tmpDir,
        "does-not-exist",
      );
      t.false(toolsDownload.isToolcacheOnWorkspaceFilesystem(logger));
    });
  },
);

test.serial(
  "downloadCodeQLBundle does not delete through a symlinked version directory",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      const toolcacheRoot = path.join(tmpDir, "toolcache");
      setupActionsVars(tmpDir, toolcacheRoot);
      process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";

      createToolcacheEntry(toolcacheRoot, "CodeQL", CLEANUP_STALE_VERSION);

      // Somewhere outside the toolcache that a version directory points at.
      const outsideDirectory = path.join(tmpDir, "outside");
      fs.mkdirSync(outsideDirectory, { recursive: true });
      fs.writeFileSync(path.join(outsideDirectory, "contents"), "x");
      fs.symlinkSync(
        outsideDirectory,
        path.join(toolcacheRoot, "CodeQL", "9.9.9"),
      );

      const { cleanupDiagnostic } = await runDownloadCodeQL(
        toolcacheRoot,
        [Feature.CleanupToolcacheBundles],
        CLEANUP_BUNDLE_VERSION,
      );

      t.true(
        fs.existsSync(path.join(outsideDirectory, "contents")),
        "Should not delete anything through a symlinked version directory.",
      );
      t.true(
        fs
          .lstatSync(path.join(toolcacheRoot, "CodeQL", "9.9.9"))
          .isSymbolicLink(),
      );
      t.deepEqual(cleanupDiagnostic, {
        deletedVersions: [CLEANUP_STALE_VERSION],
        failed: false,
      });
    });
  },
);
