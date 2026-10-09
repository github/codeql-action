import * as fs from "fs";
import path from "path";

import test from "ava";
import * as sinon from "sinon";

import * as diagnostics from "./diagnostics";
import type { FileSystem } from "./fs";
import { BuiltInLanguage } from "./languages";
import {
  checkExpectedLogMessages,
  createTestConfig,
  initAllState,
  RecordingLogger,
  setupTests,
} from "./testing-utils";

setupTests(test);

type TestFS = FileSystem<
  "existsSync" | "mkdirSync" | "writeFileSync" | "readFileSync" | "renameSync"
>;

function makeStubFS() {
  // The functions in `fs` cannot be stubbed. Create a new, minimal object
  // that we can stub.
  const stubbedFS: TestFS = {
    existsSync: fs.existsSync,
    mkdirSync: fs.mkdirSync,
    writeFileSync: fs.writeFileSync,
    readFileSync: fs.readFileSync,
    renameSync: fs.renameSync,
  };

  const existsSync = sinon.stub(stubbedFS, "existsSync");
  const mkdirSync = sinon.stub(stubbedFS, "mkdirSync");
  const writeFileSync = sinon.stub(stubbedFS, "writeFileSync");
  const readFileSync = sinon.stub(stubbedFS, "readFileSync");
  const renameSync = sinon.stub(stubbedFS, "renameSync");

  return {
    stubbedFS,
    existsSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    renameSync,
  };
}

const id = "codeql-action/test-diagnostic";
const name = "Test title";

test("makeDiagnostic - adds expected properties", (t) => {
  const diagnostic = diagnostics.makeDiagnostic(id, name, {});

  t.truthy(diagnostic.timestamp);
  t.is(diagnostic.source.id, id);
  t.is(diagnostic.source.name, name);
});

test("addDiagnostic writes temporary diagnostics and flushDiagnostics moves them", (t) => {
  const logger = new RecordingLogger();
  const { stubbedFS, existsSync, mkdirSync, writeFileSync, renameSync } =
    makeStubFS();

  let databasePath: fs.PathLike | undefined;
  existsSync.callsFake((p) => {
    databasePath = p;
    return false;
  });

  const diagnostic = diagnostics.makeDiagnostic(id, name, {});
  t.notThrows(() => {
    diagnostics.addDiagnostic(
      createTestConfig({ tempDir: path.resolve("/temp/") }),
      BuiltInLanguage.actions,
      diagnostic,
      logger,
      stubbedFS as FileSystem,
    );
    diagnostics.flushDiagnostics(
      initAllState({ logger, fs: stubbedFS as FileSystem }),
      createTestConfig({
        tempDir: path.resolve("/temp/"),
        dbLocation: path.resolve("/test/database/"),
      }),
    );
  });

  // addDiagnostic
  t.is(existsSync.callCount, 1);
  t.is(mkdirSync.callCount, 1);
  t.is(writeFileSync.callCount, 1);
  t.is(writeFileSync.args[0].length, 2);
  t.is(writeFileSync.args[0][1], JSON.stringify(diagnostic));

  // flushDiagnostics
  t.is(renameSync.callCount, 1);
  t.is(renameSync.args[0].length, 2);

  const sourcePath = renameSync.args[0][0].toString();
  const expectedSourcePathPrefix = path.resolve(
    "/temp/codeql-action-temp-diagnostics/actions/diagnostic/codeql-action/",
  );
  t.true(
    sourcePath.startsWith(expectedSourcePathPrefix),
    `'${sourcePath}' does not start with '${expectedSourcePathPrefix}`,
  );

  const destPath = renameSync.args[0][1].toString();
  const expectedDestPathPrefix = path.resolve(
    "/test/database/actions/diagnostic/codeql-action/",
  );
  t.true(
    destPath.startsWith(expectedDestPathPrefix),
    `'${destPath}' does not start with '${expectedDestPathPrefix}`,
  );

  checkExpectedLogMessages(t, logger.messages, [
    `but the database at ${databasePath} does not exist yet`,
    "Moving 1 diagnostic(s) to their respective databases.",
  ]);
});
