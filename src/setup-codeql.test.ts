import * as fs from "fs";
import * as path from "path";

import * as github from "@actions/github";
import * as toolcache from "@actions/tool-cache";
import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as api from "./api-client";
import { EnvVar } from "./environment";
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
  SAMPLE_GHES_API_DETAILS,
  checkExpectedLogMessages,
  createFeatures,
  createTestConfig,
  getRecordingLogger,
  makeMacro,
  mockBundleDownloadApi,
  setupActionsVars,
  setupTests,
} from "./testing-utils";
import {
  ConfigurationError,
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

/**
 * A URL should never be misidentified as a bare CLI version number or a version range, even when
 * it contains version-like path segments, since neither `semver.valid` nor `semver.validRange`
 * can ever match a string containing `://`.
 */
const URL_NOT_MISTAKEN_FOR_VERSION_TEST_CASES = [
  {
    name: "a bundle URL without a recognizable bundle tag",
    toolsInput: "https://example.com/assets/codeql-bundle-linux64.tar.gz",
  },
  {
    name: "a bundle URL containing a bare-version-like path segment",
    toolsInput:
      "https://example.com/download/2.19.0/codeql-bundle-linux64.tar.gz",
  },
  {
    name: "a bundle URL containing a version-range-like path segment",
    toolsInput:
      "https://example.com/download/2.24.x/codeql-bundle-linux64.tar.gz",
  },
] as const;

for (const { name, toolsInput } of URL_NOT_MISTAKEN_FOR_VERSION_TEST_CASES) {
  test.serial(
    `getCodeQLSource resolves ${name} as a URL, not a version or range`,
    async (t) => {
      const features = createFeatures([]);

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource(
          toolsInput,
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
        if (source.sourceType === "download") {
          t.is(source.codeqlURL, toolsInput);
          t.is(source.compressionMethod, "gzip");
        }
        // Neither a bare CLI version number nor a version range was detected: the bundle tag
        // could not be determined from the URL, so no CLI version is known.
        t.is(source["cliVersion"], undefined);
      });
    },
  );
}

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

const CLI_VERSION_TOOLS_INPUT_TEST_CASES = [
  {
    toolsInput: "2.20.1",
    platform: "linux",
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-linux64.tar.zst",
    expectedCompressionMethod: "zstd",
  },
  {
    toolsInput: "v2.20.1",
    platform: "darwin",
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-osx64.tar.zst",
    expectedCompressionMethod: "zstd",
  },
  {
    toolsInput: "v2.20.1",
    platform: "win32",
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-win64.tar.gz",
    expectedCompressionMethod: "gzip",
  },
  {
    toolsInput: "2.20.1",
    platform: "linux",
    tarSupportsZstd: false,
    expectedBundleName: "codeql-bundle-linux64.tar.gz",
    expectedCompressionMethod: "gzip",
  },
  {
    // CodeQL versions older than 2.19.0 don't have zstd bundles, so gzip should be selected
    // even though the runner supports zstd.
    toolsInput: "v2.18.4",
    platform: "linux",
    tarSupportsZstd: true,
    expectedBundleName: "codeql-bundle-linux64.tar.gz",
    expectedCompressionMethod: "gzip",
  },
] as const;

for (const {
  toolsInput,
  platform,
  tarSupportsZstd,
  expectedBundleName,
  expectedCompressionMethod,
} of CLI_VERSION_TOOLS_INPUT_TEST_CASES) {
  test.serial(
    `getCodeQLSource selects ${expectedBundleName} for 'tools: ${toolsInput}'`,
    async (t) => {
      const features = createFeatures([]);
      sinon.stub(process, "platform").value(platform);

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource(
          toolsInput,
          SAMPLE_DEFAULT_CLI_VERSION,
          undefined, // rawLanguages
          false, // useOverlayAwareDefaultCliVersion
          SAMPLE_DOTCOM_API_DETAILS,
          GitHubVariant.DOTCOM,
          tarSupportsZstd,
          features,
          getRunnerLogger(true),
        );

        const expectedCliVersion = toolsInput.replace(/^v/, "");
        t.is(source.toolsVersion, expectedCliVersion);
        t.is(source["cliVersion"], expectedCliVersion);
        t.is(source.sourceType, "download");
        if (source.sourceType === "download") {
          t.is(source.compressionMethod, expectedCompressionMethod);
          t.true(source.codeqlURL.endsWith(`/${expectedBundleName}`));
          t.true(
            source.codeqlURL.includes(`/codeql-bundle-v${expectedCliVersion}/`),
          );
        }
      });
    },
  );
}

