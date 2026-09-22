import * as semver from "semver";

import { ActionState } from "./action-common";
import { isGitHubHostedRunner } from "./actions-util";
import { Feature } from "./feature-flags";
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

/** Inputs that determine whether we may download a per-language bundle. */
export interface PerLanguageBundleOptions {
  /** Explicit input only: autodetection needs a CLI instance. */
  rawLanguages: string[] | undefined;
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
    return explain(`the ${Feature.PerLanguageBundles} feature is disabled`);
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

  // If the user requested the latest nightly, skip the version check, as nightlies have shipped
  // per-language bundles since https://github.com/dsp-testing/codeql-cli-nightlies/releases/tag/codeql-bundle-20260909.
  // Otherwise, check the requested CLI version to determine whether per-language bundles are published.
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
