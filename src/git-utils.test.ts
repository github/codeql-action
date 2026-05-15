import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as core from "@actions/core";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as gitUtils from "./git-utils";
import { setupActionsVars, setupTests } from "./testing-utils";
import { withTmpDir } from "./util";

setupTests(test);

test.serial("getRef() throws on the empty string", async (t) => {
  process.env["GITHUB_REF"] = "";
  await t.throwsAsync(gitUtils.getRef);
});

test.serial(
  "getRef() returns merge PR ref if GITHUB_SHA still checked out",
  async (t) => {
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
    });
  },
);

test.serial(
  "getRef() returns merge PR ref if GITHUB_REF still checked out but sha has changed (actions checkout@v1)",
  async (t) => {
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
    });
  },
);

test.serial(
  "getRef() returns head PR ref if GITHUB_REF no longer checked out",
  async (t) => {
    await withTmpDir(async (tmpDir: string) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env["GITHUB_REF"] = "refs/pull/1/merge";
      process.env["GITHUB_SHA"] = "a".repeat(40);

      const callback = sinon.stub(gitUtils, "getCommitOid");
      callback.withArgs(tmpDir, "refs/pull/1/merge").resolves("a".repeat(40));
      callback.withArgs(tmpDir, "HEAD").resolves("b".repeat(40));

      const actualRef = await gitUtils.getRef();
      t.deepEqual(actualRef, "refs/pull/1/head");
    });
  },
);

test.serial(
  "getRef() returns ref provided as an input and ignores current HEAD",
  async (t) => {
    await withTmpDir(async (tmpDir: string) => {
      setupActionsVars(tmpDir, tmpDir);
      const getAdditionalInputStub = sinon.stub(
        actionsUtil,
        "getOptionalInput",
      );
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
    });
  },
);

test.serial(
  "getRef() returns CODE_SCANNING_REF as a fallback for GITHUB_REF",
  async (t) => {
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
  },
);

test.serial(
  "getRef() returns GITHUB_REF over CODE_SCANNING_REF if both are provided",
  async (t) => {
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
  },
);

test.serial(
  "getRef() throws an error if only `ref` is provided as an input",
  async (t) => {
    await withTmpDir(async (tmpDir: string) => {
      setupActionsVars(tmpDir, tmpDir);
      const getAdditionalInputStub = sinon.stub(
        actionsUtil,
        "getOptionalInput",
      );
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
    });
  },
);

test.serial(
  "getRef() throws an error if only `sha` is provided as an input",
  async (t) => {
    await withTmpDir(async (tmpDir: string) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env["GITHUB_WORKSPACE"] = "/tmp";
      const getAdditionalInputStub = sinon.stub(
        actionsUtil,
        "getOptionalInput",
      );
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
    });
  },
);

test.serial("isAnalyzingDefaultBranch()", async (t) => {
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
  });
});

test.serial("determineBaseBranchHeadCommitOid non-pullrequest", async (t) => {
  const infoStub = sinon.stub(core, "info");

  process.env["GITHUB_EVENT_NAME"] = "hucairz";
  process.env["GITHUB_SHA"] = "100912429fab4cb230e66ffb11e738ac5194e73a";
  const result = await gitUtils.determineBaseBranchHeadCommitOid(__dirname);
  t.deepEqual(result, undefined);
  t.deepEqual(0, infoStub.callCount);
});

test.serial(
  "determineBaseBranchHeadCommitOid not git repository",
  async (t) => {
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
  },
);

test.serial("determineBaseBranchHeadCommitOid other error", async (t) => {
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
});

test.serial(
  "determineBaseBranchHeadCommitOid accepts SHA-256 OIDs",
  async (t) => {
    const mergeSha = "a".repeat(64);
    const baseOid = "b".repeat(64);
    const headOid = "c".repeat(64);

    process.env["GITHUB_EVENT_NAME"] = "pull_request";
    process.env["GITHUB_SHA"] = mergeSha;

    sinon
      .stub(gitUtils as any, "runGitCommand")
      .resolves(`commit ${mergeSha}\nparent ${baseOid}\nparent ${headOid}\n`);

    const result = await gitUtils.determineBaseBranchHeadCommitOid(__dirname);
    t.deepEqual(result, baseOid);
  },
);

