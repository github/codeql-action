import * as fs from "fs";
import * as path from "path";

import * as actionsCache from "@actions/cache";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as apiClient from "./api-client";
import * as gitUtils from "./git-utils";
import { getRunnerLogger } from "./logging";
import {
  downloadOverlayBaseDatabaseFromCache,
  OverlayDatabaseMode,
  writeBaseDatabaseOidsFile,
  writeOverlayChangesFile,
} from "./overlay-database-utils";
import {
  createTestConfig,
  mockCodeQLVersion,
  setupTests,
} from "./testing-utils";
import * as utils from "./util";
import { withTmpDir } from "./util";

setupTests(test);

test("writeOverlayChangesFile generates correct changes file", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const dbLocation = path.join(tmpDir, "db");
    await fs.promises.mkdir(dbLocation, { recursive: true });
    const sourceRoot = path.join(tmpDir, "src");
    await fs.promises.mkdir(sourceRoot, { recursive: true });
    const tempDir = path.join(tmpDir, "temp");
    await fs.promises.mkdir(tempDir, { recursive: true });

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
    const getTempDirStub = sinon
      .stub(actionsUtil, "getTemporaryDirectory")
      .returns(tempDir);
    const changesFilePath = await writeOverlayChangesFile(
      config,
      sourceRoot,
      logger,
    );
    getFileOidsStubForOverlay.restore();
    getTempDirStub.restore();

    const fileContent = await fs.promises.readFile(changesFilePath, "utf-8");
    const parsedContent = JSON.parse(fileContent) as { changes: string[] };

    t.deepEqual(
      parsedContent.changes.sort(),
      ["added.js", "deleted.js", "modified.js"],
      "Should identify added, deleted, and modified files",
    );
  });
});

interface DownloadOverlayBaseDatabaseTestCase {
  overlayDatabaseMode: OverlayDatabaseMode;
  useOverlayDatabaseCaching: boolean;
  isInTestMode: boolean;
  restoreCacheResult: string | undefined | Error;
  hasBaseDatabaseOidsFile: boolean;
  tryGetFolderBytesSucceeds: boolean;
  codeQLVersion: string;
}

const defaultDownloadTestCase: DownloadOverlayBaseDatabaseTestCase = {
  overlayDatabaseMode: OverlayDatabaseMode.Overlay,
  useOverlayDatabaseCaching: true,
  isInTestMode: false,
  restoreCacheResult: "cache-key",
  hasBaseDatabaseOidsFile: true,
  tryGetFolderBytesSucceeds: true,
  codeQLVersion: "2.20.5",
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
      const config = createTestConfig({ dbLocation });

      const testCase = { ...defaultDownloadTestCase, ...partialTestCase };

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

      try {
        const result = await downloadOverlayBaseDatabaseFromCache(
          mockCodeQLVersion(testCase.codeQLVersion),
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

test(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns stats when successful",
  {},
  true,
);

test(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when mode is OverlayDatabaseMode.OverlayBase",
  {
    overlayDatabaseMode: OverlayDatabaseMode.OverlayBase,
  },
  false,
);

test(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when mode is OverlayDatabaseMode.None",
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
  },
  false,
);

test(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when caching is disabled",
  {
    useOverlayDatabaseCaching: false,
  },
  false,
);

test(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined in test mode",
  {
    isInTestMode: true,
  },
  false,
);

test(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when cache miss",
  {
    restoreCacheResult: undefined,
  },
  false,
);

test(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when download fails",
  {
    restoreCacheResult: new Error("Download failed"),
  },
  false,
);

test(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when downloaded database is invalid",
  {
    hasBaseDatabaseOidsFile: false,
  },
  false,
);

test(
  testDownloadOverlayBaseDatabaseFromCache,
  "returns undefined when filesystem error occurs",
  {
    tryGetFolderBytesSucceeds: false,
  },
  false,
);
