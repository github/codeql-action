import test from "ava";

import { ActionsEnvVars } from "./environment";
import { Feature } from "./feature-flags";
import { BuiltInLanguage } from "./languages";
import {
  getOtherLanguagePacksReason,
  getPerLanguageBundleLanguage,
  MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION,
  PerLanguageBundleOptions,
  QueryConfigInputs,
} from "./per-language-bundles";
import { BundlePlatform } from "./platform";
import {
  createFeatures,
  getRecordingLogger,
  getTestEnv,
  initAllState,
  LoggedMessage,
} from "./testing-utils";
import { ConfigurationError, GitHubVariant } from "./util";

/** Options for which we would use a per-language bundle. */
const ELIGIBLE_OPTIONS: PerLanguageBundleOptions = {
  rawLanguages: ["java"],
  otherLanguagePacksReason: undefined,
  // Any version at least as new as the minimum will do.
  cliVersion: MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION,
  compressionMethod: "zstd",
  platform: BundlePlatform.Linux64,
  variant: GitHubVariant.DOTCOM,
};

async function checkEligibility(
  overrides: Partial<PerLanguageBundleOptions>,
  stateOverrides: Partial<ReturnType<typeof initAllState>> = {},
) {
  return getPerLanguageBundleLanguage(
    initAllState({
      env: getTestEnv({
        [ActionsEnvVars.RUNNER_ENVIRONMENT]: "github-hosted",
      }),
      features: createFeatures([Feature.PerLanguageBundles]),
      ...stateOverrides,
    }),
    { ...ELIGIBLE_OPTIONS, ...overrides },
  );
}

for (const platform of Object.values(BundlePlatform)) {
  test(`getPerLanguageBundleLanguage selects only supported languages on ${platform}`, async (t) => {
    for (const language of Object.values(BuiltInLanguage)) {
      const supported =
        language === BuiltInLanguage.swift
          ? platform === BundlePlatform.Osx64
          : platform === BundlePlatform.Linux64;
      t.is(
        await checkEligibility({ rawLanguages: [language], platform }),
        supported ? language : undefined,
        language,
      );
    }
  });
}

test("getPerLanguageBundleLanguage normalizes aliases before selecting a bundle", async (t) => {
  t.is(
    await checkEligibility({ rawLanguages: ["java-kotlin"] }),
    BuiltInLanguage.java,
  );
});

