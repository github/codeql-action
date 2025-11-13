import * as fs from "fs";
import path from "path";

import * as actionsCache from "@actions/cache";
import * as glob from "@actions/glob";
import test from "ava";
import * as sinon from "sinon";

import { cacheKeyHashLength } from "./caching-utils";
import { createStubCodeQL } from "./codeql";
import {
  CacheConfig,
  checkHashPatterns,
  getCsharpHashPatterns,
  getFeaturePrefix,
  makePatternCheck,
  internal,
  CSHARP_BASE_PATTERNS,
  CSHARP_EXTRA_PATTERNS,
  downloadDependencyCaches,
  CacheHitKind,
  cacheKey,
  getCsharpDependencyDirs,
  getCsharpTempDependencyDir,
} from "./dependency-caching";
import { Feature } from "./feature-flags";
import { KnownLanguage } from "./languages";
import {
  setupTests,
  createFeatures,
  getRecordingLogger,
  checkExpectedLogMessages,
  LoggedMessage,
} from "./testing-utils";
import { withTmpDir } from "./util";

setupTests(test);

function makeAbsolutePatterns(tmpDir: string, patterns: string[]): string[] {
  return patterns.map((pattern) => path.join(tmpDir, pattern));
}

test("getCsharpDependencyDirs - does not include BMN dir if FF is enabled", async (t) => {
  await withTmpDir(async (tmpDir) => {
    process.env["RUNNER_TEMP"] = tmpDir;
    const codeql = createStubCodeQL({});
    const features = createFeatures([]);

    const results = await getCsharpDependencyDirs(codeql, features);
    t.false(results.includes(getCsharpTempDependencyDir()));
  });
});

test("getCsharpDependencyDirs - includes BMN dir if FF is enabled", async (t) => {
  await withTmpDir(async (tmpDir) => {
    process.env["RUNNER_TEMP"] = tmpDir;
    const codeql = createStubCodeQL({});
    const features = createFeatures([Feature.CsharpCacheBuildModeNone]);

    const results = await getCsharpDependencyDirs(codeql, features);
    t.assert(results.includes(getCsharpTempDependencyDir()));
  });
});

test("makePatternCheck - returns undefined if no patterns match", async (t) => {
  await withTmpDir(async (tmpDir) => {
    fs.writeFileSync(path.join(tmpDir, "test.java"), "");
    const result = await makePatternCheck(
      makeAbsolutePatterns(tmpDir, ["**/*.cs"]),
    );
    t.is(result, undefined);
  });
});

test("makePatternCheck - returns all patterns if any pattern matches", async (t) => {
  await withTmpDir(async (tmpDir) => {
    fs.writeFileSync(path.join(tmpDir, "test.java"), "");
    const patterns = makeAbsolutePatterns(tmpDir, ["**/*.cs", "**/*.java"]);
    const result = await makePatternCheck(patterns);
    t.deepEqual(result, patterns);
  });
});

test("getCsharpHashPatterns - returns base patterns if any pattern matches", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([]);
  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");

  makePatternCheckStub
    .withArgs(CSHARP_BASE_PATTERNS)
    .resolves(CSHARP_BASE_PATTERNS);
  makePatternCheckStub.withArgs(CSHARP_EXTRA_PATTERNS).rejects();

  await t.notThrowsAsync(async () => {
    const result = await getCsharpHashPatterns(codeql, features);
    t.deepEqual(result, CSHARP_BASE_PATTERNS);
  });
});

test("getCsharpHashPatterns - returns base patterns if any base pattern matches and CsharpNewCacheKey is enabled", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([Feature.CsharpNewCacheKey]);
  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");

  makePatternCheckStub
    .withArgs(CSHARP_BASE_PATTERNS)
    .resolves(CSHARP_BASE_PATTERNS);
  makePatternCheckStub
    .withArgs(CSHARP_EXTRA_PATTERNS)
    .resolves(CSHARP_EXTRA_PATTERNS);

  await t.notThrowsAsync(async () => {
    const result = await getCsharpHashPatterns(codeql, features);
    t.deepEqual(result, CSHARP_BASE_PATTERNS);
  });
});

test("getCsharpHashPatterns - returns extra patterns if any extra pattern matches and CsharpNewCacheKey is enabled", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([Feature.CsharpNewCacheKey]);
  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");

  makePatternCheckStub.withArgs(CSHARP_BASE_PATTERNS).resolves(undefined);
  makePatternCheckStub
    .withArgs(CSHARP_EXTRA_PATTERNS)
    .resolves(CSHARP_EXTRA_PATTERNS);

  await t.notThrowsAsync(async () => {
    const result = await getCsharpHashPatterns(codeql, features);
    t.deepEqual(result, CSHARP_EXTRA_PATTERNS);
  });
});

test("getCsharpHashPatterns - returns undefined if neither base nor extra patterns match", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([Feature.CsharpNewCacheKey]);
  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");

  makePatternCheckStub.withArgs(CSHARP_BASE_PATTERNS).resolves(undefined);
  makePatternCheckStub.withArgs(CSHARP_EXTRA_PATTERNS).resolves(undefined);

  await t.notThrowsAsync(async () => {
    const result = await getCsharpHashPatterns(codeql, features);
    t.deepEqual(result, undefined);
  });
});

