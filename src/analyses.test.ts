import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import {
  AnalysisKind,
  getAnalysisKinds,
  parseAnalysisKinds,
  supportedAnalysisKinds,
} from "./analyses";
import { getRunnerLogger } from "./logging";
import { setupTests } from "./testing-utils";
import { ConfigurationError } from "./util";

setupTests(test);

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

test("getAnalysisKinds - returns expected analysis kinds for `analysis-kinds` input", async (t) => {
  const requiredInputStub = sinon.stub(actionsUtil, "getRequiredInput");
  requiredInputStub
    .withArgs("analysis-kinds")
    .returns("code-scanning,code-quality");
  const result = await getAnalysisKinds(getRunnerLogger(true), true);
  t.assert(result.includes(AnalysisKind.CodeScanning));
  t.assert(result.includes(AnalysisKind.CodeQuality));
});

test("getAnalysisKinds - includes `code-quality` when deprecated `quality-queries` input is used", async (t) => {
  const requiredInputStub = sinon.stub(actionsUtil, "getRequiredInput");
  requiredInputStub.withArgs("analysis-kinds").returns("code-scanning");
  const optionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
  optionalInputStub.withArgs("quality-queries").returns("code-quality");
  const result = await getAnalysisKinds(getRunnerLogger(true), true);
  t.assert(result.includes(AnalysisKind.CodeScanning));
  t.assert(result.includes(AnalysisKind.CodeQuality));
});

test("getAnalysisKinds - throws if `analysis-kinds` input is invalid", async (t) => {
  const requiredInputStub = sinon.stub(actionsUtil, "getRequiredInput");
  requiredInputStub.withArgs("analysis-kinds").returns("no-such-thing");
  await t.throwsAsync(getAnalysisKinds(getRunnerLogger(true), true));
});
