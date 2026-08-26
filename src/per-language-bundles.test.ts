import test from "ava";

import { ActionsEnvVars } from "./environment";
import { Feature } from "./feature-flags";
import { BuiltInLanguage } from "./languages";
import { getRunnerLogger } from "./logging";
import {
  getPerLanguageBundleLanguage,
  MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION,
  PerLanguageBundleOptions,
  tryGetBundleLanguageFromUrl,
} from "./per-language-bundles";
import { createFeatures, setupTests } from "./testing-utils";
import { GitHubVariant } from "./util";

setupTests(test);

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
) {
  return getPerLanguageBundleLanguage(
    { ...ELIGIBLE_OPTIONS, ...overrides },
    createFeatures(enabledFeatures),
    getRunnerLogger(true),
  );
}

test.beforeEach(() => {
  process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "github-hosted";
});

test.serial(
  "uses a per-language bundle when everything lines up",
  async (t) => {
    t.is(await checkEligibility({}), BuiltInLanguage.java);
  },
);

test.serial("resolves the language names used by default setup", async (t) => {
  // Code Scanning default setup passes the combined language names, which do not match the
  // extractor names that the bundles are published under.
  for (const [rawLanguage, expected] of [
    ["java-kotlin", BuiltInLanguage.java],
    ["kotlin", BuiltInLanguage.java],
    ["javascript-typescript", BuiltInLanguage.javascript],
    ["typescript", BuiltInLanguage.javascript],
    ["c-cpp", BuiltInLanguage.cpp],
    ["c", BuiltInLanguage.cpp],
    ["c++", BuiltInLanguage.cpp],
    ["c#", BuiltInLanguage.csharp],
    ["actions", BuiltInLanguage.actions],
    ["go", BuiltInLanguage.go],
    ["python", BuiltInLanguage.python],
    ["ruby", BuiltInLanguage.ruby],
    ["rust", BuiltInLanguage.rust],
  ] as const) {
    t.is(
      await checkEligibility({ rawLanguages: [rawLanguage] }),
      expected,
      `Expected '${rawLanguage}' to resolve to '${expected}'`,
    );
  }
});

test.serial("uses the macOS bundle for Swift", async (t) => {
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

test.serial("only publishes non-Swift languages for Linux", async (t) => {
  t.is(await checkEligibility({ platform: "osx64" }), undefined);
  t.is(await checkEligibility({ platform: "win64" }), undefined);
  t.is(await checkEligibility({ platform: undefined }), undefined);
});

test.serial("requires exactly one language", async (t) => {
  t.is(await checkEligibility({ rawLanguages: undefined }), undefined);
  t.is(await checkEligibility({ rawLanguages: [] }), undefined);
  t.is(await checkEligibility({ rawLanguages: ["java", "python"] }), undefined);
});

test.serial("requires a language that CodeQL knows about", async (t) => {
  t.is(await checkEligibility({ rawLanguages: ["cobol"] }), undefined);
});

test.serial("requires a zstd bundle", async (t) => {
  t.is(await checkEligibility({ compressionMethod: "gzip" }), undefined);
});

test.serial("requires GitHub.com", async (t) => {
  // Other products resolve the combined bundle against their own instance, so asking for a
  // per-language bundle they do not mirror would move the download off that instance.
  for (const variant of [GitHubVariant.GHES, GitHubVariant.GHEC_DR]) {
    t.is(await checkEligibility({ variant }), undefined);
  }
});

test.serial("requires a GitHub-hosted runner", async (t) => {
  // A self-hosted runner may have a toolcache that persists between jobs, which is worth more than
  // a smaller download.
  process.env[ActionsEnvVars.RUNNER_ENVIRONMENT] = "self-hosted";
  t.is(await checkEligibility({}), undefined);

  // Self-hosted runners are routinely configured to look like hosted ones, for example by mounting
  // a persistent volume at `/opt/hostedtoolcache`, so we require the service to tell us explicitly.
  delete process.env[ActionsEnvVars.RUNNER_ENVIRONMENT];
  process.env["RUNNER_TOOL_CACHE"] = "/opt/hostedtoolcache";
  t.is(await checkEligibility({}), undefined);
});

test.serial("requires a new enough CLI version", async (t) => {
  t.is(await checkEligibility({ cliVersion: undefined }), undefined);
  t.is(
    await checkEligibility({
      cliVersion: decrementPatchVersion(MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION),
    }),
    undefined,
  );
});

test.serial("requires the feature flag", async (t) => {
  t.is(await checkEligibility({}, []), undefined);
});

test.serial("recognizes a per-language bundle from its URL", (t) => {
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
  // A token in the URL must not prevent us from recognizing the bundle.
  t.is(
    tryGetBundleLanguageFromUrl(
      `${url("codeql-bundle-ruby-linux64.tar.zst")}?token=secret`,
    ),
    BuiltInLanguage.ruby,
  );
});

test.serial("does not mistake other bundles for per-language ones", (t) => {
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
  ]) {
    t.is(tryGetBundleLanguageFromUrl(url(name)), undefined, name);
  }

  t.is(tryGetBundleLanguageFromUrl("not a url"), undefined);
});

function decrementPatchVersion(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch - 1}`;
}
