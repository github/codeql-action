import * as fs from "fs";
import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "../actions-util";
import * as gitUtils from "../git-utils";
import { getRunnerLogger } from "../logging";
import { createTestConfig, setupTests } from "../testing-utils";
import { withTmpDir } from "../util";

import { writeBaseDatabaseOidsFile, writeOverlayChangesFile } from ".";

setupTests(test);

test.serial(
  "writeOverlayChangesFile generates correct changes file",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      const [dbLocation, sourceRoot, tempDir] = ["db", "src", "temp"].map((d) =>
        path.join(tmpDir, d),
      );
      await Promise.all(
        [dbLocation, sourceRoot, tempDir].map((d) =>
          fs.promises.mkdir(d, { recursive: true }),
        ),
      );

      const logger = getRunnerLogger(true);
      const config = createTestConfig({ dbLocation });

      // Mock the getFileOidsUnderPath function to return base OIDs
      const baseOids = {
        "unchanged.js": "aaa111",
        "modified.js": "bbb222",
        "deleted.js": "ccc333",
      };
      const getFileOidsStubForBase = sinon
        .stub(gitUtils, "getFileOidsUnderPath")
        .resolves(baseOids);

      // Write the base database OIDs file
      await writeBaseDatabaseOidsFile(config, sourceRoot);
      getFileOidsStubForBase.restore();

      // Mock the getFileOidsUnderPath function to return overlay OIDs
      const currentOids = {
        "unchanged.js": "aaa111",
        "modified.js": "ddd444", // Changed OID
        "added.js": "eee555", // New file
      };
      const getFileOidsStubForOverlay = sinon
        .stub(gitUtils, "getFileOidsUnderPath")
        .resolves(currentOids);

      // Write the overlay changes file, which uses the mocked overlay OIDs
      // and the base database OIDs file
      const diffRangeFilePath = path.join(tempDir, "pr-diff-range.json");
      const getTempDirStub = sinon
        .stub(actionsUtil, "getTemporaryDirectory")
        .returns(tempDir);
      const getDiffRangesStub = sinon
        .stub(actionsUtil, "getDiffRangesJsonFilePath")
        .returns(diffRangeFilePath);
      const getGitRootStub = sinon
        .stub(gitUtils, "getGitRoot")
        .resolves(sourceRoot);
      const changesFilePath = await writeOverlayChangesFile(
        config,
        sourceRoot,
        logger,
      );
      getFileOidsStubForOverlay.restore();
      getTempDirStub.restore();
      getDiffRangesStub.restore();
      getGitRootStub.restore();

      const fileContent = await fs.promises.readFile(changesFilePath, "utf-8");
      const parsedContent = JSON.parse(fileContent) as { changes: string[] };

      t.deepEqual(
        parsedContent.changes.sort(),
        ["added.js", "deleted.js", "modified.js"],
        "Should identify added, deleted, and modified files",
      );
    });
  },
);

test.serial(
  "writeOverlayChangesFile merges additional diff files into overlay changes",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      const [dbLocation, sourceRoot, tempDir] = ["db", "src", "temp"].map((d) =>
        path.join(tmpDir, d),
      );
      await Promise.all(
        [dbLocation, sourceRoot, tempDir].map((d) =>
          fs.promises.mkdir(d, { recursive: true }),
        ),
      );

      const logger = getRunnerLogger(true);
      const config = createTestConfig({ dbLocation });

      // Mock the getFileOidsUnderPath function to return base OIDs
      // "reverted.js" has the same OID in both base and current, simulating
      // a revert PR where the file content matches the overlay-base
      const baseOids = {
        "unchanged.js": "aaa111",
        "modified.js": "bbb222",
        "reverted.js": "eee555",
      };
      const getFileOidsStubForBase = sinon
        .stub(gitUtils, "getFileOidsUnderPath")
        .resolves(baseOids);

      // Write the base database OIDs file
      await writeBaseDatabaseOidsFile(config, sourceRoot);
      getFileOidsStubForBase.restore();

      // Mock the getFileOidsUnderPath function to return overlay OIDs
      // "reverted.js" has the same OID as the base -- OID comparison alone
      // would NOT include it, only additionalChangedFiles causes it to appear
      const currentOids = {
        "unchanged.js": "aaa111",
        "modified.js": "ddd444", // Changed OID
        "reverted.js": "eee555", // Same OID as base -- not detected by OID comparison
      };
      const getFileOidsStubForOverlay = sinon
        .stub(gitUtils, "getFileOidsUnderPath")
        .resolves(currentOids);

      const diffRangeFilePath = path.join(tempDir, "pr-diff-range.json");
      const getTempDirStub = sinon
        .stub(actionsUtil, "getTemporaryDirectory")
        .returns(tempDir);
      const getDiffRangesStub = sinon
        .stub(actionsUtil, "getDiffRangesJsonFilePath")
        .returns(diffRangeFilePath);
      const getGitRootStub = sinon
        .stub(gitUtils, "getGitRoot")
        .resolves(sourceRoot);

      // Write a pr-diff-range.json file with diff ranges including
      // "reverted.js" (unchanged OIDs) and "modified.js" (already in OID changes)
      await fs.promises.writeFile(
        diffRangeFilePath,
        JSON.stringify([
          { path: "reverted.js", startLine: 1, endLine: 10 },
          { path: "modified.js", startLine: 1, endLine: 5 },
          { path: "diff-only.js", startLine: 1, endLine: 3 },
        ]),
      );

      const changesFilePath = await writeOverlayChangesFile(
        config,
        sourceRoot,
        logger,
      );
      getFileOidsStubForOverlay.restore();
      getTempDirStub.restore();
      getDiffRangesStub.restore();
      getGitRootStub.restore();

      const fileContent = await fs.promises.readFile(changesFilePath, "utf-8");
      const parsedContent = JSON.parse(fileContent) as { changes: string[] };

      t.deepEqual(
        parsedContent.changes.sort(),
        ["diff-only.js", "modified.js", "reverted.js"],
        "Should include OID-changed files, diff-only files, and deduplicate overlapping files",
      );
    });
  },
);

