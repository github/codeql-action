import * as github from "@actions/github";
import test from "ava";

import {
  BundleSelectionOptions,
  getPublicRelease,
  getRelease,
  getReleaseCliVersion,
  getRequestedRelease,
  parseCodeQLReleaseUrl,
  selectBundle,
} from "./codeql-release";
import { ActionsEnvVars } from "./environment";
import { Feature } from "./feature-flags";
import { BuiltInLanguage } from "./languages";
import { BundlePlatform } from "./platform";
import {
  createFeatures,
  getRecordingLogger,
  getTestEnv,
  initAllState,
  LoggedMessage,
  SAMPLE_DOTCOM_API_DETAILS,
} from "./testing-utils";
import { ConfigurationError, GitHubVariant } from "./util";

const TAG = "codeql-bundle-v2.27.1";
const REFERENCE = {
  serverURL: "https://github.com",
  owner: "octo",
  repo: "tools",
  tagName: TAG,
};
const RELEASE_PAGE = `https://github.com/octo/tools/releases/tag/${TAG}`;
const API_URL = "https://api.github.com";
const COMBINED = "codeql-bundle-linux64.tar.zst";
const JAVA = "codeql-bundle-java-linux64.tar.zst";

const OPTIONS: BundleSelectionOptions = {
  rawLanguages: ["java-kotlin"],
  cliVersion: "2.27.1",
  platform: BundlePlatform.Linux64,
  variant: GitHubVariant.DOTCOM,
  tarSupportsZstd: true,
};

/** Serves the release tagged `TAG` with the given assets from a stubbed API. */
function releaseFixture({ assetNames = [COMBINED, JAVA], status = 200 } = {}) {
  const apiBase = `${API_URL}/repos/octo/tools/releases`;
  const releaseAPIURL = `${apiBase}/tags/${TAG}`;
  const assets = assetNames.map((name, index) => ({
    name,
    url: `${apiBase}/assets/${1000 + index}`,
  }));
  const requests: string[] = [];
  const messages: LoggedMessage[] = [];
  const state = initAllState({
    env: getTestEnv({ [ActionsEnvVars.RUNNER_ENVIRONMENT]: "github-hosted" }),
    logger: getRecordingLogger(messages, { logToConsole: false }),
    features: createFeatures([Feature.PerLanguageBundles]),
    apiClient: github.getOctokit("123", {
      baseUrl: API_URL,
      request: {
        fetch: async (url) => {
          requests.push(String(url));
          if (String(url) !== releaseAPIURL) {
            throw new Error(`Unexpected API request: ${url}`);
          }
          return new Response(JSON.stringify({ tag_name: TAG, assets }), {
            status,
            headers: { "content-type": "application/json" },
          });
        },
      },
    }),
  });
  return {
    assets,
    messages,
    releaseAPIURL,
    requests,
    state,
    select: async (options: Partial<BundleSelectionOptions> = {}) =>
      selectBundle(state, await getRelease(state, REFERENCE), {
        ...OPTIONS,
        ...options,
      }),
  };
}

test("selectBundle selects an eligible per-language bundle with a single release lookup", async (t) => {
  const fixture = releaseFixture();
  t.deepEqual(await fixture.select(), {
    bundle: {
      kind: "per-language",
      url: fixture.assets[1].url,
      language: BuiltInLanguage.java,
      combinedBundleURL: fixture.assets[0].url,
    },
    compressionMethod: "zstd",
  });
  t.deepEqual(fixture.requests, [fixture.releaseAPIURL]);
});

test("selectBundle falls back to the combined bundle from the same release", async (t) => {
  const fixture = releaseFixture({ assetNames: [COMBINED] });
  t.deepEqual(await fixture.select(), {
    bundle: { kind: "combined", url: fixture.assets[0].url },
    compressionMethod: "zstd",
    perLanguageBundleFallback: true,
  });
  t.true(
    fixture.messages.some(
      (message) =>
        message.type === "warning" &&
        typeof message.message === "string" &&
        message.message.includes(`'java' at ${RELEASE_PAGE}`),
    ),
  );
});

test("selectBundle selects the combined bundle for jobs that aren't eligible for a per-language bundle", async (t) => {
  const fixture = releaseFixture();
  t.deepEqual(await fixture.select({ rawLanguages: ["java", "python"] }), {
    bundle: { kind: "combined", url: fixture.assets[0].url },
    compressionMethod: "zstd",
  });
});

