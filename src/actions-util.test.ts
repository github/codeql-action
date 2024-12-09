import test from "ava";

import { computeAutomationID } from "./api-client";
import { EnvVar } from "./environment";
import { setupTests } from "./testing-utils";
import { initializeEnvironment } from "./util";

setupTests(test);

test("computeAutomationID()", async (t) => {
  let actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"language": "javascript", "os": "linux"}',
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/",
  );

  // check the environment sorting
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"os": "linux", "language": "javascript"}',
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/",
  );

  // check that an empty environment produces the right results
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    "{}",
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/",
  );

  // check non string environment values
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"number": 1, "object": {"language": "javascript"}}',
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/number:/object:/",
  );

  // check undefined environment
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    undefined,
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/",
  );
});

test("initializeEnvironment", (t) => {
  initializeEnvironment("1.2.3");
  t.deepEqual(process.env[EnvVar.VERSION], "1.2.3");
});
