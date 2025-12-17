import * as fs from "fs";
import path from "path";

import * as actionsCache from "@actions/cache";
import * as glob from "@actions/glob";
import test from "ava";
import * as sinon from "sinon";

import { cacheKeyHashLength } from "./caching-utils";
import * as cachingUtils from "./caching-utils";
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
  uploadDependencyCaches,
  CacheStoreResult,
} from "./dependency-caching";
import { Feature } from "./feature-flags";
import { KnownLanguage } from "./languages";
import {
  setupTests,
  createFeatures,
  getRecordingLogger,
  checkExpectedLogMessages,
  LoggedMessage,
  createTestConfig,
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

  const result = await downloadDependencyCaches(
    codeql,
    createFeatures([]),
    [KnownLanguage.csharp],
    logger,
  );
  const statusReport = result.statusReport;
  t.is(statusReport.length, 1);
  t.is(statusReport[0].language, KnownLanguage.csharp);
  t.is(statusReport[0].hit_kind, CacheHitKind.Miss);
  t.deepEqual(result.restoredKeys, []);
  t.assert(restoreCacheStub.calledOnce);
});

test("downloadDependencyCaches - restores caches with feature keys if features are enabled", async (t) => {
  process.env["RUNNER_OS"] = "Linux";

  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);
  const features = createFeatures([Feature.CsharpNewCacheKey]);

  const mockHash = "abcdef";
  sinon.stub(glob, "hashFiles").resolves(mockHash);

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

  const result = await downloadDependencyCaches(
    codeql,
    features,
    [KnownLanguage.csharp],
    logger,
  );

  // Check that the status report for telemetry indicates that one cache was restored with an exact match.
  const statusReport = result.statusReport;
  t.is(statusReport.length, 1);
  t.is(statusReport[0].language, KnownLanguage.csharp);
  t.is(statusReport[0].hit_kind, CacheHitKind.Exact);

  // Check that the restored key has been returned.
  const restoredKeys = result.restoredKeys;
  t.is(restoredKeys.length, 1);
  t.assert(
    restoredKeys[0].endsWith(mockHash),
    "Expected restored key to end with hash returned by `hashFiles`",
  );

  // `restoreCache` should have been called exactly once.
  t.assert(restoreCacheStub.calledOnce);
});

test("downloadDependencyCaches - restores caches with feature keys if features are enabled for partial matches", async (t) => {
  process.env["RUNNER_OS"] = "Linux";

  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);
  const features = createFeatures([Feature.CsharpNewCacheKey]);

  // We expect two calls to `hashFiles`: the first by the call to `cacheKey` below,
  // and the second by `downloadDependencyCaches`. We use the result of the first
  // call as part of the cache key that identifies a mock, existing cache. The result
  // of the second call is for the primary restore key, which we don't want to match
  // the first key so that we can test the restore keys logic.
  const restoredHash = "abcdef";
  const hashFilesStub = sinon.stub(glob, "hashFiles");
  hashFilesStub.onFirstCall().resolves(restoredHash);
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

  const result = await downloadDependencyCaches(
    codeql,
    features,
    [KnownLanguage.csharp],
    logger,
  );

  // Check that the status report for telemetry indicates that one cache was restored with a partial match.
  const statusReport = result.statusReport;
  t.is(statusReport.length, 1);
  t.is(statusReport[0].language, KnownLanguage.csharp);
  t.is(statusReport[0].hit_kind, CacheHitKind.Partial);

  // Check that the restored key has been returned.
  const restoredKeys = result.restoredKeys;
  t.is(restoredKeys.length, 1);
  t.assert(
    restoredKeys[0].endsWith(restoredHash),
    "Expected restored key to end with hash returned by `hashFiles`",
  );

  t.assert(restoreCacheStub.calledOnce);
});

test("uploadDependencyCaches - skips upload for a language with no cache config", async (t) => {
  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);
  const features = createFeatures([]);
  const config = createTestConfig({
    languages: [KnownLanguage.actions],
  });

  const result = await uploadDependencyCaches(codeql, features, config, logger);
  t.is(result.length, 0);
  checkExpectedLogMessages(t, messages, [
    "Skipping upload of dependency cache for actions",
  ]);
});

test("uploadDependencyCaches - skips upload if no files for the hash exist", async (t) => {
  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);
  const features = createFeatures([]);
  const config = createTestConfig({
    languages: [KnownLanguage.go],
  });

  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");
  makePatternCheckStub.resolves(undefined);

  const result = await uploadDependencyCaches(codeql, features, config, logger);
  t.is(result.length, 1);
  t.is(result[0].language, KnownLanguage.go);
  t.is(result[0].result, CacheStoreResult.NoHash);
});

