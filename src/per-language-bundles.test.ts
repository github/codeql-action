import test from "ava";

import { ActionsEnvVars, ReadOnlyEnv } from "./environment";
import { Feature } from "./feature-flags";
import { BuiltInLanguage } from "./languages";
import {
  getPerLanguageBundleLanguage,
  MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION,
  PerLanguageBundleOptions,
  tryGetBundleLanguageFromUrl,
} from "./per-language-bundles";
import {
  createFeatures,
  getRecordingLogger,
  getTestEnv,
  LoggedMessage,
} from "./testing-utils";
import { GitHubVariant } from "./util";

/** Options for which we would use a per-language bundle. */
const ELIGIBLE_OPTIONS: PerLanguageBundleOptions = {
  rawLanguages: ["java"],
  // Any version at least as new as the minimum will do.
  cliVersion: MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION,
  compressionMethod: "zstd",
  platform: "linux64",
  variant: GitHubVariant.DOTCOM,
};

async function checkEligibility(
  overrides: Partial<PerLanguageBundleOptions>,
  enabledFeatures: Feature[] = [Feature.PerLanguageBundles],
  env: ReadOnlyEnv = getTestEnv({
    [ActionsEnvVars.RUNNER_ENVIRONMENT]: "github-hosted",
  }),
) {
  return getPerLanguageBundleLanguage(
    {
      env,
      features: createFeatures(enabledFeatures),
      logger: getRecordingLogger([], { logToConsole: false }),
    },
    { ...ELIGIBLE_OPTIONS, ...overrides },
  );
}

test("getPerLanguageBundleLanguage selects Linux bundles for non-Swift languages", async (t) => {
  for (const language of Object.values(BuiltInLanguage)) {
    if (language === BuiltInLanguage.swift) {
      continue;
    }
    t.is(await checkEligibility({ rawLanguages: [language] }), language);
  }
});

test("getPerLanguageBundleLanguage normalizes aliases before selecting a bundle", async (t) => {
  t.is(
    await checkEligibility({ rawLanguages: ["java-kotlin"] }),
    BuiltInLanguage.java,
  );
});

test("getPerLanguageBundleLanguage selects the macOS bundle for Swift", async (t) => {
  t.is(
    await checkEligibility({ rawLanguages: ["swift"], platform: "osx64" }),
    BuiltInLanguage.swift,
  );
  // Swift is only published for macOS.
  t.is(
    await checkEligibility({ rawLanguages: ["swift"], platform: "linux64" }),
    undefined,
  );
});

test("getPerLanguageBundleLanguage rejects unsupported platforms", async (t) => {
  t.is(await checkEligibility({ platform: "osx64" }), undefined);
  t.is(await checkEligibility({ platform: "win64" }), undefined);
  // We do not publish per-language bundles for Linux Arm64 either.
  t.is(await checkEligibility({ platform: "linux-arm64" }), undefined);
  t.is(await checkEligibility({ platform: undefined }), undefined);
});

test("getPerLanguageBundleLanguage requires exactly one language", async (t) => {
  t.is(await checkEligibility({ rawLanguages: undefined }), undefined);
  t.is(await checkEligibility({ rawLanguages: [] }), undefined);
  t.is(await checkEligibility({ rawLanguages: ["java", "python"] }), undefined);
});

test("getPerLanguageBundleLanguage requires a known language", async (t) => {
  t.is(await checkEligibility({ rawLanguages: ["cobol"] }), undefined);
});

test("getPerLanguageBundleLanguage requires a zstd bundle", async (t) => {
  t.is(await checkEligibility({ compressionMethod: "gzip" }), undefined);
});

test("getPerLanguageBundleLanguage requires GitHub.com", async (t) => {
  // Other products resolve the combined bundle against their own instance, so asking for a
  // per-language bundle they do not mirror would move the download off that instance.
  for (const variant of [GitHubVariant.GHES, GitHubVariant.GHEC_DR]) {
    t.is(await checkEligibility({ variant }), undefined);
  }
});

test("getPerLanguageBundleLanguage requires a GitHub-hosted runner", async (t) => {
  // A self-hosted runner may have a toolcache that persists between jobs, which is worth more than
  // a smaller download.
  t.is(
    await checkEligibility(
      {},
      [Feature.PerLanguageBundles],
      getTestEnv({ [ActionsEnvVars.RUNNER_ENVIRONMENT]: "self-hosted" }),
    ),
    undefined,
  );

  // Self-hosted runners are routinely configured to look like hosted ones, for example by mounting
  // a persistent volume at `/opt/hostedtoolcache`, so we require the service to tell us explicitly.
  t.is(
    await checkEligibility(
      {},
      [Feature.PerLanguageBundles],
      getTestEnv({ RUNNER_TOOL_CACHE: "/opt/hostedtoolcache" }),
    ),
    undefined,
  );
});