test.serial(
  "getCodeQLSource logs a message when given a bare CLI version number",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures([]);

    sinon.stub(process, "platform").value("linux");

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const source = await setupCodeql.getCodeQLSource(
        "v2.20.1",
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        true,
        features,
        logger,
      );

      t.is(source.sourceType, "download");
      t.is(source.toolsVersion, "2.20.1");

      checkExpectedLogMessages(t, loggedMessages, [
        "'tools: v2.20.1' was requested, so using CodeQL version 2.20.1.",
      ]);
    });
  },
);

test.serial(
  "getCodeQLSource still resolves a local tarball path when the path looks like a version-ish string",
  async (t) => {
    const features = createFeatures([]);

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const localPath = "/path/to/codeql-bundle-2.20.1.tar.gz";
      const source = await setupCodeql.getCodeQLSource(
        localPath,
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        false,
        features,
        getRunnerLogger(true),
      );

      t.is(source.sourceType, "local");
      if (source.sourceType === "local") {
        t.is(source.codeqlTarPath, localPath);
        t.is(source.compressionMethod, "gzip");
      }
    });
  },
);

/**
 * A representative set of CodeQL bundle releases, as well as some non-bundle releases and
 * non-stable bundle releases, used to test resolution of the `latest-<N>` and semantic version
 * range forms of the `tools` input.
 *
 * The stable bundle releases are deliberately non-contiguous: `2.25.2` and `2.24.1` do not exist,
 * so that tests can confirm that `latest-<N>` and version ranges are resolved against the actual
 * release history, rather than by decrementing the patch version of the most recent release.
 */
const STABLE_BUNDLE_RELEASES_TEST_SET = [
  // A release of the Action itself, which does not represent a CodeQL bundle and should be
  // ignored.
  { tag_name: "v4.30.0", prerelease: false, draft: false },
  // A prerelease CodeQL bundle, which should be ignored.
  { tag_name: "codeql-bundle-v2.26.0", prerelease: true, draft: false },
  // A draft CodeQL bundle, which should be ignored.
  { tag_name: "codeql-bundle-v2.23.9", prerelease: false, draft: true },
  { tag_name: "codeql-bundle-v2.25.3", prerelease: false, draft: false },
  { tag_name: "codeql-bundle-v2.25.1", prerelease: false, draft: false },
  { tag_name: "codeql-bundle-v2.24.2", prerelease: false, draft: false },
  { tag_name: "codeql-bundle-v2.24.0", prerelease: false, draft: false },
];

function mockListStableCodeQLBundleReleases(
  releases: unknown[] = STABLE_BUNDLE_RELEASES_TEST_SET,
) {
  const client = github.getOctokit("123");
  const listReleases = sinon.stub(client.rest.repos, "listReleases");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  listReleases.resolves({
    data: releases,
  } as any);
  sinon.stub(api, "getApiClient").value(() => client);
  return listReleases;
}

/**
 * As `mockListStableCodeQLBundleReleases`, but additionally mocks the CodeQL nightlies
 * repository's release list, so that fallback to the latest nightly bundle can be tested when no
 * release satisfies a `nightly-until-<version>` version threshold.
 */
function mockListCodeQLBundleReleasesWithNightlyFallback(
  releases: unknown[],
  nightlyTagName: string,
) {
  const listReleases = mockListStableCodeQLBundleReleases(releases);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  listReleases.withArgs(sinon.match({ owner: "dsp-testing" })).resolves({
    data: [{ tag_name: nightlyTagName }],
  } as any);
}

/**
 * As `mockListStableCodeQLBundleReleases`, but for use when `getCodeQLSource` is called with a
 * non-dotcom `variant` (for example `GitHubVariant.GHES` or `GitHubVariant.GHEC_DR`). The
 * canonical CodeQL Action repository's release history only ever exists on GitHub.com, so in that
 * case we must mock the unauthenticated GitHub.com client (`getUnauthenticatedApiClientForDotcom`)
 * rather than the current instance's client (`getApiClient`).
 *
 * The current instance's client is also mocked here, but to return a different set of bogus
 * releases and to fail to find the bundle by tag, so that tests using this helper fail if
 * `getSortedCliVersions` regresses to (incorrectly) querying the current GitHub instance, or if
 * `getCodeQLBundleDownloadURL`'s unrelated, pre-existing attempt to look up the bundle on the
 * current instance is not handled gracefully.
 */
