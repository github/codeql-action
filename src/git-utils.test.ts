import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as gitUtils from "./git-utils";
import {
  getRecordingLogger,
  LoggedMessage,
  setupActionsVars,
  setupTests,
} from "./testing-utils";
import { withTmpDir } from "./util";

setupTests(test);

test("getRef() throws on the empty string", async (t) => {
  process.env["GITHUB_REF"] = "";
  await t.throwsAsync(gitUtils.getRef);
});

test("getRef() returns merge PR ref if GITHUB_SHA still checked out", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    const expectedRef = "refs/pull/1/merge";
    const currentSha = "a".repeat(40);
    process.env["GITHUB_REF"] = expectedRef;
    process.env["GITHUB_SHA"] = currentSha;

    const callback = sinon.stub(gitUtils, "getCommitOid");
    callback.withArgs("HEAD").resolves(currentSha);

    const actualRef = await gitUtils.getRef();
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

    const callback = sinon.stub(gitUtils, "getCommitOid");
    callback.withArgs("refs/remotes/pull/1/merge").resolves(sha);
    callback.withArgs("HEAD").resolves(sha);

    const actualRef = await gitUtils.getRef();
    t.deepEqual(actualRef, expectedRef);
    callback.restore();
  });
});

test("getRef() returns head PR ref if GITHUB_REF no longer checked out", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    process.env["GITHUB_REF"] = "refs/pull/1/merge";
    process.env["GITHUB_SHA"] = "a".repeat(40);

    const callback = sinon.stub(gitUtils, "getCommitOid");
    callback.withArgs(tmpDir, "refs/pull/1/merge").resolves("a".repeat(40));
    callback.withArgs(tmpDir, "HEAD").resolves("b".repeat(40));

    const actualRef = await gitUtils.getRef();
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

    const callback = sinon.stub(gitUtils, "getCommitOid");
    callback.withArgs("refs/pull/1/merge").resolves("b".repeat(40));
    callback.withArgs("HEAD").resolves("b".repeat(40));

    const actualRef = await gitUtils.getRef();
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

    const actualRef = await gitUtils.getRef();
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

    const actualRef = await gitUtils.getRef();
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
        await gitUtils.getRef();
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
        await gitUtils.getRef();
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

test("isAnalyzingDefaultBranch()", async (t) => {
  process.env["GITHUB_EVENT_NAME"] = "push";
  process.env["CODE_SCANNING_IS_ANALYZING_DEFAULT_BRANCH"] = "true";
  t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), true);
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
    t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), true);

    process.env["GITHUB_REF"] = "refs/heads/main";
    t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), true);

    process.env["GITHUB_REF"] = "feature";
    t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), false);

    fs.writeFileSync(
      envFile,
      JSON.stringify({
        schedule: "0 0 * * *",
      }),
    );
    process.env["GITHUB_EVENT_NAME"] = "schedule";
    process.env["GITHUB_REF"] = "refs/heads/main";
    t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), true);

    const getAdditionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
    getAdditionalInputStub
      .withArgs("ref")
      .resolves("refs/heads/something-else");
    getAdditionalInputStub
      .withArgs("sha")
      .resolves("0000000000000000000000000000000000000000");
    process.env["GITHUB_EVENT_NAME"] = "schedule";
    process.env["GITHUB_REF"] = "refs/heads/main";
    t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), false);
    getAdditionalInputStub.restore();
  });
});

test("determineBaseBranchHeadCommitOid non-pullrequest", async (t) => {
  const infoStub = sinon.stub(core, "info");

  process.env["GITHUB_EVENT_NAME"] = "hucairz";
  process.env["GITHUB_SHA"] = "100912429fab4cb230e66ffb11e738ac5194e73a";
  const result = await gitUtils.determineBaseBranchHeadCommitOid(__dirname);
  t.deepEqual(result, undefined);
  t.deepEqual(0, infoStub.callCount);

  infoStub.restore();
});

