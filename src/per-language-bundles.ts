import * as semver from "semver";

import { ActionState } from "./action-common";
import { isGitHubHostedRunner } from "./actions-util";
import {
  defaultSuites,
  matchesDefaultSetupConfigSchema,
  parseQueriesFromInput,
  QuerySpec,
  UserConfig,
} from "./config/db-config";
import { Feature } from "./feature-flags";
import { RepositoryPropertyName } from "./feature-flags/properties";
import { BuiltInLanguage, parseBuiltInLanguage } from "./languages";
import { BundlePlatform } from "./platform";
import * as tar from "./tar";
import { GitHubVariant } from "./util";

/** Minimum CLI version for selecting a per-language release bundle. */
export const MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION = "2.27.1";

/** Languages with per-language bundles published for each platform. */
const PER_LANGUAGE_BUNDLE_LANGUAGES: Readonly<
  Record<BundlePlatform, ReadonlySet<BuiltInLanguage>>
> = {
  [BundlePlatform.Linux64]: new Set([
    BuiltInLanguage.actions,
    BuiltInLanguage.cpp,
    BuiltInLanguage.csharp,
    BuiltInLanguage.go,
    BuiltInLanguage.java,
    BuiltInLanguage.javascript,
    BuiltInLanguage.python,
    BuiltInLanguage.ruby,
    BuiltInLanguage.rust,
  ]),
  [BundlePlatform.LinuxArm64]: new Set(),
  [BundlePlatform.Osx64]: new Set([BuiltInLanguage.swift]),
  [BundlePlatform.Win64]: new Set(),
};

/** Query configuration that is known before CodeQL is set up. */
export interface QueryConfigInputs {
  /** The configuration file from the `config-file` input or repository property. */
  configFile: string | undefined;
  /** The configuration from the `config` input. */
  configInput: UserConfig | undefined;
  /** The `queries` input. */
  queriesInput: string | undefined;
  /** The `github-codeql-extra-queries` repository property. */
  extraQueriesProperty: string | undefined;
}

/**
 * Explains why the configured queries may need library packs for languages other than the one
 * being analyzed, which a per-language bundle doesn't contain. Returns `undefined` if the only
 * queries that these inputs add are built-in query suites. The `packs` input doesn't matter, since
 * query packs are downloaded together with their dependencies.
 *
 * Any configuration file is assumed to configure such queries, since reading it may need file or API
 * access. So is the `config` input, unless it only sets the properties that default setup sets (see
 * `matchesDefaultSetupConfigSchema`).
 *
 * @throws A `ConfigurationError` if the `queries` input or the `github-codeql-extra-queries`
 *   repository property is a '+' with no queries after it, unless an input that's checked earlier
 *   already gives a reason.
 */
export function getOtherLanguagePacksReason(
  inputs: QueryConfigInputs,
): string | undefined {
  if (inputs.configFile !== undefined) {
    return (
      `the configuration file '${inputs.configFile}' may use queries that need library packs ` +
      "for other languages"
    );
  }

  // The `config` input can configure queries in the same way as a configuration file. The
  // properties that default setup sets, listed in `DEFAULT_SETUP_CONFIG_SCHEMA` in
  // `config/db-config.ts`, don't add queries.
  if (
    inputs.configInput !== undefined &&
    !matchesDefaultSetupConfigSchema(inputs.configInput)
  ) {
    return "the 'config' input may use queries that need library packs for other languages";
  }

  // We can't tell which language a local query or a query from another repository is for without
  // loading it, and CodeQL resolves the library packs for every configured query, including those
  // for languages that aren't being analyzed.
  const query = findNonBuiltInQuery(
    parseQueriesFromInput(inputs.queriesInput).input,
  );
  if (query !== undefined) {
    return `the query '${query}' from the 'queries' input may need library packs for other languages`;
  }
  const extraQuery = findNonBuiltInQuery(
    parseQueriesFromInput(
      inputs.extraQueriesProperty,
      RepositoryPropertyName.EXTRA_QUERIES,
    ).input,
  );
  if (extraQuery !== undefined) {
    return (
      `the query '${extraQuery}' from the '${RepositoryPropertyName.EXTRA_QUERIES}' repository ` +
      "property may need library packs for other languages"
    );
  }

  return undefined;
}

/** Returns the `uses` value of the first of `queries` that isn't a built-in query suite. */
function findNonBuiltInQuery(
  queries: QuerySpec[] | undefined,
): string | undefined {
  return queries?.find((query) => !defaultSuites.has(query.uses))?.uses;
}

