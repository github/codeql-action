import * as fs from "fs";
import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { CodeQuality, CodeScanning } from "./analyses";
import {
  exportedForTesting,
  runQueries,
  defaultSuites,
  resolveQuerySuiteAlias,
  addSarifExtension,
} from "./analyze";
import { createStubCodeQL } from "./codeql";
import { Feature } from "./feature-flags";
import { KnownLanguage } from "./languages";
import { getRunnerLogger } from "./logging";
import {
  setupTests,
  setupActionsVars,
  createFeatures,
  createTestConfig,
} from "./testing-utils";
import * as uploadLib from "./upload-lib";
import * as util from "./util";

setupTests(test);

/**
 * Checks the status report produced by the analyze Action.
 *
 * - Checks that the duration fields are populated for the correct language.
 * - Checks that the QA telemetry status report fields are populated when the QA feature flag is enabled.
 */
test("status report fields", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const memoryFlag = "";
    const addSnippetsFlag = "";
    const threadsFlag = "";
    sinon.stub(uploadLib, "validateSarifFileSchema");

    for (const language of Object.values(KnownLanguage)) {
      const codeql = createStubCodeQL({
        databaseRunQueries: async () => {},
        databaseInterpretResults: async (
          _db: string,
          _queriesRun: string[],
          sarifFile: string,
        ) => {
          fs.writeFileSync(
            sarifFile,
            JSON.stringify({
              runs: [
                // references a rule with the lines-of-code tag, so baseline should be injected
                {
                  tool: {
                    extensions: [
                      {
                        rules: [
                          {
                            properties: {
                              tags: ["lines-of-code"],
                            },
                          },
                        ],
                      },
                    ],
                  },
                  properties: {
                    metricResults: [
                      {
                        rule: {
                          index: 0,
                          toolComponent: {
                            index: 0,
                          },
                        },
                        value: 123,
                      },
                    ],
                  },
                },
                {},
              ],
            }),
          );
          return "";
        },
        databasePrintBaseline: async () => "",
      });

      const config = createTestConfig({
        languages: [language],
        tempDir: tmpDir,
        dbLocation: path.resolve(tmpDir, "codeql_databases"),
      });
      fs.mkdirSync(util.getCodeQLDatabasePath(config, language), {
        recursive: true,
      });

      const statusReport = await runQueries(
        tmpDir,
        memoryFlag,
        addSnippetsFlag,
        threadsFlag,
        undefined,
        undefined,
        codeql,
        config,
        getRunnerLogger(true),
        createFeatures([Feature.QaTelemetryEnabled]),
      );
      t.deepEqual(Object.keys(statusReport).sort(), [
        "analysis_builds_overlay_base_database",
        "analysis_is_diff_informed",
        "analysis_is_overlay",
        `analyze_builtin_queries_${language}_duration_ms`,
        "event_reports",
        `interpret_results_${language}_duration_ms`,
      ]);
      for (const eventReport of statusReport.event_reports!) {
        t.deepEqual(eventReport.event, "codeql database interpret-results");
        t.true("properties" in eventReport);
        t.true("alertCounts" in eventReport.properties!);
      }
    }
  });
});

function runGetDiffRanges(changes: number, patch: string[] | undefined): any {
  sinon
    .stub(actionsUtil, "getRequiredInput")
    .withArgs("checkout_path")
    .returns("/checkout/path");
  return exportedForTesting.getDiffRanges(
    {
      filename: "test.txt",
      changes,
      patch: patch?.join("\n"),
    },
    getRunnerLogger(true),
  );
}

test("getDiffRanges: file unchanged", async (t) => {
  const diffRanges = runGetDiffRanges(0, undefined);
  t.deepEqual(diffRanges, []);
});

test("getDiffRanges: file diff too large", async (t) => {
  const diffRanges = runGetDiffRanges(1000000, undefined);
  t.deepEqual(diffRanges, [
    {
      path: "/checkout/path/test.txt",
      startLine: 0,
      endLine: 0,
    },
  ]);
});

test("getDiffRanges: diff thunk with single addition range", async (t) => {
  const diffRanges = runGetDiffRanges(2, [
    "@@ -30,6 +50,8 @@",
    " a",
    " b",
    " c",
    "+1",
    "+2",
    " d",
    " e",
    " f",
  ]);
  t.deepEqual(diffRanges, [
    {
      path: "/checkout/path/test.txt",
      startLine: 53,
      endLine: 54,
    },
  ]);
});

