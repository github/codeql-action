import * as fs from "fs";
import * as path from "path";

import * as actionsCache from "@actions/cache";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "../actions-util";
import * as apiClient from "../api-client";
import { ResolveDatabaseOutput } from "../codeql";
import * as gitUtils from "../git-utils";
import { KnownLanguage } from "../languages";
import { getRunnerLogger } from "../logging";
import {
  createTestConfig,
  mockCodeQLVersion,
  setupTests,
} from "../testing-utils";
import * as utils from "../util";
import { withTmpDir } from "../util";

import {
  downloadOverlayBaseDatabaseFromCache,
  getCacheRestoreKeyPrefix,
  getCacheSaveKey,
  OverlayDatabaseMode,
  writeBaseDatabaseOidsFile,
  writeOverlayChangesFile,
} from ".";

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

interface DownloadOverlayBaseDatabaseTestCase {
  overlayDatabaseMode: OverlayDatabaseMode;
  useOverlayDatabaseCaching: boolean;
  isInTestMode: boolean;
  restoreCacheResult: string | undefined | Error;
  hasBaseDatabaseOidsFile: boolean;
  tryGetFolderBytesSucceeds: boolean;
  codeQLVersion: string;
  resolveDatabaseOutput: ResolveDatabaseOutput | Error;
}

const defaultDownloadTestCase: DownloadOverlayBaseDatabaseTestCase = {
  overlayDatabaseMode: OverlayDatabaseMode.Overlay,
  useOverlayDatabaseCaching: true,
  isInTestMode: false,
  restoreCacheResult: "cache-key",
  hasBaseDatabaseOidsFile: true,
  tryGetFolderBytesSucceeds: true,
  codeQLVersion: "2.20.5",
  resolveDatabaseOutput: { overlayBaseSpecifier: "20250626:XXX" },
};

const testDownloadOverlayBaseDatabaseFromCache = test.macro({
  exec: async (
    t,
    _title: string,
    partialTestCase: Partial<DownloadOverlayBaseDatabaseTestCase>,
    expectDownloadSuccess: boolean,
  ) => {
    await withTmpDir(async (tmpDir) => {
      const dbLocation = path.join(tmpDir, "db");
      await fs.promises.mkdir(dbLocation, { recursive: true });

      const logger = getRunnerLogger(true);
      const testCase = { ...defaultDownloadTestCase, ...partialTestCase };
      const config = createTestConfig({
        dbLocation,
        languages: [KnownLanguage.java],
      });

      config.overlayDatabaseMode = testCase.overlayDatabaseMode;
      config.useOverlayDatabaseCaching = testCase.useOverlayDatabaseCaching;

      if (testCase.hasBaseDatabaseOidsFile) {
        const baseDatabaseOidsFile = path.join(
          dbLocation,
          "base-database-oids.json",
        );
        await fs.promises.writeFile(baseDatabaseOidsFile, JSON.stringify({}));
      }

      const stubs: sinon.SinonStub[] = [];

      const getAutomationIDStub = sinon
        .stub(apiClient, "getAutomationID")
        .resolves("test-automation-id/");
      stubs.push(getAutomationIDStub);

      const isInTestModeStub = sinon
        .stub(utils, "isInTestMode")
        .returns(testCase.isInTestMode);
      stubs.push(isInTestModeStub);

      if (testCase.restoreCacheResult instanceof Error) {
        const restoreCacheStub = sinon
          .stub(actionsCache, "restoreCache")
          .rejects(testCase.restoreCacheResult);
        stubs.push(restoreCacheStub);
      } else {
        const restoreCacheStub = sinon
          .stub(actionsCache, "restoreCache")
          .resolves(testCase.restoreCacheResult);
        stubs.push(restoreCacheStub);
      }

      const tryGetFolderBytesStub = sinon
        .stub(utils, "tryGetFolderBytes")
        .resolves(testCase.tryGetFolderBytesSucceeds ? 1024 * 1024 : undefined);
      stubs.push(tryGetFolderBytesStub);

      const codeql = mockCodeQLVersion(testCase.codeQLVersion);

      if (testCase.resolveDatabaseOutput instanceof Error) {
        const resolveDatabaseStub = sinon
          .stub(codeql, "resolveDatabase")
          .rejects(testCase.resolveDatabaseOutput);
        stubs.push(resolveDatabaseStub);
      } else {
        const resolveDatabaseStub = sinon
          .stub(codeql, "resolveDatabase")
          .resolves(testCase.resolveDatabaseOutput);
        stubs.push(resolveDatabaseStub);
      }

      try {
        const result = await downloadOverlayBaseDatabaseFromCache(
          codeql,
          config,
          logger,
        );

        if (expectDownloadSuccess) {
          t.truthy(result);
        } else {
          t.is(result, undefined);
        }
      } finally {
        for (const stub of stubs) {
          stub.restore();
        }
      }
    });
  },
  title: (_, title) => `downloadOverlayBaseDatabaseFromCache: ${title}`,
});