test("checkHashPatterns - logs when no patterns match", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([]);
  const messages: LoggedMessage[] = [];
  const config: CacheConfig = {
    getDependencyPaths: async () => [],
    getHashPatterns: async () => undefined,
  };

  const result = await checkHashPatterns(
    codeql,
    features,
    KnownLanguage.csharp,
    config,
    "download",
    getRecordingLogger(messages),
  );

  t.is(result, undefined);
  checkExpectedLogMessages(t, messages, [
    "Skipping download of dependency cache",
  ]);
});

test("checkHashPatterns - returns patterns when patterns match", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const codeql = createStubCodeQL({});
    const features = createFeatures([]);
    const messages: LoggedMessage[] = [];
    const patterns = makeAbsolutePatterns(tmpDir, ["**/*.cs", "**/*.java"]);

    fs.writeFileSync(path.join(tmpDir, "test.java"), "");

    const config: CacheConfig = {
      getDependencyPaths: async () => [],
      getHashPatterns: async () => makePatternCheck(patterns),
    };

    const result = await checkHashPatterns(
      codeql,
      features,
      KnownLanguage.csharp,
      config,
      "upload",
      getRecordingLogger(messages),
    );

    t.deepEqual(result, patterns);
    t.deepEqual(messages, []);
  });
});

type RestoreCacheFunc = (
  paths: string[],
  primaryKey: string,
  restoreKeys: string[] | undefined,
) => Promise<string | undefined>;

/**
 * Constructs a function that `actionsCache.restoreCache` can be stubbed with.
 *
 * @param mockCacheKeys The keys of caches that we want to exist in the Actions cache.
 *
 * @returns Returns a function that `actionsCache.restoreCache` can be stubbed with.
 */
function makeMockCacheCheck(mockCacheKeys: string[]): RestoreCacheFunc {
  return async (
    _paths: string[],
    primaryKey: string,
    restoreKeys: string[] | undefined,
  ) => {
    // The behaviour here mirrors what the real `restoreCache` would do:
    // - Starting with the primary restore key, check all caches for a match:
    //   even for the primary restore key, this only has to be a prefix match.
    // - If the primary restore key doesn't prefix-match any cache, then proceed
    //   in the same way for each restore key in turn.
    for (const restoreKey of [primaryKey, ...(restoreKeys || [])]) {
      for (const mockCacheKey of mockCacheKeys) {
        if (mockCacheKey.startsWith(restoreKey)) {
          return mockCacheKey;
        }
      }
    }
    // Only if no restore key matches any cache key prefix, there is no matching
    // cache and we return `undefined`.
    return undefined;
  };
}

test("downloadDependencyCaches - does not restore caches with feature keys if no features are enabled", async (t) => {
  process.env["RUNNER_OS"] = "Linux";

  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  sinon.stub(glob, "hashFiles").resolves("abcdef");

  const keyWithFeature = await cacheKey(
    codeql,
    createFeatures([Feature.CsharpNewCacheKey]),
    KnownLanguage.csharp,
    // Patterns don't matter here because we have stubbed `hashFiles` to always return a specific hash above.
    [],
  );

  const restoreCacheStub = sinon
    .stub(actionsCache, "restoreCache")
    .callsFake(makeMockCacheCheck([keyWithFeature]));

  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");
  makePatternCheckStub
    .withArgs(CSHARP_BASE_PATTERNS)
    .resolves(CSHARP_BASE_PATTERNS);
  makePatternCheckStub.withArgs(CSHARP_EXTRA_PATTERNS).resolves(undefined);

  const results = await downloadDependencyCaches(
    codeql,
    createFeatures([]),
    [KnownLanguage.csharp],
    logger,
  );
  t.is(results.length, 1);
  t.is(results[0].language, KnownLanguage.csharp);
  t.is(results[0].hit_kind, CacheHitKind.Miss);
  t.assert(restoreCacheStub.calledOnce);
});

test("downloadDependencyCaches - restores caches with feature keys if features are enabled", async (t) => {
  process.env["RUNNER_OS"] = "Linux";

  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);
  const features = createFeatures([Feature.CsharpNewCacheKey]);

  sinon.stub(glob, "hashFiles").resolves("abcdef");

  const keyWithFeature = await cacheKey(
    codeql,
    features,
    KnownLanguage.csharp,
    // Patterns don't matter here because we have stubbed `hashFiles` to always return a specific hash above.
    [],
  );

  const restoreCacheStub = sinon
    .stub(actionsCache, "restoreCache")
    .callsFake(makeMockCacheCheck([keyWithFeature]));

  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");
  makePatternCheckStub
    .withArgs(CSHARP_BASE_PATTERNS)
    .resolves(CSHARP_BASE_PATTERNS);
  makePatternCheckStub.withArgs(CSHARP_EXTRA_PATTERNS).resolves(undefined);

  const results = await downloadDependencyCaches(
    codeql,
    features,
    [KnownLanguage.csharp],
    logger,
  );
  t.is(results.length, 1);
  t.is(results[0].language, KnownLanguage.csharp);
  t.is(results[0].hit_kind, CacheHitKind.Exact);
  t.assert(restoreCacheStub.calledOnce);
});

