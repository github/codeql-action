import test from "ava";
import sinon from "sinon";

import * as actionsutil from "./actions-util";
import { setupTests } from "./testing-utils";

setupTests(test);

test("getRef() throws on the empty string", async (t) => {
  process.env["GITHUB_REF"] = "";
  await t.throwsAsync(actionsutil.getRef);
});

test("getRef() returns merge PR ref if GITHUB_SHA still checked out", async (t) => {
  const expectedRef = "refs/pull/1/merge";
  const currentSha = "a".repeat(40);
  process.env["GITHUB_REF"] = expectedRef;
  process.env["GITHUB_SHA"] = currentSha;

  sinon.stub(actionsutil, "getCommitOid").resolves(currentSha);

  const actualRef = await actionsutil.getRef();
  t.deepEqual(actualRef, expectedRef);
});

test("getRef() returns head PR ref if GITHUB_SHA not currently checked out", async (t) => {
  process.env["GITHUB_REF"] = "refs/pull/1/merge";
  process.env["GITHUB_SHA"] = "a".repeat(40);

  sinon.stub(actionsutil, "getCommitOid").resolves("b".repeat(40));

  const actualRef = await actionsutil.getRef();
  t.deepEqual(actualRef, "refs/pull/1/head");
});

test("getAnalysisKey() when a local run", async (t) => {
  process.env.CODEQL_LOCAL_RUN = "true";
  process.env.CODEQL_ACTION_ANALYSIS_KEY = "";
  process.env.GITHUB_JOB = "";

  actionsutil.prepareLocalRunEnvironment();

  const actualAnalysisKey = await actionsutil.getAnalysisKey();

  t.deepEqual(actualAnalysisKey, "LOCAL-RUN:UNKNOWN-JOB");
});

test("prepareEnvironment() when a local run", (t) => {
  process.env.CODEQL_LOCAL_RUN = "false";
  process.env.GITHUB_JOB = "YYY";
  process.env.CODEQL_ACTION_ANALYSIS_KEY = "TEST";

  actionsutil.prepareLocalRunEnvironment();

  // unchanged
  t.deepEqual(process.env.GITHUB_JOB, "YYY");
  t.deepEqual(process.env.CODEQL_ACTION_ANALYSIS_KEY, "TEST");

  process.env.CODEQL_LOCAL_RUN = "true";

  actionsutil.prepareLocalRunEnvironment();

  // unchanged
  t.deepEqual(process.env.GITHUB_JOB, "YYY");
  t.deepEqual(process.env.CODEQL_ACTION_ANALYSIS_KEY, "TEST");

  process.env.CODEQL_ACTION_ANALYSIS_KEY = "";

  actionsutil.prepareLocalRunEnvironment();

  // updated
  t.deepEqual(process.env.GITHUB_JOB, "YYY");
  t.deepEqual(process.env.CODEQL_ACTION_ANALYSIS_KEY, "LOCAL-RUN:YYY");

  process.env.GITHUB_JOB = "";
  process.env.CODEQL_ACTION_ANALYSIS_KEY = "";

  actionsutil.prepareLocalRunEnvironment();

  // updated
  t.deepEqual(process.env.GITHUB_JOB, "UNKNOWN-JOB");
  t.deepEqual(process.env.CODEQL_ACTION_ANALYSIS_KEY, "LOCAL-RUN:UNKNOWN-JOB");
});
