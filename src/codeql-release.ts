import * as semver from "semver";

import { ActionState } from "./action-common";
import type { GitHubApiDetails } from "./api-client";
import { CodeQLBundle, getCodeQLBundleName } from "./codeql-bundle";
import { CODEQL_VERSION_ZSTD_BUNDLE } from "./feature-flags";
import {
  getPerLanguageBundleLanguage,
  logMissingPerLanguageBundle,
} from "./per-language-bundles";
import { BundlePlatform } from "./platform";
import type { CompressionMethod } from "./tar";
import { ConfigurationError, GITHUB_DOTCOM_URL, GitHubVariant } from "./util";

/** Identifies a release on a GitHub instance. */
export interface CodeQLReleaseReference {
  serverURL: string;
  owner: string;
  repo: string;
  tagName: string;
}

/** A GitHub release that contains CodeQL bundles. */
export interface CodeQLRelease {
  /** The release's web page, for messages. */
  url: string;
  /** Returns the download URL for an asset, or `undefined` if the release doesn't have it. */
  getAssetURL(name: string): string | undefined;
}

/** A release requested by URL, on this GitHub instance or on GitHub.com. */
export interface RequestedRelease extends CodeQLReleaseReference {
  isCurrentInstance: boolean;
}

/**
 * Recognizes release pages, including legacy bundle links, but never asset URLs.
 *
 * We only accept https URLs without credentials, on this GitHub instance, whose API we can use, or
 * on GitHub.com, whose public releases we can download without credentials. The tag is
 * percent-decoded once, and may contain `/`.
 */
export function parseCodeQLReleaseUrl(
  input: string,
  apiDetails: GitHubApiDetails,
): RequestedRelease | undefined {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    return undefined;
  }

  // GitHub instances are served from the root of their origin.
  const isCurrentInstance = url.origin === new URL(apiDetails.url).origin;
  if (!isCurrentInstance && url.origin !== new URL(GITHUB_DOTCOM_URL).origin) {
    return undefined;
  }
  // Older links to bundle releases omit "tag/", which GitHub still supports. We only accept this
  // form for bundle tags, since other names can clash with routes like `releases/latest`.
  const match = url.pathname
    .replace(/\/$/, "")
    .match(
      /^\/([\w.-]+)\/([\w.-]+)\/releases\/(?:tag\/(.+)|(codeql-bundle-[^/]+))$/,
    );
  if (match === null) {
    return undefined;
  }
  let tagName: string;
  try {
    tagName = decodeURIComponent(match[3] ?? match[4]);
  } catch {
    throw new ConfigurationError(
      "Invalid URL encoding in the CodeQL release tag.",
    );
  }
  return {
    serverURL: url.origin,
    isCurrentInstance,
    owner: match[1],
    repo: match[2],
    tagName,
  };
}

/**
 * Encodes a tag for use in a URL path. Slashes stay as path separators, as in GitHub's release URLs
 * for tags like `build/123`.
 */
function encodeTag(tagName: string): string {
  return tagName.split("/").map(encodeURIComponent).join("/");
}

function getReleasePageURL(reference: CodeQLReleaseReference): string {
  const { serverURL, owner, repo, tagName } = reference;
  return `${serverURL}/${owner}/${repo}/releases/tag/${encodeTag(tagName)}`;
}

/**
 * Looks up a release on the current GitHub instance, which works for private repositories.
 *
 * The API client determines which instance we query, so `reference.serverURL` is only used for the
 * release page URL in messages. The asset URLs are REST API endpoints, which accept the token and
 * return the file when requested with `Accept: application/octet-stream`, unlike browser download
 * URLs.
 */
export async function getRelease(
  { apiClient }: ActionState<["Api"]>,
  reference: CodeQLReleaseReference,
): Promise<CodeQLRelease> {
  const { owner, repo, tagName } = reference;
  const { data: release } = await apiClient.rest.repos.getReleaseByTag({
    owner,
    repo,
    tag: tagName,
  });
  return {
    url: getReleasePageURL(reference),
    getAssetURL: (name) =>
      release.assets.find((asset) => asset.name === name)?.url,
  };
}

/**
 * Refers to a public release without looking it up. Every asset gets a download URL, so a missing
 * asset shows up as a failed download.
 */