test("uploadDependencyCaches - skips upload if we know the cache already exists", async (t) => {
  process.env["RUNNER_OS"] = "Linux";

  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);
  const features = createFeatures([]);

  const mockHash = "abcdef";
  sinon.stub(glob, "hashFiles").resolves(mockHash);

  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");
  makePatternCheckStub
    .withArgs(CSHARP_BASE_PATTERNS)
    .resolves(CSHARP_BASE_PATTERNS);

  const primaryCacheKey = await cacheKey(
    codeql,
    features,
    KnownLanguage.csharp,
    CSHARP_BASE_PATTERNS,
  );

  const config = createTestConfig({
    languages: [KnownLanguage.csharp],
    dependencyCachingRestoredKeys: [primaryCacheKey],
  });

  const result = await uploadDependencyCaches(codeql, features, config, logger);
  t.is(result.length, 1);
  t.is(result[0].language, KnownLanguage.csharp);
  t.is(result[0].result, CacheStoreResult.Duplicate);
});

test("uploadDependencyCaches - skips upload if cache size is 0", async (t) => {
  process.env["RUNNER_OS"] = "Linux";

  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);
  const features = createFeatures([]);

  const mockHash = "abcdef";
  sinon.stub(glob, "hashFiles").resolves(mockHash);

  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");
  makePatternCheckStub
    .withArgs(CSHARP_BASE_PATTERNS)
    .resolves(CSHARP_BASE_PATTERNS);

  sinon.stub(cachingUtils, "getTotalCacheSize").resolves(0);

  const config = createTestConfig({
    languages: [KnownLanguage.csharp],
  });

  const result = await uploadDependencyCaches(codeql, features, config, logger);
  t.is(result.length, 1);
  t.is(result[0].language, KnownLanguage.csharp);
  t.is(result[0].result, CacheStoreResult.Empty);

  checkExpectedLogMessages(t, messages, [
    "Skipping upload of dependency cache",
  ]);
});

test("uploadDependencyCaches - uploads caches when all requirements are met", async (t) => {
  process.env["RUNNER_OS"] = "Linux";

  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);
  const features = createFeatures([]);

  const mockHash = "abcdef";
  sinon.stub(glob, "hashFiles").resolves(mockHash);

  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");
  makePatternCheckStub
    .withArgs(CSHARP_BASE_PATTERNS)
    .resolves(CSHARP_BASE_PATTERNS);

  sinon.stub(cachingUtils, "getTotalCacheSize").resolves(1024);
  sinon.stub(actionsCache, "saveCache").resolves();

  const config = createTestConfig({
    languages: [KnownLanguage.csharp],
  });

  const result = await uploadDependencyCaches(codeql, features, config, logger);
  t.is(result.length, 1);
  t.is(result[0].language, KnownLanguage.csharp);
  t.is(result[0].result, CacheStoreResult.Stored);
  t.is(result[0].upload_size_bytes, 1024);

  checkExpectedLogMessages(t, messages, ["Uploading cache of size"]);
});

test("uploadDependencyCaches - catches `ReserveCacheError` exceptions", async (t) => {
  process.env["RUNNER_OS"] = "Linux";

  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);
  const features = createFeatures([]);

  const mockHash = "abcdef";
  sinon.stub(glob, "hashFiles").resolves(mockHash);

  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");
  makePatternCheckStub
    .withArgs(CSHARP_BASE_PATTERNS)
    .resolves(CSHARP_BASE_PATTERNS);

  sinon.stub(cachingUtils, "getTotalCacheSize").resolves(1024);
  sinon
    .stub(actionsCache, "saveCache")
    .throws(new actionsCache.ReserveCacheError("Already in use"));

  const config = createTestConfig({
    languages: [KnownLanguage.csharp],
  });

  await t.notThrowsAsync(async () => {
    const result = await uploadDependencyCaches(
      codeql,
      features,
      config,
      logger,
    );
    t.is(result.length, 1);
    t.is(result[0].language, KnownLanguage.csharp);
    t.is(result[0].result, CacheStoreResult.Duplicate);

    checkExpectedLogMessages(t, messages, ["Not uploading cache for"]);
  });
});

test("uploadDependencyCaches - throws other exceptions", async (t) => {
  process.env["RUNNER_OS"] = "Linux";

  const codeql = createStubCodeQL({});
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);
  const features = createFeatures([]);

  const mockHash = "abcdef";
  sinon.stub(glob, "hashFiles").resolves(mockHash);

  const makePatternCheckStub = sinon.stub(internal, "makePatternCheck");
  makePatternCheckStub
    .withArgs(CSHARP_BASE_PATTERNS)
    .resolves(CSHARP_BASE_PATTERNS);

  sinon.stub(cachingUtils, "getTotalCacheSize").resolves(1024);
  sinon.stub(actionsCache, "saveCache").throws();

  const config = createTestConfig({
    languages: [KnownLanguage.csharp],
  });

  await t.throwsAsync(async () => {
    await uploadDependencyCaches(codeql, features, config, logger);
  });
});

test("getFeaturePrefix - returns empty string if no features are enabled", async (t) => {
  const codeql = createStubCodeQL({});
  const features = createFeatures([]);

  for (const knownLanguage of Object.values(KnownLanguage)) {
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
