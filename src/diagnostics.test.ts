import * as fs from "fs";
import path from "path";

import test, { type ExecutionContext } from "ava";

import * as diagnostics from "./diagnostics";
import { BuiltInLanguage } from "./languages";
import {
  checkExpectedLogMessages,
  createTestConfig,
  initAllState,
  RecordingLogger,
  setupTests,
} from "./testing-utils";
import { withTmpDir } from "./util";

setupTests(test);

const id = "codeql-action/test-diagnostic";
const name = "Test title";

test("makeDiagnostic - adds expected properties", (t) => {
  const diagnostic = diagnostics.makeDiagnostic(id, name, {});

  t.truthy(diagnostic.timestamp);
  t.is(diagnostic.source.id, id);
  t.is(diagnostic.source.name, name);
});

test("getLanguageDiagnosticsPath gets language-specific path", async (t) =>
  withTmpDir(async (tmpDir) => {
    for (const language of Object.values(BuiltInLanguage)) {
      t.is(
        diagnostics.getLanguageDiagnosticsPath(tmpDir, language),
        path.resolve(
          tmpDir,
          language,
          ...diagnostics.CODEQL_ACTION_DIAGNOSTIC_SUBDIR_PARTS,
        ),
      );
    }
  }));

test("getTempLanguageDiagnosticsPath returns path without language", async (t) =>
  withTmpDir(async (tmpDir) => {
    t.is(
      diagnostics.getTempLanguageDiagnosticsPath(tmpDir),
      path.resolve(
        tmpDir,
        diagnostics.TEMP_DIAGNOSTIC_DIR_NAME,
        ...diagnostics.CODEQL_ACTION_DIAGNOSTIC_SUBDIR_PARTS,
      ),
    );
  }));

test("getTempLanguageDiagnosticsPath returns language-specific path if a language is provided", async (t) =>
  withTmpDir(async (tmpDir) => {
    t.is(
      diagnostics.getTempLanguageDiagnosticsPath(tmpDir, BuiltInLanguage.swift),
      path.resolve(
        tmpDir,
        diagnostics.TEMP_DIAGNOSTIC_DIR_NAME,
        BuiltInLanguage.swift,
        ...diagnostics.CODEQL_ACTION_DIAGNOSTIC_SUBDIR_PARTS,
      ),
    );
  }));

test("getDatabaseDiagnosticsPath returns language-specific path", async (t) =>
  withTmpDir(async (tmpDir) => {
    t.is(
      diagnostics.getDatabaseDiagnosticsPath(
        createTestConfig({ dbLocation: tmpDir }),
        BuiltInLanguage.swift,
      ),
      path.resolve(
        tmpDir,
        BuiltInLanguage.swift,
        ...diagnostics.CODEQL_ACTION_DIAGNOSTIC_SUBDIR_PARTS,
      ),
    );
  }));

/**
 * Diagnostic files that are written to disk don't have deterministic names.
 * This function recursively finds all `.json` files at {@link rootPath},
 * asserts that there is exactly one, and that it matches {@link expected}.
 *
 * @param rootPath The path to start searching from.
 */
function assertSingleDiagnosticIn(
  t: ExecutionContext<unknown>,
  rootPath: string,
  expected: diagnostics.DiagnosticMessage,
) {
  // Find all `.json` files in `rootPath` and check that there is exactly one.
  const filePaths = fs
    .readdirSync(rootPath, {
      recursive: true,
      encoding: "utf-8",
    })
    .filter((p) => p.endsWith(".json"));

  t.is(filePaths.length, 1);

  // Check that the written diagnostic matches the one we added.
  const contents = fs.readFileSync(
    path.resolve(rootPath, filePaths[0]),
    "utf-8",
  );

  const readDiagnostic = JSON.parse(contents) as diagnostics.DiagnosticMessage;
  t.deepEqual(readDiagnostic, expected);
}

test("addDiagnostic writes temporary diagnostics and flushDiagnostics moves them to the database", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();

    const tempDiagDir = path.resolve(tmpDir, "temp");
    const testDbDir = path.resolve(tmpDir, "test", "database");
    const diagnostic = diagnostics.makeDiagnostic(id, name, {});

    // Write the diagnostic. The path provided for `dbLocation` doesn't exist,
    // so the diagnostic will be written to a temporary location.
    t.notThrows(() => {
      diagnostics.addDiagnostic(
        createTestConfig({ tempDir: tempDiagDir, dbLocation: testDbDir }),
        BuiltInLanguage.actions,
        diagnostic,
        logger,
      );
    });

    // Check that `tempDiagDir` was created.
    t.true(fs.existsSync(tempDiagDir));

    // Check that the diagnostic exists under `tempDiagDir`.
    assertSingleDiagnosticIn(t, tempDiagDir, diagnostic);

    // Flush the diagnostics. This will cause the diagnostic we wrote previously to
    // be moved to a location under `dbLocation`.
    t.notThrows(() => {
      diagnostics.flushDiagnostics(
        initAllState({ logger }),
        createTestConfig({
          tempDir: tempDiagDir,
          dbLocation: testDbDir,
        }),
      );
    });

    // Check that `testDbDir` was created.
    t.true(fs.existsSync(testDbDir));

    // Check that the diagnostic exists under `testDbDir`.
    assertSingleDiagnosticIn(t, testDbDir, diagnostic);

    // Check that we logged that the database directory doesn't exist yet
    // and that we moved one diagnostic.
    checkExpectedLogMessages(t, logger.messages, [
      `but the database at ${path.join(testDbDir, "actions")} does not exist yet`,
      "Moving 1 diagnostic(s) to their respective databases.",
    ]);
  }));