/** Inputs that determine whether we may download a per-language bundle. */
export interface PerLanguageBundleOptions {
  /** Explicit input only: autodetection needs a CLI instance. */
  rawLanguages: string[] | undefined;
  /**
   * Why the CodeQL CLI may need packs for other languages, for example because of the configured
   * queries, or `undefined` if it won't. If defined, the combined bundle is used, and this reason is
   * logged to complete the sentence "Not using a per-language CodeQL bundle since ...". See
   * `getOtherLanguagePacksReason`.
   */
  otherLanguagePacksReason: string | undefined;
  /** Requested CLI version, if known. Ignored when requesting the latest nightly. */
  cliVersion: string | undefined;
  compressionMethod: tar.CompressionMethod;
  /** Platform for which the bundle is requested. */
  platform: BundlePlatform | undefined;
  variant: GitHubVariant;
  /** Whether the Action is selecting the latest nightly rather than a release version. */
  isLatestNightly?: boolean;
}

/** Returns the eligible bundle language, or undefined for the combined bundle. */
export async function getPerLanguageBundleLanguage(
  {
    env,
    features,
    logger,
  }: ActionState<["Logger", "ReadOnlyEnv", "FeatureFlags"]>,
  options: PerLanguageBundleOptions,
): Promise<BuiltInLanguage | undefined> {
  const {
    rawLanguages,
    otherLanguagePacksReason,
    cliVersion,
    compressionMethod,
    platform,
    variant,
    isLatestNightly,
  } = options;

  const explain = (reason: string) => {
    logger.debug(`Not using a per-language CodeQL bundle since ${reason}.`);
    return undefined;
  };

  if (!(await features.getValue(Feature.PerLanguageBundles))) {
    return explain("the feature is disabled");
  }

  // A defined reason means the CodeQL CLI may need packs for other languages, for example because
  // of the configured queries. That applies whichever languages were requested, so check it first
  // to avoid suggesting that requesting a single language would be enough.
  if (otherLanguagePacksReason !== undefined) {
    return explain(otherLanguagePacksReason);
  }

  if (rawLanguages?.length !== 1) {
    return explain(
      `exactly one language must be requested via the 'languages' input, but ${
        rawLanguages?.length ?? 0
      } were`,
    );
  }

  const language = parseBuiltInLanguage(rawLanguages[0]);
  if (language === undefined) {
    return explain(`'${rawLanguages[0]}' is not a known CodeQL language`);
  }

  if (compressionMethod !== "zstd") {
    // Per-language bundles are only published as zstd archives.
    return explain(`the bundle would be downloaded as '${compressionMethod}'`);
  }

  if (variant !== GitHubVariant.DOTCOM) {
    // Tenant mirrors may lack these assets, and an unreachable github.com fails with a
    // connection error rather than a recoverable 404.
    return explain(`we are running against ${variant}`);
  }

  if (!isGitHubHostedRunner(env)) {
    // Per-language installs stay out of the toolcache; self-hosted runners should retain
    // the reusable combined bundle instead.
    return explain("the job is not running on a GitHub-hosted runner");
  }

  // Nightly releases are identified by dates rather than versions. If
  // `isLatestNightly` is `true`, the latest nightly is requested with
  // `tools: nightly` and we don't yet have the corresponding tag at this point.
  // Therefore, we skip the version check and don't have an equivalent.
  // We can safely assume that the latest nightly will have per-language bundles.
  if (!isLatestNightly) {
    if (cliVersion === undefined) {
      return explain("the requested CLI version is unknown");
    }

    if (!semver.gte(cliVersion, MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION)) {
      return explain(
        `the requested CodeQL version ${cliVersion} is older than ${MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION}, which is the ` +
          "first version for which per-language bundles are published",
      );
    }
  }

  if (
    platform === undefined ||
    !PER_LANGUAGE_BUNDLE_LANGUAGES[platform].has(language)
  ) {
    return explain(
      `no per-language bundle is published for ${language} on ${platform ?? "an unknown platform"}`,
    );
  }

  return language;
}

/** Explains why an eligible per-language bundle is being replaced by a combined bundle. */
export function logPerLanguageBundleFallback(
  { logger }: ActionState<["Logger"]>,
  language: BuiltInLanguage,
  location: string,
): void {
  logger.warning(
    `No per-language CodeQL bundle for '${language}' was found at ${location}, so ` +
      "falling back to the bundle that contains all languages. This analysis will still " +
      "produce correct results, but will take longer to set up.",
  );
}