test.serial("decodeGitFilePath unquoted strings", async (t) => {
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

test.serial("decodeGitFilePath quoted strings", async (t) => {
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

test.serial(
  "getFileOidsUnderPath uses --recurse-submodules when submodules exist",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      fs.writeFileSync(path.join(tmpDir, ".gitmodules"), "");
      const runGitCommandStub = sinon
        .stub(gitUtils as any, "runGitCommand")
        .callsFake(async (_cwd: any, args: any) => {
          if (args[0] === "rev-parse") {
            return `${tmpDir}\n`;
          }
          return (
            "100644 30d998ded095371488be3a729eb61d86ed721a18 0\tlib/git-utils.js\n" +
            "100644 d89514599a9a99f22b4085766d40af7b99974827 0\tlib/git-utils.js.map\n" +
            "100644 a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96 0\tsrc/git-utils.ts"
          );
        });

      const result = await gitUtils.getFileOidsUnderPath("/fake/path");

      t.deepEqual(result, {
        "lib/git-utils.js": "30d998ded095371488be3a729eb61d86ed721a18",
        "lib/git-utils.js.map": "d89514599a9a99f22b4085766d40af7b99974827",
        "src/git-utils.ts": "a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96",
      });

      // Second call (after getGitRoot) should include --recurse-submodules
      t.deepEqual(runGitCommandStub.secondCall.args[1], [
        "ls-files",
        "--recurse-submodules",
        "--stage",
      ]);
    });
  },
);

test.serial(
  "getFileOidsUnderPath omits --recurse-submodules when no submodules exist",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      const runGitCommandStub = sinon
        .stub(gitUtils as any, "runGitCommand")
        .callsFake(async (_cwd: any, args: any) => {
          if (args[0] === "rev-parse") {
            return `${tmpDir}\n`;
          }
          return (
            "100644 30d998ded095371488be3a729eb61d86ed721a18 0\tlib/git-utils.js\n" +
            "100644 a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96 0\tsrc/git-utils.ts"
          );
        });

      const result = await gitUtils.getFileOidsUnderPath("/fake/path");

      t.deepEqual(result, {
        "lib/git-utils.js": "30d998ded095371488be3a729eb61d86ed721a18",
        "src/git-utils.ts": "a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96",
      });

      // Second call (after getGitRoot) should NOT include --recurse-submodules
      t.deepEqual(runGitCommandStub.secondCall.args[1], [
        "ls-files",
        "--stage",
      ]);
    });
  },
);

test.serial("getFileOidsUnderPath handles quoted paths", async (t) => {
  await withTmpDir(async (tmpDir) => {
    sinon
      .stub(gitUtils as any, "runGitCommand")
      .callsFake(async (_cwd: any, args: any) => {
        if (args[0] === "rev-parse") {
          return `${tmpDir}\n`;
        }
        return (
          "100644 30d998ded095371488be3a729eb61d86ed721a18 0\tlib/normal-file.js\n" +
          '100644 d89514599a9a99f22b4085766d40af7b99974827 0\t"lib/file with spaces.js"\n' +
          '100644 a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96 0\t"lib/file\\twith\\ttabs.js"'
        );
      });

    const result = await gitUtils.getFileOidsUnderPath("/fake/path");

    t.deepEqual(result, {
      "lib/normal-file.js": "30d998ded095371488be3a729eb61d86ed721a18",
      "lib/file with spaces.js": "d89514599a9a99f22b4085766d40af7b99974827",
      "lib/file\twith\ttabs.js": "a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96",
    });
  });
});

test.serial("getFileOidsUnderPath handles SHA-256 OIDs", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const sha256OidA =
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2c0d4b7e8f9a1234567890ab";
    const sha256OidB =
      "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";

    sinon
      .stub(gitUtils as any, "runGitCommand")
      .callsFake(async (_cwd: any, args: any) => {
        if (args[0] === "rev-parse") {
          return `${tmpDir}\n`;
        }
        return (
          `100644 ${sha256OidA} 0\tlib/sha256-file-a.js\n` +
          `100644 ${sha256OidB} 0\tsrc/sha256-file-b.ts`
        );
      });

    const result = await gitUtils.getFileOidsUnderPath("/fake/path");

    t.deepEqual(result, {
      "lib/sha256-file-a.js": sha256OidA,
      "src/sha256-file-b.ts": sha256OidB,
    });
  });
});

test.serial(
  "getFileOidsUnderPath rejects OIDs of unsupported length",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      // 50-char OID: not a valid SHA-1 (40) or SHA-256 (64) length. The regex
      // must not accept this even though every character is a valid hex digit.
      const invalidLine =
        "100644 30d998ded095371488be3a729eb61d86ed721a1830d998ded0 0\tlib/bad.js";
      sinon
        .stub(gitUtils as any, "runGitCommand")
        .callsFake(async (_cwd: any, args: any) => {
          if (args[0] === "rev-parse") {
            return `${tmpDir}\n`;
          }
          return invalidLine;
        });

      await t.throwsAsync(
        async () => {
          await gitUtils.getFileOidsUnderPath("/fake/path");
        },
        {
          instanceOf: Error,
          message: `Unexpected "git ls-files" output: ${invalidLine}`,
        },
      );
    });
  },
);

