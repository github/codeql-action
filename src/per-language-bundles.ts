import * as semver from "semver";

import { isGitHubHostedRunner } from "./actions-util";
import { Feature, FeatureEnablement } from "./feature-flags";
import { BuiltInLanguage, parseBuiltInLanguage } from "./languages";
import { Logger } from "./logging";
import * as tar from "./tar";
import { GitHubVariant } from "./util";

/**
 * First version of the CodeQL CLI whose releases include per-language bundles.
 *
 * TODO(per-language-bundles): This is a sentinel value that no release can ever satisfy, so
 * per-language bundles are disabled no matter what the feature flag says. This MUST be updated to
 * the first CLI version that actually publishes per-language bundles before the feature can be
 * rolled out.
 */
export const MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION = "99.99.99";

/**
 * Matches the name of a bundle that contains a single language, capturing that language.
 *
 * The language comes before the platform so that the name of a per-language bundle never has the
 * name of the combined bundle for the same platform as a prefix.
 */
const PER_LANGUAGE_BUNDLE_NAME =
  /^codeql-bundle-(.+)-(?:linux64|osx64|win64)\.tar\.(?:gz|zst)$/;

/**
 * Determines whether a URL points at a bundle that contains only a single language.
 *
 * We need to recognise these even when we did not choose to download one ourselves, since a bundle
 * that is missing most of its extractors must not be added to the toolcache no matter how we came
 * to be downloading it.
 *
 * @returns The language that the bundle contains, or `undefined` if the URL does not point at a
 * bundle for a single language.
 */
export function tryGetBundleLanguageFromUrl(
  url: string,
): BuiltInLanguage | undefined {
  let assetName: string;
  try {
    assetName = new URL(url).pathname.split("/").pop() ?? "";
  } catch {
    return undefined;
  }

  const match = assetName.match(PER_LANGUAGE_BUNDLE_NAME);
  return match ? parseBuiltInLanguage(match[1]) : undefined;
}

/**
 * The platform of the per-language bundle we use for each language.
 *
 * We publish at most one per-language bundle per language, so a language is only eligible when the
 * job is running on the corresponding platform. Languages that are absent from this record have no
 * per-language bundle at all.
 */
const PER_LANGUAGE_BUNDLE_PLATFORMS: Readonly<
  Partial<Record<BuiltInLanguage, string>>
> = {
  [BuiltInLanguage.actions]: "linux64",
  [BuiltInLanguage.cpp]: "linux64",
  [BuiltInLanguage.csharp]: "linux64",
  [BuiltInLanguage.go]: "linux64",
  [BuiltInLanguage.java]: "linux64",
  [BuiltInLanguage.javascript]: "linux64",
  [BuiltInLanguage.python]: "linux64",
  [BuiltInLanguage.ruby]: "linux64",
  [BuiltInLanguage.rust]: "linux64",
  [BuiltInLanguage.swift]: "osx64",
};

/** Inputs that determine whether we may download a per-language bundle. */
export interface PerLanguageBundleOptions {
  /**
   * The languages that were requested for analysis.
   *
   * These must have been set explicitly via the `languages` input rather than autodetected, since
   * autodetection needs a CodeQL instance that we do not have while we are choosing which bundle to
   * download.
   */
  rawLanguages: string[] | undefined;
  /** The CLI version of the bundle we are about to download, if known. */
  cliVersion: string | undefined;
  /** The compression method of the bundle we are about to download. */
  compressionMethod: tar.CompressionMethod;
  /** The platform component of the bundle name, for example `linux64`. */
  platform: string | undefined;
  /** The GitHub product we are running against. */
  variant: GitHubVariant;
}

/**
 * Determines whether we should download a bundle containing only the language being analysed
 * instead of the combined bundle that contains every language.
 *
 * Per-language bundles are substantially smaller than the combined bundle, so using one saves both
 * download time and disk space on the runner.
 *
 * @returns The language whose per-language bundle we should download, or `undefined` if we should
 * download the combined bundle.
 */
export async function getPerLanguageBundleLanguage(
  options: PerLanguageBundleOptions,
  features: FeatureEnablement,
  logger: Logger,
): Promise<BuiltInLanguage | undefined> {
  const { rawLanguages, cliVersion, compressionMethod, platform, variant } =
    options;

  const explain = (reason: string) => {
    logger.debug(`Not using a per-language CodeQL bundle since ${reason}.`);
    return undefined;
  };

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
    return explain(`the bundle would be downloaded as ${compressionMethod}`);
  }

  if (variant !== GitHubVariant.DOTCOM) {
    // Other products resolve bundles against their own instance first, and only fall back to
    // github.com when the instance does not have the asset. Since they are unlikely to mirror
    // per-language bundles, asking for one would quietly move the download off the instance.
    //
    // We cannot simply let that fail and fall back: an instance whose runners cannot reach
    // github.com produces a connection error rather than a 404, which is not something we fall back
    // from, so the job would fail outright where today it succeeds.
    return explain(`we are running against ${variant}`);
  }

  if (!isGitHubHostedRunner()) {
    // We never add per-language bundles to the toolcache, since a bundle for one language must not
    // be reused for another. That trade-off only pays off on GitHub-hosted runners, which are
    // discarded after the job, so their toolcache could not have been reused anyway. A self-hosted
    // runner may well have a toolcache that persists between jobs, and populating it is worth more
    // than a smaller download.
    return explain("the job is not running on a GitHub-hosted runner");
  }

  if (cliVersion === undefined) {
    return explain("the CLI version of the bundle is unknown");
  }

  if (!semver.gte(cliVersion, MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION)) {
    return explain(
      `CodeQL ${cliVersion} is older than ${MIN_PER_LANGUAGE_BUNDLE_CLI_VERSION}, which is the ` +
        "first version that publishes per-language bundles",
    );
  }

  const supportedPlatform = PER_LANGUAGE_BUNDLE_PLATFORMS[language];
  if (supportedPlatform === undefined) {
    return explain(`no per-language bundle is published for ${language}`);
  }
  if (supportedPlatform !== platform) {
    return explain(
      `the ${language} bundle is only published for ${supportedPlatform}, but this job is ` +
        `running on ${platform ?? "an unknown platform"}`,
    );
  }

  if (!(await features.getValue(Feature.PerLanguageBundles))) {
    return explain(`the ${Feature.PerLanguageBundles} feature is disabled`);
  }

  return language;
}