test("selectBundle uses the other compression method when the preferred one is missing", async (t) => {
  const gzipOnly = releaseFixture({
    assetNames: ["codeql-bundle-linux64.tar.gz", JAVA],
  });
  t.deepEqual(await gzipOnly.select(), {
    bundle: { kind: "combined", url: gzipOnly.assets[0].url },
    compressionMethod: "gzip",
  });

  for (const [platform, options] of [
    [BundlePlatform.Win64, {}],
    [BundlePlatform.Linux64, { cliVersion: "2.18.4" }],
    [BundlePlatform.Linux64, { cliVersion: undefined }],
    [BundlePlatform.Linux64, { tarSupportsZstd: false }],
  ] as const) {
    const selection = await releaseFixture({
      assetNames: [
        `codeql-bundle-${platform}.tar.zst`,
        `codeql-bundle-${platform}.tar.gz`,
      ],
    }).select({ platform, ...options });
    t.is(
      selection.compressionMethod,
      "gzip",
      `${platform} ${JSON.stringify(options)}`,
    );
  }
});

test("selectBundle requires a combined bundle that we can extract", async (t) => {
  await t.throwsAsync(releaseFixture({ assetNames: [JAVA] }).select(), {
    instanceOf: ConfigurationError,
    message: `No compatible CodeQL bundle was found in release ${RELEASE_PAGE}. Expected codeql-bundle-linux64.tar.zst or codeql-bundle-linux64.tar.gz.`,
  });
  await t.throwsAsync(
    releaseFixture({ assetNames: [COMBINED] }).select({
      tarSupportsZstd: false,
    }),
    { instanceOf: ConfigurationError, message: /Expected [^ ]+\.tar\.gz\.$/ },
  );
});

test("getRelease propagates API errors", async (t) => {
  const fixture = releaseFixture({ status: 404 });
  t.like(await t.throwsAsync(fixture.select()), { status: 404 });
  t.deepEqual(fixture.requests, [fixture.releaseAPIURL]);
});

test("getRequestedRelease names a requested release that can't be found", async (t) => {
  const requested = { ...REFERENCE, isCurrentInstance: true };
  await t.throwsAsync(
    getRequestedRelease(releaseFixture({ status: 404 }).state, requested),
    {
      instanceOf: ConfigurationError,
      message: `Could not find the CodeQL release ${RELEASE_PAGE}. Check that it exists and that the token has access to it.`,
    },
  );
  t.like(
    await t.throwsAsync(
      getRequestedRelease(releaseFixture({ status: 500 }).state, requested),
    ),
    { status: 500 },
  );
});

test("getRequestedRelease refers to a release on another instance by URL", async (t) => {
  const fixture = releaseFixture();
  const release = await getRequestedRelease(fixture.state, {
    ...REFERENCE,
    isCurrentInstance: false,
  });
  t.is(
    release.getAssetURL(COMBINED),
    `https://github.com/octo/tools/releases/download/${TAG}/${COMBINED}`,
  );
  t.is(release.assetNames, undefined);
  t.deepEqual(fixture.requests, []);
});

test("getPublicRelease constructs download URLs without looking up the release", async (t) => {
  const fixture = releaseFixture();
  const release = getPublicRelease({ ...REFERENCE, tagName: "nightly/v1+2" });
  const baseURL =
    "https://github.com/octo/tools/releases/download/nightly/v1%2B2";
  t.is(
    release.url,
    "https://github.com/octo/tools/releases/tag/nightly/v1%2B2",
  );
  t.deepEqual(
    await selectBundle(fixture.state, release, {
      ...OPTIONS,
      cliVersion: undefined,
      isLatestNightly: true,
    }),
    {
      bundle: {
        kind: "per-language",
        url: `${baseURL}/${JAVA}`,
        language: BuiltInLanguage.java,
        combinedBundleURL: `${baseURL}/${COMBINED}`,
      },
      compressionMethod: "zstd",
    },
  );
  t.deepEqual(fixture.requests, []);
});

