import * as fs from "fs";
import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import { runQueries } from "./analyze";
import { setCodeQL } from "./codeql";
import { Feature } from "./feature-flags";
import { Language } from "./languages";
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

    for (const language of Object.values(Language)) {
      setCodeQL({
        databaseRunQueries: async () => {},
        packDownload: async () => ({ packs: [] }),
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
        config,
        getRunnerLogger(true),
        createFeatures([Feature.QaTelemetryEnabled]),
      );
      t.deepEqual(Object.keys(statusReport).sort(), [
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
