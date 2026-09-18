import { BuiltInLanguage, parseBuiltInLanguage } from "./languages";

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