function mockListStableCodeQLBundleReleasesForNonDotcomVariant(
  releases: unknown[] = STABLE_BUNDLE_RELEASES_TEST_SET,
) {
  const dotcomClient = github.getOctokit("123");
  const listReleases = sinon.stub(dotcomClient.rest.repos, "listReleases");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  listReleases.resolves({
    data: releases,
  } as any);
  sinon
    .stub(api, "getUnauthenticatedApiClientForDotcom")
    .value(() => dotcomClient);

  const currentInstanceClient = github.getOctokit("456");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  sinon.stub(currentInstanceClient.rest.repos, "listReleases").resolves({
    data: [
      { tag_name: "codeql-bundle-v9.9.9", prerelease: false, draft: false },
    ],
  } as any);
  sinon
    .stub(currentInstanceClient.rest.repos, "getReleaseByTag")
    .rejects(new Error("Not Found"));
  sinon.stub(api, "getApiClient").value(() => currentInstanceClient);

  return listReleases;
}

const LATEST_OFFSET_TOOLS_INPUT_TEST_CASES = [
  { toolsInput: "latest-0", expectedCliVersion: "2.25.3" },
  { toolsInput: "latest-1", expectedCliVersion: "2.25.1" },
  { toolsInput: "LATEST-2", expectedCliVersion: "2.24.2" },
  { toolsInput: "latest-3", expectedCliVersion: "2.24.0" },
] as const;

for (const {
  toolsInput,
  expectedCliVersion,
} of LATEST_OFFSET_TOOLS_INPUT_TEST_CASES) {
  test.serial(
    `getCodeQLSource resolves 'tools: ${toolsInput}' to CodeQL version ${expectedCliVersion}`,
    async (t) => {
      const features = createFeatures([]);
      sinon.stub(process, "platform").value("linux");
      mockListStableCodeQLBundleReleases();

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource(
          toolsInput,
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
        t.is(source.toolsVersion, expectedCliVersion);
        t.is(source["cliVersion"], expectedCliVersion);
      });
    },
  );
}

test.serial(
  "getCodeQLSource throws when 'latest-<N>' requests more stable releases than exist",
  async (t) => {
    const features = createFeatures([]);
    mockListStableCodeQLBundleReleases();

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const error = await t.throwsAsync(
        async () =>
          await setupCodeql.getCodeQLSource(
            "latest-99",
            SAMPLE_DEFAULT_CLI_VERSION,
            undefined, // rawLanguages
            false, // useOverlayAwareDefaultCliVersion
            SAMPLE_DOTCOM_API_DETAILS,
            GitHubVariant.DOTCOM,
            false,
            features,
            getRunnerLogger(true),
          ),
        { instanceOf: ConfigurationError },
      );
      // The error should mention the oldest and newest available releases, to help distinguish
      // a request that is out of range from other configuration mistakes.
      t.true(
        error.message.includes(
          "Available stable CodeQL CLI releases range from 2.24.0 to 2.25.3.",
        ),
      );
    });
  },
);

const CLI_VERSION_RANGE_TOOLS_INPUT_TEST_CASES = [
  { toolsInput: "2.24.x", expectedCliVersion: "2.24.2" },
  { toolsInput: "2.x", expectedCliVersion: "2.25.3" },
  { toolsInput: "~2.24.0", expectedCliVersion: "2.24.2" },
  { toolsInput: "^2.24.0", expectedCliVersion: "2.25.3" },
] as const;

for (const {
  toolsInput,
  expectedCliVersion,
} of CLI_VERSION_RANGE_TOOLS_INPUT_TEST_CASES) {
  test.serial(
    `getCodeQLSource resolves 'tools: ${toolsInput}' to CodeQL version ${expectedCliVersion}`,
    async (t) => {
      const features = createFeatures([]);
      sinon.stub(process, "platform").value("linux");
      mockListStableCodeQLBundleReleases();

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource(
          toolsInput,
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
        t.is(source.toolsVersion, expectedCliVersion);
        t.is(source["cliVersion"], expectedCliVersion);
      });
    },
  );
}

test.serial(
  "getCodeQLSource throws when no stable release satisfies the requested version range",
  async (t) => {
    const features = createFeatures([]);
    mockListStableCodeQLBundleReleases();

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const error = await t.throwsAsync(
        async () =>
          await setupCodeql.getCodeQLSource(
            "9.x",
            SAMPLE_DEFAULT_CLI_VERSION,
            undefined, // rawLanguages
            false, // useOverlayAwareDefaultCliVersion
            SAMPLE_DOTCOM_API_DETAILS,
            GitHubVariant.DOTCOM,
            false,
            features,
            getRunnerLogger(true),
          ),
        { instanceOf: ConfigurationError },
      );
      t.true(
        error.message.includes(
          "Available stable CodeQL CLI releases range from 2.24.0 to 2.25.3.",
        ),
      );
    });
  },
);