test("getDiffRanges: diff thunk with single deletion range", async (t) => {
  const diffRanges = runGetDiffRanges(2, [
    "@@ -30,8 +50,6 @@",
    " a",
    " b",
    " c",
    "-1",
    "-2",
    " d",
    " e",
    " f",
  ]);
  t.deepEqual(diffRanges, []);
});

test("getDiffRanges: diff thunk with single update range", async (t) => {
  const diffRanges = runGetDiffRanges(2, [
    "@@ -30,7 +50,7 @@",
    " a",
    " b",
    " c",
    "-1",
    "+2",
    " d",
    " e",
    " f",
  ]);
  t.deepEqual(diffRanges, [
    {
      path: "/checkout/path/test.txt",
      startLine: 53,
      endLine: 53,
    },
  ]);
});

test("getDiffRanges: diff thunk with addition ranges", async (t) => {
  const diffRanges = runGetDiffRanges(2, [
    "@@ -30,7 +50,9 @@",
    " a",
    " b",
    " c",
    "+1",
    " c",
    "+2",
    " d",
    " e",
    " f",
  ]);
  t.deepEqual(diffRanges, [
    {
      path: "/checkout/path/test.txt",
      startLine: 53,
      endLine: 53,
    },
    {
      path: "/checkout/path/test.txt",
      startLine: 55,
      endLine: 55,
    },
  ]);
});

test("getDiffRanges: diff thunk with mixed ranges", async (t) => {
  const diffRanges = runGetDiffRanges(2, [
    "@@ -30,7 +50,7 @@",
    " a",
    " b",
    " c",
    "-1",
    " d",
    "-2",
    "+3",
    " e",
    " f",
    "+4",
    "+5",
    " g",
    " h",
    " i",
  ]);
  t.deepEqual(diffRanges, [
    {
      path: "/checkout/path/test.txt",
      startLine: 54,
      endLine: 54,
    },
    {
      path: "/checkout/path/test.txt",
      startLine: 57,
      endLine: 58,
    },
  ]);
});

test("getDiffRanges: multiple diff thunks", async (t) => {
  const diffRanges = runGetDiffRanges(2, [
    "@@ -30,6 +50,8 @@",
    " a",
    " b",
    " c",
    "+1",
    "+2",
    " d",
    " e",
    " f",
    "@@ -130,6 +150,8 @@",
    " a",
    " b",
    " c",
    "+1",
    "+2",
    " d",
    " e",
    " f",
  ]);
  t.deepEqual(diffRanges, [
    {
      path: "/checkout/path/test.txt",
      startLine: 53,
      endLine: 54,
    },
    {
      path: "/checkout/path/test.txt",
      startLine: 153,
      endLine: 154,
    },
  ]);
});

test("getDiffRanges: no diff context lines", async (t) => {
  const diffRanges = runGetDiffRanges(2, ["@@ -30 +50,2 @@", "+1", "+2"]);
  t.deepEqual(diffRanges, [
    {
      path: "/checkout/path/test.txt",
      startLine: 50,
      endLine: 51,
    },
  ]);
});

test("getDiffRanges: malformed thunk header", async (t) => {
  const diffRanges = runGetDiffRanges(2, ["@@ 30 +50,2 @@", "+1", "+2"]);
  t.deepEqual(diffRanges, undefined);
});

test("resolveQuerySuiteAlias", (t) => {
  // default query suite names should resolve to something language-specific ending in `.qls`.
  for (const suite of defaultSuites) {
    const resolved = resolveQuerySuiteAlias(KnownLanguage.go, suite);
    t.assert(
      path.extname(resolved) === ".qls",
      "Resolved default suite doesn't end in .qls",
    );
    t.assert(
      resolved.indexOf(KnownLanguage.go) >= 0,
      "Resolved default suite doesn't contain language name",
    );
  }

  // other inputs should be returned unchanged
  const names = ["foo", "bar", "codeql/go-queries@1.0"];

  for (const name of names) {
    t.deepEqual(resolveQuerySuiteAlias(KnownLanguage.go, name), name);
  }
});

test("addSarifExtension", (t) => {
  for (const language of Object.values(KnownLanguage)) {
    t.deepEqual(addSarifExtension(CodeScanning, language), `${language}.sarif`);
    t.deepEqual(
      addSarifExtension(CodeQuality, language),
      `${language}.quality.sarif`,
    );
  }
});