test.serial(
  "writeOverlayChangesFile works without additional diff files",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      const [dbLocation, sourceRoot, tempDir] = ["db", "src", "temp"].map((d) =>
        path.join(tmpDir, d),
      );
      await Promise.all(
        [dbLocation, sourceRoot, tempDir].map((d) =>
          fs.promises.mkdir(d, { recursive: true }),
        ),
      );

      const logger = getRunnerLogger(true);
      const config = createTestConfig({ dbLocation });

      // Mock the getFileOidsUnderPath function to return base OIDs
      const baseOids = {
        "unchanged.js": "aaa111",
        "modified.js": "bbb222",
      };
      const getFileOidsStubForBase = sinon
        .stub(gitUtils, "getFileOidsUnderPath")
        .resolves(baseOids);

      await writeBaseDatabaseOidsFile(config, sourceRoot);
      getFileOidsStubForBase.restore();

      const currentOids = {
        "unchanged.js": "aaa111",
        "modified.js": "ddd444",
      };
      const getFileOidsStubForOverlay = sinon
        .stub(gitUtils, "getFileOidsUnderPath")
        .resolves(currentOids);

      const diffRangeFilePath = path.join(tempDir, "pr-diff-range.json");
      const getTempDirStub = sinon
        .stub(actionsUtil, "getTemporaryDirectory")
        .returns(tempDir);
      const getDiffRangesStub = sinon
        .stub(actionsUtil, "getDiffRangesJsonFilePath")
        .returns(diffRangeFilePath);
      const getGitRootStub = sinon
        .stub(gitUtils, "getGitRoot")
        .resolves(sourceRoot);

      // No pr-diff-range.json file exists - should work the same as before
      const changesFilePath = await writeOverlayChangesFile(
        config,
        sourceRoot,
        logger,
      );
      getFileOidsStubForOverlay.restore();
      getTempDirStub.restore();
      getDiffRangesStub.restore();
      getGitRootStub.restore();

      const fileContent = await fs.promises.readFile(changesFilePath, "utf-8");
      const parsedContent = JSON.parse(fileContent) as { changes: string[] };

      t.deepEqual(
        parsedContent.changes.sort(),
        ["modified.js"],
        "Should only include OID-changed files when no additional files provided",
      );
    });
  },
);

test.serial(
  "writeOverlayChangesFile converts diff range paths to sourceRoot-relative when sourceRoot is a subdirectory",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      // Simulate: repo root = tmpDir, sourceRoot = tmpDir/src
      const repoRoot = tmpDir;
      const sourceRoot = path.join(tmpDir, "src");
      const [dbLocation, tempDir] = ["db", "temp"].map((d) =>
        path.join(tmpDir, d),
      );
      await Promise.all(
        [dbLocation, sourceRoot, tempDir].map((d) =>
          fs.promises.mkdir(d, { recursive: true }),
        ),
      );

      const logger = getRunnerLogger(true);
      const config = createTestConfig({ dbLocation });

      // Base OIDs (sourceRoot-relative paths)
      const baseOids = {
        "app.js": "aaa111",
        "lib/util.js": "bbb222",
      };
      const getFileOidsStubForBase = sinon
        .stub(gitUtils, "getFileOidsUnderPath")
        .resolves(baseOids);
      await writeBaseDatabaseOidsFile(config, sourceRoot);
      getFileOidsStubForBase.restore();

      // Current OIDs — same as base (no OID changes)
      const currentOids = {
        "app.js": "aaa111",
        "lib/util.js": "bbb222",
      };
      const getFileOidsStubForOverlay = sinon
        .stub(gitUtils, "getFileOidsUnderPath")
        .resolves(currentOids);

      const diffRangeFilePath = path.join(tempDir, "pr-diff-range.json");
      const getTempDirStub = sinon
        .stub(actionsUtil, "getTemporaryDirectory")
        .returns(tempDir);
      const getDiffRangesStub = sinon
        .stub(actionsUtil, "getDiffRangesJsonFilePath")
        .returns(diffRangeFilePath);
      // getGitRoot returns the repo root (parent of sourceRoot)
      const getGitRootStub = sinon
        .stub(gitUtils, "getGitRoot")
        .resolves(repoRoot);

      // Diff ranges use repo-root-relative paths (as returned by the GitHub compare API)
      await fs.promises.writeFile(
        diffRangeFilePath,
        JSON.stringify([
          { path: "src/app.js", startLine: 1, endLine: 10 },
          { path: "src/lib/util.js", startLine: 5, endLine: 8 },
          { path: "other/outside.js", startLine: 1, endLine: 3 }, // not under sourceRoot
        ]),
      );

      const changesFilePath = await writeOverlayChangesFile(
        config,
        sourceRoot,
        logger,
      );
      getFileOidsStubForOverlay.restore();
      getTempDirStub.restore();
      getDiffRangesStub.restore();
      getGitRootStub.restore();

      const fileContent = await fs.promises.readFile(changesFilePath, "utf-8");
      const parsedContent = JSON.parse(fileContent) as { changes: string[] };

      t.deepEqual(
        parsedContent.changes.sort(),
        ["app.js", "lib/util.js"],
        "Should convert repo-root-relative paths to sourceRoot-relative and filter out files outside sourceRoot",
      );
    });
  },
);