test.serial(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns stats when successful",
  {},
  true,
);

test.serial(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when mode is OverlayDatabaseMode.OverlayBase",
  {
    overlayDatabaseMode: OverlayDatabaseMode.OverlayBase,
  },
  false,
);

test.serial(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when mode is OverlayDatabaseMode.None",
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
  },
  false,
);

test.serial(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when caching is disabled",
  {
    useOverlayDatabaseCaching: false,
  },
  false,
);

test.serial(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined in test mode",
  {
    isInTestMode: true,
  },
  false,
);

test.serial(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when cache miss",
  {
    restoreCacheResult: undefined,
  },
  false,
);

test.serial(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when download fails",
  {
    restoreCacheResult: new Error("Download failed"),
  },
  false,
);

test.serial(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when downloaded database is invalid",
  {
    hasBaseDatabaseOidsFile: false,
  },
  false,
);

test.serial(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when downloaded database doesn't have an overlayBaseSpecifier",
  {
    resolveDatabaseOutput: {},
  },
  false,
);

test.serial(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when resolving database metadata fails",
  {
    resolveDatabaseOutput: new Error("Failed to resolve database metadata"),
  },
  false,
);

test.serial(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when filesystem error occurs",
  {
    tryGetFolderBytesSucceeds: false,
  },
  false,
);

test.serial("overlay-base database cache keys remain stable", async (t) => {
  const logger = getRunnerLogger(true);
  const config = createTestConfig({ languages: ["python", "javascript"] });
  const codeQlVersion = "2.23.0";
  const commitOid = "abc123def456";

  sinon.stub(apiClient, "getAutomationID").resolves("test-automation-id/");
  sinon.stub(gitUtils, "getCommitOid").resolves(commitOid);
  sinon.stub(actionsUtil, "getWorkflowRunID").returns(12345);
  sinon.stub(actionsUtil, "getWorkflowRunAttempt").returns(1);

  const saveKey = await getCacheSaveKey(
    config,
    codeQlVersion,
    "checkout-path",
    logger,
  );
  const expectedSaveKey =
    "codeql-overlay-base-database-1-c5666c509a2d9895-javascript_python-2.23.0-abc123def456-12345-1";
  t.is(
    saveKey,
    expectedSaveKey,
    "Cache save key changed unexpectedly. " +
      "This may indicate breaking changes in the cache key generation logic.",
  );

  const restoreKeyPrefix = await getCacheRestoreKeyPrefix(
    config,
    codeQlVersion,
  );
  const expectedRestoreKeyPrefix =
    "codeql-overlay-base-database-1-c5666c509a2d9895-javascript_python-2.23.0-";
  t.is(
    restoreKeyPrefix,
    expectedRestoreKeyPrefix,
    "Cache restore key prefix changed unexpectedly. " +
      "This may indicate breaking changes in the cache key generation logic.",
  );

  t.true(
    saveKey.startsWith(restoreKeyPrefix),
    `Expected save key "${saveKey}" to start with restore key prefix "${restoreKeyPrefix}"`,
  );
});
