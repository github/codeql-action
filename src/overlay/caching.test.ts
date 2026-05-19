import * as fs from "fs";
import * as path from "path";

import * as actionsCache from "@actions/cache";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "../actions-util";
import * as apiClient from "../api-client";
import type { ResolveDatabaseOutput } from "../codeql";
import * as gitUtils from "../git-utils";
import { BuiltInLanguage } from "../languages";
import { getRunnerLogger } from "../logging";
import {
  createTestConfig,
  makeMacro,
  mockCodeQLVersion,
  setupTests,
} from "../testing-utils";
import * as utils from "../util";
import { withTmpDir } from "../util";

import {
  downloadOverlayBaseDatabaseFromCache,
  getCacheRestoreKeyPrefix,
  getCacheSaveKey,
  getCodeQlVersionsForOverlayBaseDatabases,
} from "./caching";
import { OverlayDatabaseMode } from "./overlay-database-mode";

setupTests(test);

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

const testDownloadOverlayBaseDatabaseFromCache = makeMacro({
  exec: async (
    t,
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
        languages: [BuiltInLanguage.java],
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

      sinon.stub(apiClient, "getAutomationID").resolves("test-automation-id/");

      sinon.stub(utils, "isInTestMode").returns(testCase.isInTestMode);

      if (testCase.restoreCacheResult instanceof Error) {
        sinon
          .stub(actionsCache, "restoreCache")
          .rejects(testCase.restoreCacheResult);
      } else {
        sinon
          .stub(actionsCache, "restoreCache")
          .resolves(testCase.restoreCacheResult);
      }

      sinon
        .stub(utils, "tryGetFolderBytes")
        .resolves(testCase.tryGetFolderBytesSucceeds ? 1024 * 1024 : undefined);

      const codeql = mockCodeQLVersion(testCase.codeQLVersion);

      if (testCase.resolveDatabaseOutput instanceof Error) {
        sinon
          .stub(codeql, "resolveDatabase")
          .rejects(testCase.resolveDatabaseOutput);
      } else {
        sinon
          .stub(codeql, "resolveDatabase")
          .resolves(testCase.resolveDatabaseOutput);
      }

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
    });
  },
  title: (title) => `downloadOverlayBaseDatabaseFromCache: ${title}`,
});

testDownloadOverlayBaseDatabaseFromCache.serial(
  "returns stats when successful",
  {},
  true,
);

testDownloadOverlayBaseDatabaseFromCache.serial(
  "returns undefined when mode is OverlayDatabaseMode.OverlayBase",
  {
    overlayDatabaseMode: OverlayDatabaseMode.OverlayBase,
  },
  false,
);

testDownloadOverlayBaseDatabaseFromCache.serial(
  "returns undefined when mode is OverlayDatabaseMode.None",
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
  },
  false,
);

testDownloadOverlayBaseDatabaseFromCache.serial(
  "returns undefined when caching is disabled",
  {
    useOverlayDatabaseCaching: false,
  },
  false,
);

testDownloadOverlayBaseDatabaseFromCache.serial(
  "returns undefined in test mode",
  {
    isInTestMode: true,
  },
  false,
);

testDownloadOverlayBaseDatabaseFromCache.serial(
  "returns undefined when cache miss",
  {
    restoreCacheResult: undefined,
  },
  false,
);

testDownloadOverlayBaseDatabaseFromCache.serial(
  "returns undefined when download fails",
  {
    restoreCacheResult: new Error("Download failed"),
  },
  false,
);

testDownloadOverlayBaseDatabaseFromCache.serial(
  "returns undefined when downloaded database is invalid",
  {
    hasBaseDatabaseOidsFile: false,
  },
  false,
);

testDownloadOverlayBaseDatabaseFromCache.serial(
  "returns undefined when downloaded database doesn't have an overlayBaseSpecifier",
  {
    resolveDatabaseOutput: {},
  },
  false,
);

testDownloadOverlayBaseDatabaseFromCache.serial(
  "returns undefined when resolving database metadata fails",
  {
    resolveDatabaseOutput: new Error("Failed to resolve database metadata"),
  },
  false,
);

