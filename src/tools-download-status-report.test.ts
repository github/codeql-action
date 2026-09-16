import test from "ava";

import { BuiltInLanguage } from "./languages";
import { createInitToolsDownloadFields } from "./status-report";

test("createInitToolsDownloadFields omits absent download data", (t) => {
  t.deepEqual(createInitToolsDownloadFields(undefined, undefined), {});
});

test("createInitToolsDownloadFields reports feature flags without a download", (t) => {
  t.deepEqual(createInitToolsDownloadFields(undefined, false), {
    tools_feature_flags_valid: false,
  });
});

test("createInitToolsDownloadFields reports only the total for a streaming download", (t) => {
  t.deepEqual(
    createInitToolsDownloadFields({ totalDurationMs: 300 }, undefined),
    { tools_total_duration_ms: 300 },
  );
});

test("createInitToolsDownloadFields preserves per-language metadata", (t) => {
  t.deepEqual(
    createInitToolsDownloadFields(
      { totalDurationMs: 300, bundleLanguage: BuiltInLanguage.java },
      true,
    ),
    {
      tools_total_duration_ms: 300,
      tools_bundle_language: BuiltInLanguage.java,
      tools_feature_flags_valid: true,
    },
  );
});

test("createInitToolsDownloadFields preserves fallback and per-attempt timings", (t) => {
  t.deepEqual(
    createInitToolsDownloadFields(
      {
        downloadDurationMs: 200,
        extractionDurationMs: 100,
        totalDurationMs: 1000,
        perLanguageBundleFallback: true,
      },
      undefined,
    ),
    {
      tools_download_duration_ms: 200,
      tools_extraction_duration_ms: 100,
      tools_total_duration_ms: 1000,
      tools_per_language_bundle_fallback: true,
    },
  );
});

test("createInitToolsDownloadFields preserves zero durations and false flags", (t) => {
  t.deepEqual(
    createInitToolsDownloadFields(
      {
        downloadDurationMs: 0,
        extractionDurationMs: 0,
        totalDurationMs: 0,
        perLanguageBundleFallback: false,
      },
      false,
    ),
    {
      tools_download_duration_ms: 0,
      tools_extraction_duration_ms: 0,
      tools_total_duration_ms: 0,
      tools_per_language_bundle_fallback: false,
      tools_feature_flags_valid: false,
    },
  );
});
