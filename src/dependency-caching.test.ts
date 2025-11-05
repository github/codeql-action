import test from "ava";
// import * as sinon from "sinon";

import { cacheKeyHashLength } from "./caching-utils";
import { createStubCodeQL } from "./codeql";
import { getFeaturePrefix } from "./dependency-caching";
import { Feature } from "./feature-flags";
import { KnownLanguage } from "./languages";
import { setupTests, createFeatures } from "./testing-utils";

setupTests(test);

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