test("downloadDependencyCaches - restores caches with feature keys if features are enabled for partial matches", async (t) => {
  process.env["RUNNER_OS"] = "Linux";

  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);
  const features = createFeatures([Feature.CsharpNewCacheKey]);

  const hashFilesStub = sinon.stub(glob, "hashFiles");
  hashFilesStub.onFirstCall().resolves("abcdef");
  hashFilesStub.onSecondCall().resolves("123456");

  const keyWithFeature = await cacheKey(
    codeql,
    features,
    KnownLanguage.csharp,
    // Patterns don't matter here because we have stubbed `hashFiles` to always return a specific hash above.
    [],
  );

  const restoreCacheStub = sinon
    .stub(actionsCache, "restoreCache")
    .callsFake(makeMockCacheCheck([keyWithFeature]));

  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");
  makePatternCheckStub
    .withArgs(CSHARP_BASE_PATTERNS)
    .resolves(CSHARP_BASE_PATTERNS);
  makePatternCheckStub.withArgs(CSHARP_EXTRA_PATTERNS).resolves(undefined);

  const results = await downloadDependencyCaches(
    codeql,
    features,
    [KnownLanguage.csharp],
    logger,
  );
  t.is(results.length, 1);
  t.is(results[0].language, KnownLanguage.csharp);
  t.is(results[0].hit_kind, CacheHitKind.Partial);
  t.assert(restoreCacheStub.calledOnce);
});

test("getFeaturePrefix - returns empty string if no features are enabled", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([]);

  for (const knownLanguage of Object.values(KnownLanguage)) {
    const result = await getFeaturePrefix(codeql, features, knownLanguage);
    t.deepEqual(result, "", `Expected no feature prefix for ${knownLanguage}`);
  }
});

test("getFeaturePrefix - Java - returns 'minify-' if JavaMinimizeDependencyJars is enabled", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([Feature.JavaMinimizeDependencyJars]);

  const result = await getFeaturePrefix(codeql, features, KnownLanguage.java);
  t.deepEqual(result, "minify-");
});

test("getFeaturePrefix - non-Java - returns '' if JavaMinimizeDependencyJars is enabled", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([Feature.JavaMinimizeDependencyJars]);

  for (const knownLanguage of Object.values(KnownLanguage)) {
    // Skip Java since we expect a result for it, which is tested in the previous test.
    if (knownLanguage === KnownLanguage.java) {
      continue;
    }
    const result = await getFeaturePrefix(codeql, features, knownLanguage);
    t.deepEqual(result, "", `Expected no feature prefix for ${knownLanguage}`);
  }
});

test("getFeaturePrefix - C# - returns prefix if CsharpNewCacheKey is enabled", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([Feature.CsharpNewCacheKey]);

  const result = await getFeaturePrefix(codeql, features, KnownLanguage.csharp);
  t.notDeepEqual(result, "");
  t.assert(result.endsWith("-"));
  // Check the length of the prefix, which should correspond to `cacheKeyHashLength` + 1 for the trailing `-`.
  t.is(result.length, cacheKeyHashLength + 1);
});

test("getFeaturePrefix - non-C# - returns '' if CsharpNewCacheKey is enabled", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([Feature.CsharpNewCacheKey]);

  for (const knownLanguage of Object.values(KnownLanguage)) {
    // Skip C# since we expect a result for it, which is tested in the previous test.
    if (knownLanguage === KnownLanguage.csharp) {
      continue;
    }
    const result = await getFeaturePrefix(codeql, features, knownLanguage);
    t.deepEqual(result, "", `Expected no feature prefix for ${knownLanguage}`);
  }
});

test("getFeaturePrefix - C# - returns prefix if CsharpCacheBuildModeNone is enabled", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([Feature.CsharpCacheBuildModeNone]);

  const result = await getFeaturePrefix(codeql, features, KnownLanguage.csharp);
  t.notDeepEqual(result, "");
  t.assert(result.endsWith("-"));
  // Check the length of the prefix, which should correspond to `cacheKeyHashLength` + 1 for the trailing `-`.
  t.is(result.length, cacheKeyHashLength + 1);
});

test("getFeaturePrefix - non-C# - returns '' if CsharpCacheBuildModeNone is enabled", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([Feature.CsharpCacheBuildModeNone]);

  for (const knownLanguage of Object.values(KnownLanguage)) {
    // Skip C# since we expect a result for it, which is tested in the previous test.
    if (knownLanguage === KnownLanguage.csharp) {
      continue;
    }
    const result = await getFeaturePrefix(codeql, features, knownLanguage);
    t.deepEqual(result, "", `Expected no feature prefix for ${knownLanguage}`);
  }
});