test.serial(
  "getCodeQLSource throws a helpful error when a version range is older than any available release",
  async (t) => {
    const features = createFeatures([]);
    mockListStableCodeQLBundleReleases();

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      // The oldest release in STABLE_BUNDLE_RELEASES_TEST_SET is 2.24.0, so a range entirely
      // below that, such as this one modeled on a real user request for CodeQL 1.28.x, can never
      // be satisfied. The error should clearly state the oldest available release, since older
      // CodeQL bundles are tagged with a date, e.g. `codeql-bundle-20211208`, rather than a
      // semantic version, and so are invisible to SemVer-based `tools` inputs.
      const error = await t.throwsAsync(
        async () =>
          await setupCodeql.getCodeQLSource(
            "1.28.0 - 1.28.9",
            SAMPLE_DEFAULT_CLI_VERSION,
            undefined, // rawLanguages
            false, // useOverlayAwareDefaultCliVersion
            SAMPLE_DOTCOM_API_DETAILS,
            GitHubVariant.DOTCOM,
            false,
            features,
            getRunnerLogger(true),
          ),
        { instanceOf: ConfigurationError },
      );
      t.true(
        error.message.includes(
          "Available stable CodeQL CLI releases range from 2.24.0 to 2.25.3.",
        ),
      );
    });
  },
);

/**
 * A set of CodeQL bundle releases that includes GitHub prereleases, used to test resolution of
 * the `latest-prerelease` and `nightly-until-<version>` forms of the `tools` input in the case
 * where the newest release overall is a stable release, even though prereleases exist.
 * `STABLE_BUNDLE_RELEASES_TEST_SET` above covers the opposite case, where the
 * newest release overall is a prerelease.
 */
const PRERELEASE_BUNDLE_RELEASES_TEST_SET = [
  // A draft CodeQL bundle newer than every other release here, which should be ignored: if drafts
  // were not correctly excluded, this would incorrectly be selected as the newest release.
  { tag_name: "codeql-bundle-v2.28.0", prerelease: false, draft: true },
  // An old-style, date-tagged bundle, which has no semantic version and should be ignored.
  { tag_name: "codeql-bundle-20211208", prerelease: false, draft: false },
  { tag_name: "codeql-bundle-v2.27.0", prerelease: false, draft: false },
  { tag_name: "codeql-bundle-v2.26.3", prerelease: true, draft: false },
  { tag_name: "codeql-bundle-v2.26.2", prerelease: false, draft: false },
  { tag_name: "codeql-bundle-v2.25.0", prerelease: true, draft: false },
  { tag_name: "codeql-bundle-v2.24.0", prerelease: false, draft: false },
];

const LATEST_PRERELEASE_TOOLS_INPUT_TEST_CASES = [
  {
    name: "the newest release is a prerelease",
    toolsInput: "latest-prerelease",
    releases: STABLE_BUNDLE_RELEASES_TEST_SET,
    expectedCliVersion: "2.26.0",
  },
  {
    name: "the newest release is stable, even though prereleases exist",
    toolsInput: "LATEST-PRERELEASE",
    releases: PRERELEASE_BUNDLE_RELEASES_TEST_SET,
    expectedCliVersion: "2.27.0",
  },
] as const;

for (const {
  name,
  toolsInput,
  releases,
  expectedCliVersion,
} of LATEST_PRERELEASE_TOOLS_INPUT_TEST_CASES) {
  test.serial(
    `getCodeQLSource resolves 'tools: ${toolsInput}' to CodeQL version ${expectedCliVersion} when ${name}`,
    async (t) => {
      const features = createFeatures([]);
      sinon.stub(process, "platform").value("linux");
      mockListStableCodeQLBundleReleases(releases);

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource(
          toolsInput,
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
        t.is(source.toolsVersion, expectedCliVersion);
        t.is(source["cliVersion"], expectedCliVersion);
      });
    },
  );
}

test.serial(
  "getCodeQLSource throws when 'latest-prerelease' is requested but no CodeQL CLI releases can be found",
  async (t) => {
    const features = createFeatures([]);
    mockListStableCodeQLBundleReleases([
      // A release of the Action itself, not a CodeQL bundle.
      { tag_name: "v4.30.0", prerelease: false, draft: false },
      // A draft CodeQL bundle, which should be ignored, leaving no eligible release.
      { tag_name: "codeql-bundle-v9.9.9", prerelease: false, draft: true },
    ]);

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const error = await t.throwsAsync(
        async () =>
          await setupCodeql.getCodeQLSource(
            "latest-prerelease",
            SAMPLE_DEFAULT_CLI_VERSION,
            undefined, // rawLanguages
            false, // useOverlayAwareDefaultCliVersion
            SAMPLE_DOTCOM_API_DETAILS,
            GitHubVariant.DOTCOM,
            false,
            features,
            getRunnerLogger(true),
          ),
        { instanceOf: ConfigurationError },
      );
      t.true(
        error.message.includes(
          "'tools: latest-prerelease' was requested, but no CodeQL CLI releases could be found.",
        ),
      );
    });
  },
);