test("getPerLanguageBundleLanguage requires a supported release version", async (t) => {
  t.is(await checkEligibility({ cliVersion: undefined }), undefined);
  t.is(await checkEligibility({ cliVersion: "2.27.0" }), undefined);
  t.is(await checkEligibility({ cliVersion: "2.27.1" }), BuiltInLanguage.java);
});

test("getPerLanguageBundleLanguage requires the feature flag", async (t) => {
  t.is(await checkEligibility({}, []), undefined);
});

test("getPerLanguageBundleLanguage explains a disabled feature before checking eligibility", async (t) => {
  const messages: LoggedMessage[] = [];
  const language = await getPerLanguageBundleLanguage(
    {
      env: getTestEnv(),
      features: createFeatures([]),
      logger: getRecordingLogger(messages, { logToConsole: false }),
    },
    { ...ELIGIBLE_OPTIONS, rawLanguages: undefined, cliVersion: undefined },
  );

  t.is(language, undefined);
  t.deepEqual(
    messages.map((message) => message.message),
    [
      "Not using a per-language CodeQL bundle since the per_language_bundles feature is disabled.",
    ],
  );
});

test("getPerLanguageBundleLanguage skips only the release version check for nightlies", async (t) => {
  const nightly = { isNightly: true, cliVersion: undefined };
  t.is(await checkEligibility(nightly), BuiltInLanguage.java);

  for (const overrides of [
    { rawLanguages: undefined },
    { rawLanguages: ["java", "python"] },
    { compressionMethod: "gzip" as const },
    { platform: "osx64" },
    { variant: GitHubVariant.GHES },
    { variant: GitHubVariant.GHEC_DR },
  ]) {
    t.is(await checkEligibility({ ...nightly, ...overrides }), undefined);
  }
  t.is(await checkEligibility(nightly, []), undefined);
  t.is(
    await checkEligibility(
      nightly,
      [Feature.PerLanguageBundles],
      getTestEnv({ [ActionsEnvVars.RUNNER_ENVIRONMENT]: "self-hosted" }),
    ),
    undefined,
  );
});

test("tryGetBundleLanguageFromUrl recognizes per-language bundle URLs", (t) => {
  const url = (name: string) =>
    `https://github.com/github/codeql-action/releases/download/codeql-bundle-v1.2.3/${name}`;

  t.is(
    tryGetBundleLanguageFromUrl(url("codeql-bundle-java-linux64.tar.zst")),
    BuiltInLanguage.java,
  );
  t.is(
    tryGetBundleLanguageFromUrl(url("codeql-bundle-swift-osx64.tar.zst")),
    BuiltInLanguage.swift,
  );
  // We do not publish these, but should still recognize them if we ever do.
  t.is(
    tryGetBundleLanguageFromUrl(url("codeql-bundle-csharp-win64.tar.gz")),
    BuiltInLanguage.csharp,
  );
  // A percent-encoded name resolves to the same asset, so it must not let a bundle that contains a
  // single language pass for one that contains them all and end up in the toolcache.
  t.is(
    tryGetBundleLanguageFromUrl(url("codeql-bundle-%70ython-linux64.tar.zst")),
    BuiltInLanguage.python,
  );
});

test("tryGetBundleLanguageFromUrl rejects other bundle URLs", (t) => {
  const url = (name: string) =>
    `https://github.com/github/codeql-action/releases/download/codeql-bundle-v1.2.3/${name}`;

  for (const name of [
    "codeql-bundle-linux64.tar.zst",
    "codeql-bundle-osx64.tar.gz",
    "codeql-bundle-win64.tar.zst",
    // The all-platform bundle.
    "codeql-bundle.tar.gz",
    // A platform we do not publish per-language bundles for, whose name also contains a hyphen.
    "codeql-bundle-linux-arm64.tar.zst",
    // Not a language we know about.
    "codeql-bundle-cobol-linux64.tar.zst",
    // A name we cannot decode must not be mistaken for a language either.
    "codeql-bundle-%zz-linux64.tar.zst",
  ]) {
    t.is(tryGetBundleLanguageFromUrl(url(name)), undefined, name);
  }

  t.is(tryGetBundleLanguageFromUrl("not a url"), undefined);
});
