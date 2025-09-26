import test from "ava";

import {
  AnalysisKind,
  isOtherAnalysisSarif,
  parseAnalysisKinds,
  supportedAnalysisKinds,
} from "./analyses";
import { ConfigurationError } from "./util";

test("All known analysis kinds can be parsed successfully", async (t) => {
  for (const analysisKind of supportedAnalysisKinds) {
    t.deepEqual(await parseAnalysisKinds(analysisKind), [analysisKind]);
  }
});

test("Parsing analysis kinds returns unique results", async (t) => {
  const analysisKinds = await parseAnalysisKinds(
    "code-scanning,code-quality,code-scanning",
  );
  t.deepEqual(analysisKinds, [
    AnalysisKind.CodeScanning,
    AnalysisKind.CodeQuality,
  ]);
});

test("Parsing an unknown analysis kind fails with a configuration error", async (t) => {
  await t.throwsAsync(parseAnalysisKinds("code-scanning,foo"), {
    instanceOf: ConfigurationError,
  });
});

test("Parsing analysis kinds requires at least one analysis kind", async (t) => {
  await t.throwsAsync(parseAnalysisKinds(","), {
    instanceOf: ConfigurationError,
  });
});

test("isOtherAnalysisSarif", async (t) => {
  function expectTrue(analysisKind: AnalysisKind, filepath: string) {
    t.assert(
      isOtherAnalysisSarif(analysisKind, filepath),
      `Expected ${filepath} to be for another analysis kind, but it matched ${analysisKind}.`,
    );
  }
  function expectFalse(analysisKind: AnalysisKind, filepath: string) {
    t.assert(
      !isOtherAnalysisSarif(analysisKind, filepath),
      `Expected ${filepath} to be for ${analysisKind}, but it matched some other analysis kind.`,
    );
  }
  expectTrue(AnalysisKind.CodeQuality, "test.sarif");
  expectFalse(AnalysisKind.CodeQuality, "test.quality.sarif");
  expectTrue(AnalysisKind.CodeScanning, "test.quality.sarif");
  expectFalse(AnalysisKind.CodeScanning, "test.sarif");
  expectFalse(AnalysisKind.CodeScanning, "test.json");
});