const NIGHTLY_UNTIL_RESOLVES_TOOLS_INPUT_TEST_CASES = [
  {
    name: "threshold exactly matches the newest release, which is a prerelease",
    toolsInput: "nightly-until-2.26.0",
    releases: STABLE_BUNDLE_RELEASES_TEST_SET,
    expectedCliVersion: "2.26.0",
  },
  {
    name: "the newest release comfortably exceeds the threshold",
    toolsInput: "nightly-until-2.20.0",
    releases: STABLE_BUNDLE_RELEASES_TEST_SET,
    expectedCliVersion: "2.26.0",
  },
  {
    name: "a prerelease is selected since it is the newest release satisfying the threshold, even though no stable release would satisfy it",
    toolsInput: "nightly-until-2.25.4",
    releases: STABLE_BUNDLE_RELEASES_TEST_SET,
    expectedCliVersion: "2.26.0",
  },
  {
    name: "matching is case insensitive",
    toolsInput: "NIGHTLY-UNTIL-2.25.4",
    releases: STABLE_BUNDLE_RELEASES_TEST_SET,
    expectedCliVersion: "2.26.0",
  },
  {
    name: "drafts and date-tagged releases are excluded even when they would otherwise be the newest",
    toolsInput: "nightly-until-2.20.0",
    releases: PRERELEASE_BUNDLE_RELEASES_TEST_SET,
    expectedCliVersion: "2.27.0",
  },
] as const;

for (const {
  name,
  toolsInput,
  releases,
  expectedCliVersion,
} of NIGHTLY_UNTIL_RESOLVES_TOOLS_INPUT_TEST_CASES) {
  test.serial(
    `getCodeQLSource resolves 'tools: ${toolsInput}' to CodeQL version ${expectedCliVersion}: ${name}`,
    async (t) => {
      const features = createFeatures([]);
      sinon.stub(process, "platform").value("linux");
      mockListStableCodeQLBundleReleases(releases);

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource(
          toolsInput,
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
        t.is(source.toolsVersion, expectedCliVersion);
        t.is(source["cliVersion"], expectedCliVersion);
      });
    },
  );
}

/**
 * `nightly-until-default-<version>` compares the given version threshold against the CLI version
 * that would actually be used if `tools` had not been specified at all, i.e. after normal
 * (possibly overlay-aware) default CLI version selection and any applicable overrides, without
 * ever listing CodeQL bundle releases. In these test cases, that resolved version is
 * `SAMPLE_DEFAULT_CLI_VERSION`'s CLI version, `2.20.0`. When the resolved version is at or above
 * the threshold, resolution should proceed exactly as if `tools` were not specified at all.
 */
const NIGHTLY_UNTIL_DEFAULT_RESUMES_DEFAULT_TOOLS_INPUT_TEST_CASES = [
  {
    name: "the default CLI version exactly matches the threshold",
    toolsInput: "nightly-until-default-2.20.0",
  },
  {
    name: "the default CLI version exceeds the threshold",
    toolsInput: "nightly-until-default-2.19.0",
  },
  {
    name: "matching is case insensitive",
    toolsInput: "NIGHTLY-UNTIL-DEFAULT-2.20.0",
  },
] as const;

for (const {
  name,
  toolsInput,
} of NIGHTLY_UNTIL_DEFAULT_RESUMES_DEFAULT_TOOLS_INPUT_TEST_CASES) {
  test.serial(
    `getCodeQLSource resumes normal default CLI version selection for 'tools: ${toolsInput}', since ${name}`,
    async (t) => {
      const loggedMessages: LoggedMessage[] = [];
      const logger = getRecordingLogger(loggedMessages);
      const features = createFeatures([]);

      // No release-list API request should be made, so if one is attempted, the test will fail.
      const client = github.getOctokit("123");
      const listReleases = sinon.stub(client.rest.repos, "listReleases");
      sinon.stub(api, "getApiClient").value(() => client);

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource(
          toolsInput,
          SAMPLE_DEFAULT_CLI_VERSION,
          undefined, // rawLanguages
          false, // useOverlayAwareDefaultCliVersion
          SAMPLE_DOTCOM_API_DETAILS,
          GitHubVariant.DOTCOM,
          false,
          features,
          logger,
        );

        t.is(
          source.toolsVersion,
          SAMPLE_DEFAULT_CLI_VERSION.enabledVersions[0].cliVersion,
        );
        t.true(listReleases.notCalled);
        checkExpectedLogMessages(t, loggedMessages, [
          `'tools: ${toolsInput}' was requested, so using the default CodeQL version`,
        ]);
      });
    },
  );
}

