import { BuiltInLanguage, parseBuiltInLanguage } from "./languages";
import { BundlePlatform } from "./platform";
import type { CompressionMethod } from "./tar";

/** Describes the contents and location of a downloadable CodeQL bundle. */
export type CodeQLBundle =
  | { kind: "combined"; url: string }
  | {
      kind: "per-language";
      url: string;
      language: BuiltInLanguage;
      /** Only set when the Action selected the bundle, allowing a same-version fallback. */
      combinedBundleURL?: string;
    };

/** A resolved download, including its bundle identity and version. */
export interface CodeQLDownloadSource {
  /** Distinguishes downloads from local archives and cached installations. */
  sourceType: "download";
  /** The bundle to download. */
  bundle: CodeQLBundle;
  /** The compression format of the bundle archive. */
  compressionMethod: CompressionMethod;
  /** Bundle version of the tools, if known. */
  bundleVersion?: string;
  /** Requested CLI version, if known. */
  cliVersion?: string;
  /** Resolved version for telemetry, independent of whether the bundle can be cached. */
  toolsVersion: string;
  /** The release lacks the eligible per-language bundle, so we selected the combined bundle. */
  perLanguageBundleFallback?: true;
}

/** Returns the exact bundle asset name for a platform and optional language. */
export function getCodeQLBundleName(
  compressionMethod: CompressionMethod,
  platform: BundlePlatform | undefined,
  language?: BuiltInLanguage,
): string {
  const extensions: Record<CompressionMethod, string> = {
    gzip: ".tar.gz",
    zstd: ".tar.zst",
  };
  const extension = extensions[compressionMethod];
  if (platform === undefined) {
    return `codeql-bundle${extension}`;
  }
  if (language !== undefined) {
    return `codeql-bundle-${language}-${platform}${extension}`;
  }
  return `codeql-bundle-${platform}${extension}`;
}

const PER_LANGUAGE_BUNDLE_NAME =
  /^codeql-bundle-(.+)-(?:linux64|osx64|win64)\.tar\.(?:gz|zst)$/;

/** Classifies an explicit tools URL without changing it or adding a fallback. */
export function getCodeQLBundleFromUrl(url: string): CodeQLBundle {
  let assetName: string;
  try {
    const pathname = new URL(url).pathname;
    // URL-encoded names must not bypass the toolcache safeguard.
    assetName = decodeURIComponent(pathname.split("/").pop() ?? "");
  } catch {
    return { kind: "combined", url };
  }

  const match = assetName.match(PER_LANGUAGE_BUNDLE_NAME);
  const language = match ? parseBuiltInLanguage(match[1]) : undefined;
  return language === undefined
    ? { kind: "combined", url }
    : { kind: "per-language", url, language };
}
