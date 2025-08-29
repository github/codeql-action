import test from "ava";

import {
  AnalysisKind,
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