test.serial(
  "getCodeQLSource falls back to the latest nightly bundle for 'tools: nightly-until-default-<version>', since the default CLI version does not satisfy the threshold",
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

    // No release-list API request for the canonical CodeQL Action repository should be made;
    // only the nightly repository's release list should be queried, via the same authenticated
    // client used elsewhere in this file.
    const client = github.getOctokit("123");
    const listReleases = sinon.stub(client.rest.repos, "listReleases");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    listReleases.resolves({
      data: [{ tag_name: expectedTag }],
    } as any);
    sinon.stub(api, "getApiClient").value(() => client);

    const toolsInput = "nightly-until-default-2.21.0";

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const source = await setupCodeql.getCodeQLSource(
        toolsInput,
        SAMPLE_DEFAULT_CLI_VERSION,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        false,
        features,
        logger,
      );

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

      t.true(
        listReleases.neverCalledWith(
          sinon.match({ owner: "github", repo: "codeql-action" }),
        ),
      );
      checkExpectedLogMessages(t, loggedMessages, [
        `Using the latest CodeQL CLI nightly, as requested by 'tools: ${toolsInput}', since the`,
      ]);
    });
  },
);

const nightlyUntilDefaultOverlayEnabledVersions = {
  enabledVersions: [
    { cliVersion: "2.20.2", tagName: "codeql-bundle-v2.20.2" },
    { cliVersion: "2.20.1", tagName: "codeql-bundle-v2.20.1" },
    { cliVersion: "2.20.0", tagName: "codeql-bundle-v2.20.0" },
  ],
  toolsFeatureFlagsValid: true,
};

async function stubOverlayBaseCacheForNightlyUntilDefaultTests(
  cliVersion: string,
) {
  sinon.stub(api, "getAutomationID").resolves("test/");
  sinon.stub(api, "listActionsCaches").resolves([
    {
      key: await fakeOverlayBaseCacheKey("javascript", cliVersion, "abc-1-1"),
    },
  ]);
  process.env[EnvVar.CODE_SCANNING_REF] = "refs/heads/feature-branch";
  process.env[EnvVar.CODE_SCANNING_BASE_BRANCH] = "main";
}

test.serial(
  "getCodeQLSource stays on nightly for 'tools: nightly-until-default-<version>' when the " +
    "newest enabled default satisfies the threshold, but overlay-aware selection resolves to " +
    "an older version that does not",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures([
      Feature.OverlayAnalysisMatchCodeqlVersion,
    ]);

    const expectedDate = "30260213";
    const expectedTag = `codeql-bundle-${expectedDate}`;

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

    // The overlay-base cache only has an entry for 2.20.1, which is below the 2.20.2 threshold,
    // even though the newest enabled default version, 2.20.2, satisfies it.
    await stubOverlayBaseCacheForNightlyUntilDefaultTests("2.20.1");
    sinon
      .stub(toolcache, "find")
      .withArgs("CodeQL", "2.20.1")
      .returns("/path/to/codeql-2.20.1");

    const toolsInput = "nightly-until-default-2.20.2";

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const source = await setupCodeql.getCodeQLSource(
        toolsInput,
        nightlyUntilDefaultOverlayEnabledVersions,
        ["javascript"],
        true, // useOverlayAwareDefaultCliVersion
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        false,
        features,
        logger,
      );

      t.is(source.sourceType, "download");
      t.true(
        listReleases.neverCalledWith(
          sinon.match({ owner: "github", repo: "codeql-action" }),
        ),
      );
      checkExpectedLogMessages(t, loggedMessages, [
        `Using the latest CodeQL CLI nightly, as requested by 'tools: ${toolsInput}', since the ` +
          "resolved default CodeQL version 2.20.1 does not satisfy the version threshold",
      ]);
    });
  },
);

test.serial(
  "getCodeQLSource resumes normal default CLI version selection for 'tools: " +
    "nightly-until-default-<version>' when overlay-aware selection resolves to a version that " +
    "satisfies the threshold",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures([
      Feature.OverlayAnalysisMatchCodeqlVersion,
    ]);

    const client = github.getOctokit("123");
    const listReleases = sinon.stub(client.rest.repos, "listReleases");
    sinon.stub(api, "getApiClient").value(() => client);

    await stubOverlayBaseCacheForNightlyUntilDefaultTests("2.20.1");
    sinon
      .stub(toolcache, "find")
      .withArgs("CodeQL", "2.20.1")
      .returns("/path/to/codeql-2.20.1");

    const toolsInput = "nightly-until-default-2.20.1";

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const source = await setupCodeql.getCodeQLSource(
        toolsInput,
        nightlyUntilDefaultOverlayEnabledVersions,
        ["javascript"],
        true, // useOverlayAwareDefaultCliVersion
        SAMPLE_DOTCOM_API_DETAILS,
        GitHubVariant.DOTCOM,
        false,
        features,
        logger,
      );

      t.is(source.sourceType, "toolcache");
      t.is(source.toolsVersion, "2.20.1");
      t.true(listReleases.notCalled);
      checkExpectedLogMessages(t, loggedMessages, [
        `'tools: ${toolsInput}' was requested, so using the default CodeQL version, since the ` +
          "resolved default CodeQL version 2.20.1 satisfies the version threshold",
      ]);
    });
  },
);

