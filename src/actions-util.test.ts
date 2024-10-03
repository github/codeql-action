import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { computeAutomationID } from "./api-client";
import { EnvVar } from "./environment";
import { setupActionsVars, setupTests } from "./testing-utils";
import { initializeEnvironment, withTmpDir } from "./util";

setupTests(test);

test("getRef() throws on the empty string", async (t) => {
  process.env["GITHUB_REF"] = "";
  await t.throwsAsync(actionsUtil.getRef);
});

test("getRef() returns merge PR ref if GITHUB_SHA still checked out", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    const expectedRef = "refs/pull/1/merge";
    const currentSha = "a".repeat(40);
    process.env["GITHUB_REF"] = expectedRef;
    process.env["GITHUB_SHA"] = currentSha;

    const callback = sinon.stub(actionsUtil, "getCommitOid");
    callback.withArgs("HEAD").resolves(currentSha);

    const actualRef = await actionsUtil.getRef();
    t.deepEqual(actualRef, expectedRef);
    callback.restore();
  });
});

test("getRef() returns merge PR ref if GITHUB_REF still checked out but sha has changed (actions checkout@v1)", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    const expectedRef = "refs/pull/1/merge";
    process.env["GITHUB_REF"] = expectedRef;
    process.env["GITHUB_SHA"] = "b".repeat(40);
    const sha = "a".repeat(40);

    const callback = sinon.stub(actionsUtil, "getCommitOid");
    callback.withArgs("refs/remotes/pull/1/merge").resolves(sha);
    callback.withArgs("HEAD").resolves(sha);

    const actualRef = await actionsUtil.getRef();
    t.deepEqual(actualRef, expectedRef);
    callback.restore();
  });
});

test("getRef() returns head PR ref if GITHUB_REF no longer checked out", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    process.env["GITHUB_REF"] = "refs/pull/1/merge";
    process.env["GITHUB_SHA"] = "a".repeat(40);

    const callback = sinon.stub(actionsUtil, "getCommitOid");
    callback.withArgs(tmpDir, "refs/pull/1/merge").resolves("a".repeat(40));
    callback.withArgs(tmpDir, "HEAD").resolves("b".repeat(40));

    const actualRef = await actionsUtil.getRef();
    t.deepEqual(actualRef, "refs/pull/1/head");
    callback.restore();
  });
});

test("getRef() returns ref provided as an input and ignores current HEAD", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    const getAdditionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
    getAdditionalInputStub.withArgs("ref").resolves("refs/pull/2/merge");
    getAdditionalInputStub.withArgs("sha").resolves("b".repeat(40));

    // These values are be ignored
    process.env["GITHUB_REF"] = "refs/pull/1/merge";
    process.env["GITHUB_SHA"] = "a".repeat(40);

    const callback = sinon.stub(actionsUtil, "getCommitOid");
    callback.withArgs("refs/pull/1/merge").resolves("b".repeat(40));
    callback.withArgs("HEAD").resolves("b".repeat(40));

    const actualRef = await actionsUtil.getRef();
    t.deepEqual(actualRef, "refs/pull/2/merge");
    callback.restore();
    getAdditionalInputStub.restore();
  });
});

test("getRef() returns CODE_SCANNING_REF as a fallback for GITHUB_REF", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    const expectedRef = "refs/pull/1/HEAD";
    const currentSha = "a".repeat(40);
    process.env["CODE_SCANNING_REF"] = expectedRef;
    process.env["GITHUB_REF"] = "";
    process.env["GITHUB_SHA"] = currentSha;

    const actualRef = await actionsUtil.getRef();
    t.deepEqual(actualRef, expectedRef);
  });
});

test("getRef() returns GITHUB_REF over CODE_SCANNING_REF if both are provided", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    const expectedRef = "refs/pull/1/merge";
    const currentSha = "a".repeat(40);
    process.env["CODE_SCANNING_REF"] = "refs/pull/1/HEAD";
    process.env["GITHUB_REF"] = expectedRef;
    process.env["GITHUB_SHA"] = currentSha;

    const actualRef = await actionsUtil.getRef();
    t.deepEqual(actualRef, expectedRef);
  });
});

test("getRef() throws an error if only `ref` is provided as an input", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    const getAdditionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
    getAdditionalInputStub.withArgs("ref").resolves("refs/pull/1/merge");

    await t.throwsAsync(
      async () => {
        await actionsUtil.getRef();
      },
      {
        instanceOf: Error,
        message:
          "Both 'ref' and 'sha' are required if one of them is provided.",
      },
    );
    getAdditionalInputStub.restore();
  });
});