test("getPerLanguageBundleLanguage rejects unknown platforms", async (t) => {
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

test("getPerLanguageBundleLanguage explains why the CodeQL CLI may need packs for other languages before checking the languages", async (t) => {
  // Without a language, the explanation would otherwise suggest requesting a single language.
  for (const rawLanguages of [["java"], undefined]) {
    const messages: LoggedMessage[] = [];
    const language = await checkEligibility(
      { rawLanguages, otherLanguagePacksReason: "an example reason" },
      { logger: getRecordingLogger(messages, { logToConsole: false }) },
    );

    t.is(language, undefined);
    t.deepEqual(
      messages.map((message) => message.message),
      ["Not using a per-language CodeQL bundle since an example reason."],
    );
  }
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
      {
        env: getTestEnv({ [ActionsEnvVars.RUNNER_ENVIRONMENT]: "self-hosted" }),
      },
    ),
    undefined,
  );

  // Self-hosted runners are routinely configured to look like hosted ones, for example by mounting
  // a persistent volume at `/opt/hostedtoolcache`, so we require the service to tell us explicitly.
  t.is(
    await checkEligibility(
      {},
      {
        env: getTestEnv({ RUNNER_TOOL_CACHE: "/opt/hostedtoolcache" }),
      },
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
  t.is(await checkEligibility({}, { features: createFeatures([]) }), undefined);
});

test("getPerLanguageBundleLanguage explains a disabled feature before checking eligibility", async (t) => {
  const messages: LoggedMessage[] = [];
  const language = await getPerLanguageBundleLanguage(
    initAllState({
      features: createFeatures([]),
      logger: getRecordingLogger(messages, { logToConsole: false }),
    }),
    { ...ELIGIBLE_OPTIONS, rawLanguages: undefined, cliVersion: undefined },
  );

  t.is(language, undefined);
  t.deepEqual(
    messages.map((message) => message.message),
    ["Not using a per-language CodeQL bundle since the feature is disabled."],
  );
});

test("getPerLanguageBundleLanguage skips only the release version check for the latest nightly", async (t) => {
  const nightly = { isLatestNightly: true, cliVersion: undefined };
  t.is(await checkEligibility(nightly), BuiltInLanguage.java);

  for (const overrides of [
    { rawLanguages: undefined },
    { rawLanguages: ["java", "python"] },
    { otherLanguagePacksReason: "an example reason" },
    { compressionMethod: "gzip" as const },
    { platform: BundlePlatform.Osx64 },
    { variant: GitHubVariant.GHES },
    { variant: GitHubVariant.GHEC_DR },
  ]) {
    t.is(await checkEligibility({ ...nightly, ...overrides }), undefined);
  }
  t.is(
    await checkEligibility(nightly, { features: createFeatures([]) }),
    undefined,
  );
  t.is(
    await checkEligibility(nightly, {
      env: getTestEnv({ [ActionsEnvVars.RUNNER_ENVIRONMENT]: "self-hosted" }),
    }),
    undefined,
  );
});

/** Query configuration inputs that configure nothing. */
const NO_QUERY_CONFIG: QueryConfigInputs = {
  configFile: undefined,
  configInput: undefined,
  queriesInput: undefined,
  extraQueriesProperty: undefined,
};

test("getOtherLanguagePacksReason returns undefined when no queries are configured", (t) => {
  t.is(getOtherLanguagePacksReason(NO_QUERY_CONFIG), undefined);
});

test("getOtherLanguagePacksReason returns undefined for built-in query suites", (t) => {
  for (const queries of [
    "security-extended",
    "+security-and-quality",
    " security-extended , code-quality ",
  ]) {
    t.is(
      getOtherLanguagePacksReason({
        ...NO_QUERY_CONFIG,
        queriesInput: queries,
        extraQueriesProperty: queries,
      }),
      undefined,
      queries,
    );
  }
});

test("getOtherLanguagePacksReason returns undefined for a config input that only uses default setup properties", (t) => {
  t.is(
    getOtherLanguagePacksReason({
      ...NO_QUERY_CONFIG,
      // The shape of the `config` input that default setup passes.
      configInput: [
        "default-setup:",
        "  org:",
        "    model-packs: [ github/immutable-actions-list@0.0.1 ]",
        "threat-models: [  ]",
      ].join("\n"),
    }),
    undefined,
  );
});

test("getOtherLanguagePacksReason explains a configuration file", (t) => {
  t.is(
    getOtherLanguagePacksReason({
      ...NO_QUERY_CONFIG,
      configFile: "./.github/codeql/codeql-config.yml",
    }),
    "the configuration file './.github/codeql/codeql-config.yml' may use queries that need " +
      "library packs for other languages",
  );
});

test("getOtherLanguagePacksReason explains a config input that uses other properties", (t) => {
  t.is(
    getOtherLanguagePacksReason({
      ...NO_QUERY_CONFIG,
      configInput: "queries: [ { uses: ./queries/show_ifs.ql } ]",
    }),
    "the 'config' input may use queries that need library packs for other languages",
  );
});

test("getOtherLanguagePacksReason explains the first query in the queries input that isn't a built-in query suite", (t) => {
  t.is(
    getOtherLanguagePacksReason({
      ...NO_QUERY_CONFIG,
      queriesInput:
        "+security-extended, ./queries/show_ifs.ql, octo-org/queries@main",
    }),
    "the query './queries/show_ifs.ql' from the 'queries' input may need library packs for " +
      "other languages",
  );
});

test("getOtherLanguagePacksReason explains a query in the extra queries repository property that isn't a built-in query suite", (t) => {
  t.is(
    getOtherLanguagePacksReason({
      ...NO_QUERY_CONFIG,
      extraQueriesProperty: "+octo-org/queries/show_ifs.ql@main",
    }),
    "the query 'octo-org/queries/show_ifs.ql@main' from the 'github-codeql-extra-queries' " +
      "repository property may need library packs for other languages",
  );
});

test("getOtherLanguagePacksReason throws a ConfigurationError for a '+' with no queries after it", (t) => {
  // Loading the configuration would throw the same errors.
  for (const inputs of [
    { queriesInput: "+" },
    { extraQueriesProperty: " + " },
  ]) {
    t.throws(
      () => getOtherLanguagePacksReason({ ...NO_QUERY_CONFIG, ...inputs }),
      { instanceOf: ConfigurationError },
    );
  }
});
