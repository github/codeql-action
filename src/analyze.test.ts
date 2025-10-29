import * as fs from "fs";
import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import { CodeQuality, CodeScanning } from "./analyses";
import {
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