test("getRef() throws an error if only `sha` is provided as an input", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    process.env["GITHUB_WORKSPACE"] = "/tmp";
    const getAdditionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
    getAdditionalInputStub.withArgs("sha").resolves("a".repeat(40));

    await t.throwsAsync(
      async () => {
        await actionsUtil.getRef();
      },
      {
        instanceOf: Error,
        message:
          "Both 'ref' and 'sha' are required if one of them is provided.",
      },
    );
    getAdditionalInputStub.restore();
  });
});

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

test("isAnalyzingDefaultBranch()", async (t) => {
  process.env["GITHUB_EVENT_NAME"] = "push";
  process.env["CODE_SCANNING_IS_ANALYZING_DEFAULT_BRANCH"] = "true";
  t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), true);
  process.env["CODE_SCANNING_IS_ANALYZING_DEFAULT_BRANCH"] = "false";

  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const envFile = path.join(tmpDir, "event.json");
    fs.writeFileSync(
      envFile,
      JSON.stringify({
        repository: {
          default_branch: "main",
        },
      }),
    );
    process.env["GITHUB_EVENT_PATH"] = envFile;

    process.env["GITHUB_REF"] = "main";
    process.env["GITHUB_SHA"] = "1234";
    t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), true);

    process.env["GITHUB_REF"] = "refs/heads/main";
    t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), true);

    process.env["GITHUB_REF"] = "feature";
    t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), false);

    fs.writeFileSync(
      envFile,
      JSON.stringify({
        schedule: "0 0 * * *",
      }),
    );
    process.env["GITHUB_EVENT_NAME"] = "schedule";
    process.env["GITHUB_REF"] = "refs/heads/main";
    t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), true);

    const getAdditionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
    getAdditionalInputStub
      .withArgs("ref")
      .resolves("refs/heads/something-else");
    getAdditionalInputStub
      .withArgs("sha")
      .resolves("0000000000000000000000000000000000000000");
    process.env["GITHUB_EVENT_NAME"] = "schedule";
    process.env["GITHUB_REF"] = "refs/heads/main";
    t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), false);
    getAdditionalInputStub.restore();
  });
});

test("determineBaseBranchHeadCommitOid non-pullrequest", async (t) => {
  const infoStub = sinon.stub(core, "info");

  process.env["GITHUB_EVENT_NAME"] = "hucairz";
  process.env["GITHUB_SHA"] = "100912429fab4cb230e66ffb11e738ac5194e73a";
  const result = await actionsUtil.determineBaseBranchHeadCommitOid(__dirname);
  t.deepEqual(result, undefined);
  t.deepEqual(0, infoStub.callCount);

  infoStub.restore();
});

test("determineBaseBranchHeadCommitOid not git repository", async (t) => {
  const infoStub = sinon.stub(core, "info");

  process.env["GITHUB_EVENT_NAME"] = "pull_request";
  process.env["GITHUB_SHA"] = "100912429fab4cb230e66ffb11e738ac5194e73a";

  await withTmpDir(async (tmpDir) => {
    await actionsUtil.determineBaseBranchHeadCommitOid(tmpDir);
  });

  t.deepEqual(1, infoStub.callCount);
  t.deepEqual(
    infoStub.firstCall.args[0],
    "git call failed. Will calculate the base branch SHA on the server. Error: " +
      "The checkout path provided to the action does not appear to be a git repository.",
  );

  infoStub.restore();
});

test("determineBaseBranchHeadCommitOid other error", async (t) => {
  const infoStub = sinon.stub(core, "info");

  process.env["GITHUB_EVENT_NAME"] = "pull_request";
  process.env["GITHUB_SHA"] = "100912429fab4cb230e66ffb11e738ac5194e73a";
  const result = await actionsUtil.determineBaseBranchHeadCommitOid(
    path.join(__dirname, "../../i-dont-exist"),
  );
  t.deepEqual(result, undefined);
  t.deepEqual(1, infoStub.callCount);
  t.assert(
    infoStub.firstCall.args[0].startsWith(
      "git call failed. Will calculate the base branch SHA on the server. Error: ",
    ),
  );
  t.assert(
    !infoStub.firstCall.args[0].endsWith(
      "The checkout path provided to the action does not appear to be a git repository.",
    ),
  );

  infoStub.restore();
});