test.serial(
  "getCodeQLSource stays on nightly for 'tools: nightly-until-default-<version>' on GHES when " +
    "the newest enabled default satisfies the threshold, but a pinned toolcache override " +
    "resolves to an older version that does not",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures([]);

    const expectedDate = "30260213";
    const expectedTag = `codeql-bundle-${expectedDate}`;

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

    const toolsInput = "nightly-until-default-2.20.2";

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      // Nothing in the toolcache matches the resolved default version 2.20.2, but a pinned
      // (overriding) version 2.20.1 is present, which is below the threshold.
      const pinnedFolder = path.join(tmpDir, "pinned-codeql-2.20.1");
      fs.mkdirSync(pinnedFolder, { recursive: true });
      fs.writeFileSync(path.join(pinnedFolder, "pinned-version"), "");
      sinon.stub(toolcache, "findAllVersions").returns(["2.20.1"]);
      sinon
        .stub(toolcache, "find")
        .withArgs("CodeQL", "2.20.1")
        .returns(pinnedFolder);

      const source = await setupCodeql.getCodeQLSource(
        toolsInput,
        nightlyUntilDefaultOverlayEnabledVersions,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        SAMPLE_GHES_API_DETAILS,
        GitHubVariant.GHES,
        false,
        features,
        logger,
      );

      t.is(source.sourceType, "download");
      t.true(
        listReleases.neverCalledWith(
          sinon.match({ owner: "github", repo: "codeql-action" }),
        ),
      );
      checkExpectedLogMessages(t, loggedMessages, [
        `Using the latest CodeQL CLI nightly, as requested by 'tools: ${toolsInput}', since the ` +
          "resolved default CodeQL version 2.20.1 does not satisfy the version threshold",
      ]);
    });
  },
);

test.serial(
  "getCodeQLSource resumes normal default CLI version selection for 'tools: " +
    "nightly-until-default-<version>' on GHES when a pinned toolcache override resolves to a " +
    "version that satisfies the threshold",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = createFeatures([]);

    const client = github.getOctokit("123");
    const listReleases = sinon.stub(client.rest.repos, "listReleases");
    sinon.stub(api, "getApiClient").value(() => client);

    const toolsInput = "nightly-until-default-2.20.1";

    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      const pinnedFolder = path.join(tmpDir, "pinned-codeql-2.20.1");
      fs.mkdirSync(pinnedFolder, { recursive: true });
      fs.writeFileSync(path.join(pinnedFolder, "pinned-version"), "");
      sinon.stub(toolcache, "findAllVersions").returns(["2.20.1"]);
      sinon
        .stub(toolcache, "find")
        .withArgs("CodeQL", "2.20.1")
        .returns(pinnedFolder);

      const source = await setupCodeql.getCodeQLSource(
        toolsInput,
        nightlyUntilDefaultOverlayEnabledVersions,
        undefined, // rawLanguages
        false, // useOverlayAwareDefaultCliVersion
        SAMPLE_GHES_API_DETAILS,
        GitHubVariant.GHES,
        false,
        features,
        logger,
      );

      t.is(source.sourceType, "toolcache");
      t.is(source.toolsVersion, "2.20.1");
      t.true(listReleases.notCalled);
      checkExpectedLogMessages(t, loggedMessages, [
        `'tools: ${toolsInput}' was requested, so using the default CodeQL version, since the ` +
          "resolved default CodeQL version 2.20.1 satisfies the version threshold",
      ]);
    });
  },
);

const NIGHTLY_UNTIL_FALLBACK_TOOLS_INPUT_TEST_CASES = [
  {
    name: "no release, stable or prerelease, satisfies the threshold",
    toolsInput: "nightly-until-9.0.0",
  },
] as const;