test.serial("getFileOidsUnderPath handles empty output", async (t) => {
  await withTmpDir(async (tmpDir) => {
    sinon
      .stub(gitUtils as any, "runGitCommand")
      .callsFake(async (_cwd: any, args: any) => {
        if (args[0] === "rev-parse") {
          return `${tmpDir}\n`;
        }
        return "";
      });

    const result = await gitUtils.getFileOidsUnderPath("/fake/path");
    t.deepEqual(result, {});
  });
});

test.serial(
  "getFileOidsUnderPath throws on unexpected output format",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      sinon
        .stub(gitUtils as any, "runGitCommand")
        .callsFake(async (_cwd: any, args: any) => {
          if (args[0] === "rev-parse") {
            return `${tmpDir}\n`;
          }
          return (
            "100644 30d998ded095371488be3a729eb61d86ed721a18 0\tlib/git-utils.js\n" +
            "invalid-line-format\n" +
            "100644 a47c11f5bfdca7661942d2c8f1b7209fb0dfdf96 0\tsrc/git-utils.ts"
          );
        });

      await t.throwsAsync(
        async () => {
          await gitUtils.getFileOidsUnderPath("/fake/path");
        },
        {
          instanceOf: Error,
          message: 'Unexpected "git ls-files" output: invalid-line-format',
        },
      );
    });
  },
);

test.serial(
  "getGitVersionOrThrow returns version for valid git output",
  async (t) => {
    sinon
      .stub(gitUtils as any, "runGitCommand")
      .resolves(`git version 2.40.0${os.EOL}`);

    const version = await gitUtils.getGitVersionOrThrow();
    t.is(version.truncatedVersion, "2.40.0");
    t.is(version.fullVersion, "2.40.0");
  },
);

test.serial("getGitVersionOrThrow throws for invalid git output", async (t) => {
  sinon.stub(gitUtils as any, "runGitCommand").resolves("invalid output");

  await t.throwsAsync(
    async () => {
      await gitUtils.getGitVersionOrThrow();
    },
    {
      instanceOf: Error,
      message: "Could not parse Git version from output: invalid output",
    },
  );
});

test.serial(
  "getGitVersionOrThrow handles Windows-style git output",
  async (t) => {
    sinon
      .stub(gitUtils as any, "runGitCommand")
      .resolves("git version 2.40.0.windows.1");

    const version = await gitUtils.getGitVersionOrThrow();
    // The truncated version should contain just the major.minor.patch portion
    t.is(version.truncatedVersion, "2.40.0");
    t.is(version.fullVersion, "2.40.0.windows.1");
  },
);

test.serial("getGitVersionOrThrow throws when git command fails", async (t) => {
  sinon
    .stub(gitUtils as any, "runGitCommand")
    .rejects(new Error("git not found"));

  await t.throwsAsync(
    async () => {
      await gitUtils.getGitVersionOrThrow();
    },
    {
      instanceOf: Error,
      message: "git not found",
    },
  );
});

test.serial(
  "GitVersionInfo.isAtLeast correctly compares versions",
  async (t) => {
    const version = new gitUtils.GitVersionInfo("2.40.0", "2.40.0");

    t.true(version.isAtLeast("2.38.0"));
    t.true(version.isAtLeast("2.40.0"));
    t.false(version.isAtLeast("2.41.0"));
    t.false(version.isAtLeast("3.0.0"));
  },
);

test.serial("listFiles returns array of file paths", async (t) => {
  sinon
    .stub(gitUtils, "runGitCommand")
    .resolves(["dir/file.txt", "README.txt", ""].join(os.EOL));

  await t.notThrowsAsync(async () => {
    const result = await gitUtils.listFiles("/some/path");
    t.is(result.length, 2);
    t.is(result[0], "dir/file.txt");
  });
});

test.serial("getGeneratedFiles returns generated files only", async (t) => {
  const runGitCommandStub = sinon.stub(gitUtils, "runGitCommand");

  runGitCommandStub
    .onFirstCall()
    .resolves(["dir/file.txt", "test.json", "README.txt", ""].join(os.EOL));
  runGitCommandStub
    .onSecondCall()
    .resolves(
      [
        "dir/file.txt: linguist-generated: unspecified",
        "test.json: linguist-generated: true",
        "README.txt: linguist-generated: false",
        "",
      ].join(os.EOL),
    );

  await t.notThrowsAsync(async () => {
    const result = await gitUtils.getGeneratedFiles("/some/path");

    t.assert(runGitCommandStub.calledTwice);

    t.is(result.length, 1);
    t.is(result[0], "test.json");
  });
});
