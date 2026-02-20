import path from "path";

import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import {
  AnalysisKind,
  CodeScanning,
  compatibilityMatrix,
  RiskAssessment,
  getAnalysisConfig,
  getAnalysisKinds,
  parseAnalysisKinds,
  supportedAnalysisKinds,
} from "./analyses";
import { EnvVar } from "./environment";
import { getRunnerLogger } from "./logging";
import { setupTests } from "./testing-utils";
import { AssessmentPayload } from "./upload-lib/types";
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

// Test the compatibility matrix by looping through all analysis kinds.
const analysisKinds = Object.values(AnalysisKind);
for (let i = 0; i < analysisKinds.length; i++) {
  const analysisKind = analysisKinds[i];

  for (let j = i + 1; j < analysisKinds.length; j++) {
    const otherAnalysis = analysisKinds[j];

    if (analysisKind === otherAnalysis) continue;
    if (compatibilityMatrix[analysisKind].has(otherAnalysis)) {
      test(`getAnalysisKinds - allows ${analysisKind} with ${otherAnalysis}`, async (t) => {
        const requiredInputStub = sinon.stub(actionsUtil, "getRequiredInput");
        requiredInputStub
          .withArgs("analysis-kinds")
          .returns([analysisKind, otherAnalysis].join(","));
        const result = await getAnalysisKinds(getRunnerLogger(true), true);
        t.is(result.length, 2);
      });
    } else {
      test(`getAnalysisKinds - throws if ${analysisKind} is enabled with ${otherAnalysis}`, async (t) => {
        const requiredInputStub = sinon.stub(actionsUtil, "getRequiredInput");
        requiredInputStub
          .withArgs("analysis-kinds")
          .returns([analysisKind, otherAnalysis].join(","));
        await t.throwsAsync(getAnalysisKinds(getRunnerLogger(true), true), {
          instanceOf: ConfigurationError,
          message: `${analysisKind} and ${otherAnalysis} cannot be enabled at the same time`,
        });
      });
    }
  }
}

test("Code Scanning configuration does not accept other SARIF extensions", (t) => {
  for (const analysisKind of supportedAnalysisKinds) {
    if (analysisKind === AnalysisKind.CodeScanning) continue;

    const analysis = getAnalysisConfig(analysisKind);
    const sarifPath = path.join("path", "to", `file${analysis.sarifExtension}`);

    // The Code Scanning configuration's `sarifPredicate` should not accept a path which
    // ends in a different configuration's `sarifExtension`.
    t.false(CodeScanning.sarifPredicate(sarifPath));
  }
});

test("Risk Assessment configuration transforms SARIF upload payload", (t) => {
  process.env[EnvVar.RISK_ASSESSMENT_ID] = "1";
  const payload = RiskAssessment.transformPayload({
    commit_oid: "abc",
    sarif: "sarif",
    ref: "ref",
    workflow_run_attempt: 1,
    workflow_run_id: 1,
    checkout_uri: "uri",
    tool_names: [],
  }) as AssessmentPayload;

  const expected: AssessmentPayload = { sarif: "sarif", assessment_id: 1 };
  t.deepEqual(expected, payload);
});

test("Risk Assessment configuration throws for negative assessment IDs", (t) => {
  process.env[EnvVar.RISK_ASSESSMENT_ID] = "-1";
  t.throws(
    () =>
      RiskAssessment.transformPayload({
        commit_oid: "abc",
        sarif: "sarif",
        ref: "ref",
        workflow_run_attempt: 1,
        workflow_run_id: 1,
        checkout_uri: "uri",
        tool_names: [],
      }),
    {
      instanceOf: Error,
      message: (msg) =>
        msg.startsWith(`${EnvVar.RISK_ASSESSMENT_ID} must not be negative: `),
    },
  );
});

test("Risk Assessment configuration throws for invalid IDs", (t) => {
  process.env[EnvVar.RISK_ASSESSMENT_ID] = "foo";
  t.throws(
    () =>
      RiskAssessment.transformPayload({
        commit_oid: "abc",
        sarif: "sarif",
        ref: "ref",
        workflow_run_attempt: 1,
        workflow_run_id: 1,
        checkout_uri: "uri",
        tool_names: [],
      }),
    {
      instanceOf: Error,
      message: (msg) =>
        msg.startsWith(`${EnvVar.RISK_ASSESSMENT_ID} must not be NaN: `),
    },
  );
});