testDownloadOverlayBaseDatabaseFromCache.serial(
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

test.serial(
  "getCodeQlVersionsForOverlayBaseDatabases returns unique versions sorted latest first",
  async (t) => {
    const logger = getRunnerLogger(true);

    sinon.stub(apiClient, "getAutomationID").resolves("test-automation-id/");
    sinon.stub(apiClient, "listActionsCaches").resolves([
      {
        key: "codeql-overlay-base-database-1-c5666c509a2d9895-javascript_python-2.23.0-abc123-1-1",
      },
      {
        key: "codeql-overlay-base-database-1-c5666c509a2d9895-javascript_python-2.24.1-def456-2-1",
      },
      {
        key: "codeql-overlay-base-database-1-c5666c509a2d9895-javascript_python-2.23.0-ghi789-3-1",
      },
    ]);

    const result = await getCodeQlVersionsForOverlayBaseDatabases(
      ["javascript", "python"],
      logger,
    );
    t.deepEqual(result, ["2.24.1", "2.23.0"]);
  },
);

test.serial(
  "getCodeQlVersionsForOverlayBaseDatabases returns empty list when no caches exist",
  async (t) => {
    const logger = getRunnerLogger(true);

    sinon.stub(apiClient, "getAutomationID").resolves("test-automation-id/");
    sinon.stub(apiClient, "listActionsCaches").resolves([]);

    const result = await getCodeQlVersionsForOverlayBaseDatabases(
      ["python"],
      logger,
    );
    t.deepEqual(result, []);
  },
);

test.serial(
  "getCodeQlVersionsForOverlayBaseDatabases returns empty list when cache keys are unparseable",
  async (t) => {
    const logger = getRunnerLogger(true);

    sinon.stub(apiClient, "getAutomationID").resolves("test-automation-id/");
    sinon.stub(apiClient, "listActionsCaches").resolves([
      {
        key: "codeql-overlay-base-database-1-c5666c509a2d9895-python-malformed",
      },
      { key: undefined },
    ]);

    const result = await getCodeQlVersionsForOverlayBaseDatabases(
      ["python"],
      logger,
    );
    t.deepEqual(result, []);
  },
);

test.serial(
  "getCodeQlVersionsForOverlayBaseDatabases returns the single version when only one cache exists",
  async (t) => {
    const logger = getRunnerLogger(true);

    sinon.stub(apiClient, "getAutomationID").resolves("test-automation-id/");
    sinon.stub(apiClient, "listActionsCaches").resolves([
      {
        key: "codeql-overlay-base-database-1-c5666c509a2d9895-cpp-2.25.0-abc123-1-1",
      },
    ]);

    const result = await getCodeQlVersionsForOverlayBaseDatabases(
      ["cpp"],
      logger,
    );
    t.deepEqual(result, ["2.25.0"]);
  },
);

test.serial(
  "getCodeQlVersionsForOverlayBaseDatabases resolves language aliases",
  async (t) => {
    const logger = getRunnerLogger(true);
    // The alias `c++` should be resolved to "cpp" and match cache entries keyed with "cpp"

    sinon.stub(apiClient, "getAutomationID").resolves("test-automation-id/");
    sinon.stub(apiClient, "listActionsCaches").resolves([
      {
        key: "codeql-overlay-base-database-1-c5666c509a2d9895-cpp-2.25.0-abc123-1-1",
      },
    ]);

    const result = await getCodeQlVersionsForOverlayBaseDatabases(
      ["c++"],
      logger,
    );
    t.deepEqual(result, ["2.25.0"]);
  },
);

test.serial(
  "getCodeQlVersionsForOverlayBaseDatabases de-duplicates resolved language aliases",
  async (t) => {
    const logger = getRunnerLogger(true);

    sinon.stub(apiClient, "getAutomationID").resolves("test-automation-id/");
    const listActionsCachesStub = sinon
      .stub(apiClient, "listActionsCaches")
      .resolves([
        {
          key: "codeql-overlay-base-database-1-c5666c509a2d9895-javascript_python-2.25.0-abc123-1-1",
        },
      ]);

    const result = await getCodeQlVersionsForOverlayBaseDatabases(
      ["javascript", "typescript", "Python", "python"],
      logger,
    );
    t.deepEqual(result, ["2.25.0"]);
    sinon.assert.calledOnceWithExactly(
      listActionsCachesStub,
      "codeql-overlay-base-database-1-c5666c509a2d9895-javascript_python-",
    );
  },
);

test.serial(
  "getCodeQlVersionsForOverlayBaseDatabases ignores nightly versions with build metadata",
  async (t) => {
    const logger = getRunnerLogger(true);

    sinon.stub(apiClient, "getAutomationID").resolves("test-automation-id/");
    sinon.stub(apiClient, "listActionsCaches").resolves([
      {
        key: "codeql-overlay-base-database-1-c5666c509a2d9895-python-2.25.0-abc123-1-1",
      },
      {
        // Nightly release with semver build metadata; should be ignored.
        key: "codeql-overlay-base-database-1-c5666c509a2d9895-python-2.26.0+202604211234-def456-2-1",
      },
      {
        key: "codeql-overlay-base-database-1-c5666c509a2d9895-python-2.24.0-ghi789-3-1",
      },
    ]);

    const result = await getCodeQlVersionsForOverlayBaseDatabases(
      ["python"],
      logger,
    );
    t.deepEqual(result, ["2.25.0", "2.24.0"]);
  },
);
