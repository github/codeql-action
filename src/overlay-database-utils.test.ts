import * as fs from "fs";
import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as gitUtils from "./git-utils";
import { getRunnerLogger } from "./logging";
import {
  writeBaseDatabaseOidsFile,
  writeOverlayChangesFile,
} from "./overlay-database-utils";
import { createTestConfig, setupTests } from "./testing-utils";
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