export function getPublicRelease(
  reference: CodeQLReleaseReference,
): CodeQLRelease {
  const { serverURL, owner, repo, tagName } = reference;
  return {
    url: getReleasePageURL(reference),
    getAssetURL: (name) =>
      `${serverURL}/${owner}/${repo}/releases/download/${encodeTag(tagName)}/${name}`,
  };
}

/** Describes the job and runner that we are selecting a bundle for. */
export interface BundleSelectionOptions {
  /** Explicit `languages` input, which determines whether a per-language bundle is eligible. */
  rawLanguages: string[] | undefined;
  /** The CLI version in the release, if known. */
  cliVersion: string | undefined;
  platform: BundlePlatform | undefined;
  variant: GitHubVariant;
  tarSupportsZstd: boolean;
  /** Whether the release is the latest nightly, whose CLI version we don't know yet. */
  isLatestNightly?: boolean;
}

/** A bundle selected from a release. */
export interface BundleSelection {
  bundle: CodeQLBundle;
  compressionMethod: CompressionMethod;
  /** The release lacks the eligible per-language bundle, so we selected the combined bundle. */
  perLanguageBundleFallback?: true;
}

/** Returns the compression methods that we can extract, most preferred first. */
function getCompressionMethods({
  cliVersion,
  isLatestNightly,
  platform,
  tarSupportsZstd,
}: BundleSelectionOptions): CompressionMethod[] {
  if (!tarSupportsZstd) {
    return ["gzip"];
  }
  const preferZstd =
    // In testing, gzip performs better than zstd on Windows.
    platform !== BundlePlatform.Win64 &&
    // Standard bundles have zstd archives from this version, and so does the latest nightly. For a
    // release we looked up, gzip comes next if it lacks the zstd archive.
    (isLatestNightly ||
      (cliVersion !== undefined &&
        semver.gte(cliVersion, CODEQL_VERSION_ZSTD_BUNDLE)));
  return preferZstd ? ["zstd", "gzip"] : ["gzip", "zstd"];
}

/**
 * Selects a per-language bundle if the job is eligible for one, and otherwise the combined bundle.
 * We only select a per-language bundle from a release that also has a combined bundle with the same
 * compression, so that we can fall back to it.
 *
 * If we looked up the release, we can tell that an eligible per-language bundle is missing, so we
 * warn and select the combined bundle straight away. A public release gives every asset a URL, so a
 * missing per-language bundle only shows up as a 404 when downloading, which is when we fall back.
 *
 * Throws a `ConfigurationError` if the release has no combined bundle that we can extract.
 */
export async function selectBundle(
  action: ActionState<["Logger", "ReadOnlyEnv", "FeatureFlags"]>,
  release: CodeQLRelease,
  options: BundleSelectionOptions,
): Promise<BundleSelection> {
  const { logger } = action;
  const compressionMethods = getCompressionMethods(options);
  for (const compressionMethod of compressionMethods) {
    const combinedBundleName = getCodeQLBundleName(
      compressionMethod,
      options.platform,
    );
    const combinedBundleURL = release.getAssetURL(combinedBundleName);
    if (combinedBundleURL === undefined) {
      continue;
    }
    const combined: BundleSelection = {
      bundle: { kind: "combined", url: combinedBundleURL },
      compressionMethod,
    };

    const language = await getPerLanguageBundleLanguage(action, {
      ...options,
      compressionMethod,
    });
    if (language === undefined) {
      logger.info(
        `Selected CodeQL bundle ${combinedBundleName} from ${release.url}.`,
      );
      return combined;
    }
    const name = getCodeQLBundleName(
      compressionMethod,
      options.platform,
      language,
    );
    const url = release.getAssetURL(name);
    if (url === undefined) {
      logMissingPerLanguageBundle(action, language, release.url);
      return { ...combined, perLanguageBundleFallback: true };
    }
    logger.info(`Selected CodeQL bundle ${name} from ${release.url}.`);
    return {
      bundle: { kind: "per-language", url, language, combinedBundleURL },
      compressionMethod,
    };
  }
  throw new ConfigurationError(
    `No compatible CodeQL bundle was found in release ${release.url}. Expected ${compressionMethods
      .map((method) => getCodeQLBundleName(method, options.platform))
      .join(" or ")}.`,
  );
}
