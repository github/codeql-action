import test from "ava";

import { getCodeQLBundleFromUrl, getCodeQLBundleName } from "./codeql-bundle";
import { BuiltInLanguage } from "./languages";
import { BundlePlatform } from "./platform";

test("getCodeQLBundleName returns a per-language bundle name only when a language is specified", (t) => {
  t.is(
    getCodeQLBundleName("zstd", BundlePlatform.Linux64, BuiltInLanguage.java),
    "codeql-bundle-java-linux64.tar.zst",
  );
  t.is(
    getCodeQLBundleName("zstd", BundlePlatform.Linux64),
    "codeql-bundle-linux64.tar.zst",
  );
});

test("getCodeQLBundleName names the Swift bundle for macOS", (t) => {
  t.is(
    getCodeQLBundleName("zstd", BundlePlatform.Osx64, BuiltInLanguage.swift),
    "codeql-bundle-swift-osx64.tar.zst",
  );
});

for (const [assetName, language] of [
  ["codeql-bundle-java-linux64.tar.zst", BuiltInLanguage.java],
  ["codeql-bundle-swift-osx64.tar.zst", BuiltInLanguage.swift],
  // Recognize unpublished language/platform combinations to keep them out of the toolcache.
  ["codeql-bundle-csharp-win64.tar.gz", BuiltInLanguage.csharp],
  ["codeql-bundle-java-kotlin-linux64.tar.zst", BuiltInLanguage.java],
  ["codeql-bundle-%70ython-linux64.tar.zst", BuiltInLanguage.python],
] as const) {
  test(`getCodeQLBundleFromUrl identifies ${assetName} without adding a fallback`, (t) => {
    const url = `https://github.com/github/codeql-action/releases/download/codeql-bundle-v1.2.3/${assetName}`;
    t.deepEqual(getCodeQLBundleFromUrl(url), {
      kind: "per-language",
      url,
      language,
    });
  });
}

test("getCodeQLBundleFromUrl preserves encoding, query parameters and fragments", (t) => {
  const url =
    "https://github.com/github/codeql-action/releases/download/codeql-bundle-v1.2.3/codeql-bundle-%70ython-linux64.tar.zst?download=1#asset";
  t.deepEqual(getCodeQLBundleFromUrl(url), {
    kind: "per-language",
    url,
    language: BuiltInLanguage.python,
  });
});

test("getCodeQLBundleFromUrl treats unrecognized assets as combined bundles", (t) => {
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
    const url = `https://github.com/github/codeql-action/releases/download/codeql-bundle-v1.2.3/${name}`;
    t.deepEqual(getCodeQLBundleFromUrl(url), { kind: "combined", url });
  }
});

test("getCodeQLBundleFromUrl preserves URLs it cannot parse", (t) => {
  const url = "not a url";
  t.deepEqual(getCodeQLBundleFromUrl(url), { kind: "combined", url });
});