for (const {
  name,
  toolsInput,
} of NIGHTLY_UNTIL_FALLBACK_TOOLS_INPUT_TEST_CASES) {
  test.serial(
    `getCodeQLSource falls back to the latest nightly bundle for 'tools: ${toolsInput}', since ${name}`,
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
      mockListCodeQLBundleReleasesWithNightlyFallback(
        STABLE_BUNDLE_RELEASES_TEST_SET,
        expectedTag,
      );

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource(
          toolsInput,
          SAMPLE_DEFAULT_CLI_VERSION,
          undefined, // rawLanguages
          false, // useOverlayAwareDefaultCliVersion
          SAMPLE_DOTCOM_API_DETAILS,
          GitHubVariant.DOTCOM,
          false,
          features,
          logger,
        );

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

        checkExpectedLogMessages(t, loggedMessages, [
          `Using the latest CodeQL CLI nightly, as requested by 'tools: ${toolsInput}', since no`,
        ]);
      });
    },
  );
}

const MALFORMED_NIGHTLY_UNTIL_THRESHOLD_TOOLS_INPUT_TEST_CASES = [
  { toolsInput: "nightly-until-bogus", expectedRawThreshold: "bogus" },
  {
    toolsInput: "nightly-until-default-bogus",
    expectedRawThreshold: "bogus",
  },
] as const;

for (const {
  toolsInput,
  expectedRawThreshold,
} of MALFORMED_NIGHTLY_UNTIL_THRESHOLD_TOOLS_INPUT_TEST_CASES) {
  test.serial(
    `getCodeQLSource throws a configuration error for 'tools: ${toolsInput}', which has a malformed version threshold`,
    async (t) => {
      const features = createFeatures([]);

      await withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);
        const error = await t.throwsAsync(
          async () =>
            await setupCodeql.getCodeQLSource(
              toolsInput,
              SAMPLE_DEFAULT_CLI_VERSION,
              undefined, // rawLanguages
              false, // useOverlayAwareDefaultCliVersion
              SAMPLE_DOTCOM_API_DETAILS,
              GitHubVariant.DOTCOM,
              false,
              features,
              getRunnerLogger(true),
            ),
          { instanceOf: ConfigurationError },
        );
        t.true(
          error.message.includes(
            `'${expectedRawThreshold}' is not a valid semantic version`,
          ),
        );
      });
    },
  );
}

/**
 * `latest-<N>`, SemVer ranges, `latest-prerelease`, and `nightly-until-<version>` all need to
 * look up the canonical CodeQL Action repository's
 * release history. That repository only ever exists on GitHub.com, so on a non-dotcom `variant`
 * (GHES or GHEC with data residency) this lookup must be made directly, and unauthenticated,
 * against GitHub.com, rather than against the current GitHub instance as for all other API
 * requests. Otherwise, the request would either fail outright (since the canonical repository
 * typically does not exist on the current instance), or -- if a same-named repository happens to
 * exist there -- could silently resolve to the wrong CodeQL CLI version.
 */
const NON_DOTCOM_VARIANT_TOOLS_INPUT_TEST_CASES = [
  { toolsInput: "latest-1", expectedCliVersion: "2.25.1" },
  { toolsInput: "^2.24.0", expectedCliVersion: "2.25.3" },
  { toolsInput: "latest-prerelease", expectedCliVersion: "2.26.0" },
  { toolsInput: "nightly-until-2.20.0", expectedCliVersion: "2.26.0" },
] as const;

for (const variant of [GitHubVariant.GHES, GitHubVariant.GHEC_DR]) {
  for (const {
    toolsInput,
    expectedCliVersion,
  } of NON_DOTCOM_VARIANT_TOOLS_INPUT_TEST_CASES) {
    test.serial(
      `getCodeQLSource resolves 'tools: ${toolsInput}' to CodeQL version ${expectedCliVersion} ` +
        `on ${variant} using GitHub.com, rather than the current instance`,
      async (t) => {
        const features = createFeatures([]);
        sinon.stub(process, "platform").value("linux");
        mockListStableCodeQLBundleReleasesForNonDotcomVariant();

        await withTmpDir(async (tmpDir) => {
          setupActionsVars(tmpDir, tmpDir);
          const source = await setupCodeql.getCodeQLSource(
            toolsInput,
            SAMPLE_DEFAULT_CLI_VERSION,
            undefined, // rawLanguages
            false, // useOverlayAwareDefaultCliVersion
            SAMPLE_GHES_API_DETAILS,
            variant,
            false,
            features,
            getRunnerLogger(true),
          );

          t.is(source.sourceType, "download");
          // If resolution incorrectly used the current (non-dotcom) instance's API instead of
          // GitHub.com, this would instead resolve to the bogus "9.9.9" release configured by
          // `mockListStableCodeQLBundleReleasesForNonDotcomVariant`.
          t.is(source.toolsVersion, expectedCliVersion);
          t.is(source["cliVersion"], expectedCliVersion);
        });
      },
    );
  }
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