test("determineBaseBranchHeadCommitOid not git repository", async (t) => {
  const infoStub = sinon.stub(core, "info");

  process.env["GITHUB_EVENT_NAME"] = "pull_request";
  process.env["GITHUB_SHA"] = "100912429fab4cb230e66ffb11e738ac5194e73a";

  await withTmpDir(async (tmpDir) => {
    await gitUtils.determineBaseBranchHeadCommitOid(tmpDir);
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
  const result = await gitUtils.determineBaseBranchHeadCommitOid(
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

test("decodeGitFilePath unquoted strings", async (t) => {
  t.deepEqual(gitUtils.decodeGitFilePath("foo"), "foo");
  t.deepEqual(gitUtils.decodeGitFilePath("foo bar"), "foo bar");
  t.deepEqual(gitUtils.decodeGitFilePath("foo\\\\bar"), "foo\\\\bar");
  t.deepEqual(gitUtils.decodeGitFilePath('foo\\"bar'), 'foo\\"bar');
  t.deepEqual(gitUtils.decodeGitFilePath("foo\\001bar"), "foo\\001bar");
  t.deepEqual(gitUtils.decodeGitFilePath("foo\\abar"), "foo\\abar");
  t.deepEqual(gitUtils.decodeGitFilePath("foo\\bbar"), "foo\\bbar");
  t.deepEqual(gitUtils.decodeGitFilePath("foo\\fbar"), "foo\\fbar");
  t.deepEqual(gitUtils.decodeGitFilePath("foo\\nbar"), "foo\\nbar");
  t.deepEqual(gitUtils.decodeGitFilePath("foo\\rbar"), "foo\\rbar");
  t.deepEqual(gitUtils.decodeGitFilePath("foo\\tbar"), "foo\\tbar");
  t.deepEqual(gitUtils.decodeGitFilePath("foo\\vbar"), "foo\\vbar");
  t.deepEqual(
    gitUtils.decodeGitFilePath("\\a\\b\\f\\n\\r\\t\\v"),
    "\\a\\b\\f\\n\\r\\t\\v",
  );
});

test("decodeGitFilePath quoted strings", async (t) => {
  t.deepEqual(gitUtils.decodeGitFilePath('"foo"'), "foo");
  t.deepEqual(gitUtils.decodeGitFilePath('"foo bar"'), "foo bar");
  t.deepEqual(gitUtils.decodeGitFilePath('"foo\\\\bar"'), "foo\\bar");
  t.deepEqual(gitUtils.decodeGitFilePath('"foo\\"bar"'), 'foo"bar');
  t.deepEqual(gitUtils.decodeGitFilePath('"foo\\001bar"'), "foo\x01bar");
  t.deepEqual(gitUtils.decodeGitFilePath('"foo\\abar"'), "foo\x07bar");
  t.deepEqual(gitUtils.decodeGitFilePath('"foo\\bbar"'), "foo\bbar");
  t.deepEqual(gitUtils.decodeGitFilePath('"foo\\fbar"'), "foo\fbar");
  t.deepEqual(gitUtils.decodeGitFilePath('"foo\\nbar"'), "foo\nbar");
  t.deepEqual(gitUtils.decodeGitFilePath('"foo\\rbar"'), "foo\rbar");
  t.deepEqual(gitUtils.decodeGitFilePath('"foo\\tbar"'), "foo\tbar");
  t.deepEqual(gitUtils.decodeGitFilePath('"foo\\vbar"'), "foo\vbar");
  t.deepEqual(
    gitUtils.decodeGitFilePath('"\\a\\b\\f\\n\\r\\t\\v"'),
    "\x07\b\f\n\r\t\v",
  );
});

test("getFileOidsUnderPath returns correct file mapping", async (t) => {
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .resolves(
      "30d998ded095371488be3a729eb61d86ed721a18_lib/git-utils.js\n" +
        "d89514599a9a99f22b4085766d40af7b99974827_lib/git-utils.js.map\n" +
        "a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96_src/git-utils.ts",
    );

  try {
    const result = await gitUtils.getFileOidsUnderPath("/fake/path");

    t.deepEqual(result, {
      "lib/git-utils.js": "30d998ded095371488be3a729eb61d86ed721a18",
      "lib/git-utils.js.map": "d89514599a9a99f22b4085766d40af7b99974827",
      "src/git-utils.ts": "a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96",
    });

    t.deepEqual(runGitCommandStub.firstCall.args, [
      "/fake/path",
      ["ls-files", "--recurse-submodules", "--format=%(objectname)_%(path)"],
      "Cannot list Git OIDs of tracked files.",
    ]);
  } finally {
    runGitCommandStub.restore();
  }
});

test("getFileOidsUnderPath handles quoted paths", async (t) => {
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .resolves(
      "30d998ded095371488be3a729eb61d86ed721a18_lib/normal-file.js\n" +
        'd89514599a9a99f22b4085766d40af7b99974827_"lib/file with spaces.js"\n' +
        'a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96_"lib/file\\twith\\ttabs.js"',
    );

  try {
    const result = await gitUtils.getFileOidsUnderPath("/fake/path");

    t.deepEqual(result, {
      "lib/normal-file.js": "30d998ded095371488be3a729eb61d86ed721a18",
      "lib/file with spaces.js": "d89514599a9a99f22b4085766d40af7b99974827",
      "lib/file\twith\ttabs.js": "a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96",
    });
  } finally {
    runGitCommandStub.restore();
  }
});

test("getFileOidsUnderPath handles empty output", async (t) => {
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .resolves("");

  try {
    const result = await gitUtils.getFileOidsUnderPath("/fake/path");
    t.deepEqual(result, {});
  } finally {
    runGitCommandStub.restore();
  }
});

test("getFileOidsUnderPath throws on unexpected output format", async (t) => {
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .resolves(
      "30d998ded095371488be3a729eb61d86ed721a18_lib/git-utils.js\n" +
        "invalid-line-format\n" +
        "a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96_src/git-utils.ts",
    );

  try {
    await t.throwsAsync(
      async () => {
        await gitUtils.getFileOidsUnderPath("/fake/path");
      },
      {
        instanceOf: Error,
        message: 'Unexpected "git ls-files" output: invalid-line-format',
      },
    );
  } finally {
    runGitCommandStub.restore();
  }
});

test("getGitVersionOrThrow returns version for valid git output", async (t) => {
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .resolves("git version 2.40.0\n");

  try {
    const version = await gitUtils.getGitVersionOrThrow();
    t.is(version, "2.40.0");
  } finally {
    runGitCommandStub.restore();
  }
});

test("getGitVersionOrThrow throws for invalid git output", async (t) => {
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .resolves("invalid output");

  try {
    await t.throwsAsync(
      async () => {
        await gitUtils.getGitVersionOrThrow();
      },
      {
        instanceOf: Error,
        message: "Could not parse Git version from output: invalid output",
      },
    );
  } finally {
    runGitCommandStub.restore();
  }
});

test("getGitVersionOrThrow handles Windows-style git output", async (t) => {
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .resolves("git version 2.40.0.windows.1\n");

  try {
    const version = await gitUtils.getGitVersionOrThrow();
    // Should extract just the major.minor.patch portion
    t.is(version, "2.40.0");
  } finally {
    runGitCommandStub.restore();
  }
});

test("getGitVersionOrThrow throws when git command fails", async (t) => {
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .rejects(new Error("git not found"));

  try {
    await t.throwsAsync(
      async () => {
        await gitUtils.getGitVersionOrThrow();
      },
      {
        instanceOf: Error,
        message: "git not found",
      },
    );
  } finally {
    runGitCommandStub.restore();
  }
});

test("getGitVersion returns version and caches it", async (t) => {
  gitUtils.resetCachedGitVersion();
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .resolves("git version 2.40.0\n");

  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  try {
    // First call should fetch and cache
    const version1 = await gitUtils.getGitVersion(logger);
    t.is(version1, "2.40.0");
    t.is(runGitCommandStub.callCount, 1);

    // Second call should use cache
    const version2 = await gitUtils.getGitVersion(logger);
    t.is(version2, "2.40.0");
    t.is(runGitCommandStub.callCount, 1); // Should still be 1
  } finally {
    runGitCommandStub.restore();
    gitUtils.resetCachedGitVersion();
  }
});

test("getGitVersion returns undefined when version cannot be determined", async (t) => {
  gitUtils.resetCachedGitVersion();
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .rejects(new Error("git not found"));

  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  try {
    const version = await gitUtils.getGitVersion(logger);
    t.is(version, undefined);
    t.true(
      messages.some(
        (m) =>
          m.type === "debug" &&
          typeof m.message === "string" &&
          m.message.includes("Could not determine Git version"),
      ),
    );
  } finally {
    runGitCommandStub.restore();
    gitUtils.resetCachedGitVersion();
  }
});

test("gitVersionAtLeast returns true for version meeting requirement", async (t) => {
  gitUtils.resetCachedGitVersion();
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .resolves("git version 2.40.0\n");

  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  try {
    const result = await gitUtils.gitVersionAtLeast("2.38.0", logger);
    t.true(result);
    t.true(
      messages.some(
        (m) =>
          m.type === "debug" &&
          m.message === "Installed Git version is 2.40.0.",
      ),
    );
  } finally {
    runGitCommandStub.restore();
    gitUtils.resetCachedGitVersion();
  }
});

test("gitVersionAtLeast returns false for version not meeting requirement", async (t) => {
  gitUtils.resetCachedGitVersion();
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .resolves("git version 2.30.0\n");

  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  try {
    const result = await gitUtils.gitVersionAtLeast("2.38.0", logger);
    t.false(result);
  } finally {
    runGitCommandStub.restore();
    gitUtils.resetCachedGitVersion();
  }
});

test("gitVersionAtLeast returns false when version cannot be determined", async (t) => {
  gitUtils.resetCachedGitVersion();
  const runGitCommandStub = sinon
    .stub(gitUtils as any, "runGitCommand")
    .rejects(new Error("git not found"));

  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  try {
    const result = await gitUtils.gitVersionAtLeast("2.38.0", logger);
    t.false(result);
    t.true(
      messages.some(
        (m) =>
          m.type === "debug" &&
          typeof m.message === "string" &&
          m.message.includes("Could not determine Git version"),
      ),
    );
  } finally {
    runGitCommandStub.restore();
    gitUtils.resetCachedGitVersion();
  }
});
