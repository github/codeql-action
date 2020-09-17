import test from "ava";

import { getRef, prepareLocalRunEnvironment } from "./actions-util";
import { setupTests } from "./testing-utils";

setupTests(test);

test("getRef() throws on the empty string", (t) => {
  process.env["GITHUB_REF"] = "";
  t.throws(getRef);
});

test("prepareEnvironment() when a local run", (t) => {
  const origLocalRun = process.env.CODEQL_LOCAL_RUN;

  process.env.CODEQL_LOCAL_RUN = "false";
  process.env.GITHUB_JOB = "YYY";

  prepareLocalRunEnvironment();

  // unchanged
  t.deepEqual(process.env.GITHUB_JOB, "YYY");

  process.env.CODEQL_LOCAL_RUN = "true";

  prepareLocalRunEnvironment();

  // unchanged
  t.deepEqual(process.env.GITHUB_JOB, "YYY");

  process.env.GITHUB_JOB = "";

  prepareLocalRunEnvironment();

  // updated
  t.deepEqual(process.env.GITHUB_JOB, "UNKNOWN-JOB");

  process.env.CODEQL_LOCAL_RUN = origLocalRun;
});