test("parseCodeQLReleaseUrl accepts web and legacy links and decodes tags once", (t) => {
  for (const [suffix, tagName] of [
    [`tag/${TAG}`, TAG],
    [TAG, TAG],
    ["codeql-bundle-20230120", "codeql-bundle-20230120"],
    ["codeql-bundle-v2.27.1-rc.1", "codeql-bundle-v2.27.1-rc.1"],
    ["tag/run-123", "run-123"],
    ["tag/build/123", "build/123"],
    ["tag/build%2F123%2Brc%231", "build/123+rc#1"],
    ["tag/build%252F123", "build%2F123"],
    [`tag/${TAG}/?expanded=true#assets`, TAG],
  ]) {
    t.deepEqual(
      parseCodeQLReleaseUrl(
        `https://github.com/octo/tools/releases/${suffix}`,
        SAMPLE_DOTCOM_API_DETAILS,
      ),
      { ...REFERENCE, isCurrentInstance: true, tagName },
    );
  }
  t.throws(
    () =>
      parseCodeQLReleaseUrl(
        "https://github.com/octo/tools/releases/tag/%zz",
        SAMPLE_DOTCOM_API_DETAILS,
      ),
    { instanceOf: ConfigurationError, message: /Invalid URL encoding/ },
  );
});

test("parseCodeQLReleaseUrl matches the current instance and GitHub.com by origin", (t) => {
  for (const [url, origin, serverURL] of [
    ["https://github.example.test", "https://github.com", "https://github.com"],
    [
      "https://github.example.test/",
      "https://github.example.test",
      "https://github.example.test",
    ],
    [
      "https://GitHub.Example.test",
      "https://github.example.test",
      "https://github.example.test",
    ],
    [
      "https://github.example.test:443",
      "https://GITHUB.example.test:443",
      "https://github.example.test",
    ],
  ]) {
    t.deepEqual(
      parseCodeQLReleaseUrl(`${origin}/octo/tools/releases/tag/${TAG}`, {
        auth: "token",
        url,
        apiURL: undefined,
      }),
      {
        ...REFERENCE,
        serverURL,
        isCurrentInstance: serverURL !== "https://github.com",
      },
      `${url} ${origin}`,
    );
  }
});

test("parseCodeQLReleaseUrl excludes archives, REST references and untrusted URLs", (t) => {
  for (const input of [
    "/tmp/codeql-bundle.tar.zst",
    "nightly",
    `https://github.com/octo/tools/releases/download/${TAG}/${JAVA}`,
    "https://api.github.com/repos/octo/tools/releases/assets/123",
    "https://api.github.com/repos/octo/tools/releases/123",
    `https://api.github.com/repos/octo/tools/releases/tags/${TAG}`,
    "https://github.com/octo/tools/releases/latest",
    "https://github.com/octo/tools/releases/tag/",
    "https://github.com/octo/tools/releases/run-123",
    `https://github.com.example.test/octo/tools/releases/tag/${TAG}`,
    `https://github.com:8443/octo/tools/releases/tag/${TAG}`,
    `https://github.com@example.test/octo/tools/releases/tag/${TAG}`,
    `https://user@github.com/octo/tools/releases/tag/${TAG}`,
    `http://github.com/octo/tools/releases/tag/${TAG}`,
  ]) {
    t.is(
      parseCodeQLReleaseUrl(input, SAMPLE_DOTCOM_API_DETAILS),
      undefined,
      input,
    );
  }
});

test("getRelease returns the names of the release's assets", async (t) => {
  const assetNames = [COMBINED, "cli-version-2.27.2.txt"];
  const fixture = releaseFixture({ assetNames });
  const release = await getRelease(fixture.state, REFERENCE);
  t.deepEqual(release.assetNames, assetNames);
});

test("getReleaseCliVersion prefers an unambiguous marker asset to the tag", (t) => {
  for (const [tagName, markers, cliVersion] of [
    [TAG, [], "2.27.1"],
    [TAG, ["invalid"], "2.27.1"],
    [TAG, ["2.27.2"], "2.27.2"],
    [TAG, ["2.27.1", "2.28.0"], undefined],
    ["codeql-bundle-20260101", [], undefined],
    ["run-123", [], undefined],
    ["run-123", ["2.27.2+202601011200"], "2.27.2+202601011200"],
  ] as const) {
    t.is(
      getReleaseCliVersion(
        tagName,
        [COMBINED, ...markers.map((version) => `cli-version-${version}.txt`)],
        getRecordingLogger([], { logToConsole: false }),
      ),
      cliVersion,
      `${tagName} ${markers.join(",")}`,
    );
  }
});
