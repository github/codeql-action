import * as fs from "fs";
import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import { runQueries, QueriesStatusReport } from "./analyze";
import { CodeQL, setCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { Feature } from "./feature-flags";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import {
  setupTests,
  setupActionsVars,
  createFeatures,
  makeVersionInfo,
} from "./testing-utils";
import * as uploadLib from "./upload-lib";
import * as util from "./util";

setupTests(test);

/**
 * Checks that the duration fields are populated for the correct language. Also checks the correct
 * search paths are set in the database analyze invocation.
 *
 * Mocks the QA telemetry feature flag and checks the appropriate status report fields.
 */
test("status report fields and search path setting", async (t) => {
  let searchPathsUsed: Array<string | undefined> = [];
  return await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const memoryFlag = "";
    const addSnippetsFlag = "";
    const threadsFlag = "";
    sinon.stub(uploadLib, "validateSarifFileSchema");

    for (const language of Object.values(Language)) {
      setCodeQL({
        packDownload: async () => ({ packs: [] }),
        databaseRunQueries: async (
          _db: string,
          searchPath: string | undefined,
        ) => {
          searchPathsUsed.push(searchPath);
        },
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

      searchPathsUsed = [];
      const config: Config = {
        languages: [language],
        originalUserInput: {},
        tempDir: tmpDir,
        codeQLCmd: "",
        gitHubVersion: {
          type: util.GitHubVariant.DOTCOM,
        } as util.GitHubVersion,
        dbLocation: path.resolve(tmpDir, "codeql_databases"),
        debugMode: false,
        debugArtifactName: util.DEFAULT_DEBUG_ARTIFACT_NAME,
        debugDatabaseName: util.DEFAULT_DEBUG_DATABASE_NAME,
        augmentationProperties: {
          packsInputCombines: false,
          queriesInputCombines: false,
        },
        trapCaches: {},
        trapCacheDownloadTime: 0,
      };
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

function mockCodeQL(): Partial<CodeQL> {
  return {
    getVersion: async () => makeVersionInfo("1.0.0"),
    databaseRunQueries: sinon.spy(),
    databaseInterpretResults: async () => "",
    databasePrintBaseline: async () => "",
  };
}

function createBaseConfig(tmpDir: string): Config {
  return {
    languages: [],
    originalUserInput: {},
    tempDir: "tempDir",
    codeQLCmd: "",
    gitHubVersion: {
      type: util.GitHubVariant.DOTCOM,
    } as util.GitHubVersion,
    dbLocation: path.resolve(tmpDir, "codeql_databases"),
    debugMode: false,
    debugArtifactName: util.DEFAULT_DEBUG_ARTIFACT_NAME,
    debugDatabaseName: util.DEFAULT_DEBUG_DATABASE_NAME,
    augmentationProperties: {
      packsInputCombines: false,
      queriesInputCombines: false,
    },
    trapCaches: {},
    trapCacheDownloadTime: 0,
  };
}

async function runQueriesWithConfig(
  config: Config,
  features: Feature[],
): Promise<QueriesStatusReport> {
  for (const language of config.languages) {
    fs.mkdirSync(util.getCodeQLDatabasePath(config, language), {
      recursive: true,
    });
  }
  return runQueries(
    "sarif-folder",
    "--memFlag",
    "--addSnippetsFlag",
    "--threadsFlag",
    undefined,
    config,
    getRunnerLogger(true),
    createFeatures(features),
  );
}

function getDatabaseRunQueriesCalls(mock: Partial<CodeQL>) {
  return (mock.databaseRunQueries as sinon.SinonSpy).getCalls();
}

test("optimizeForLastQueryRun for one language", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const codeql = mockCodeQL();
    setCodeQL(codeql);
    const config: Config = createBaseConfig(tmpDir);
    config.languages = [Language.cpp];

    await runQueriesWithConfig(config, []);
    t.deepEqual(
      getDatabaseRunQueriesCalls(codeql).map((c) => c.args[4]),
      [true],
    );
  });
});

test("optimizeForLastQueryRun for two languages", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const codeql = mockCodeQL();
    setCodeQL(codeql);
    const config: Config = createBaseConfig(tmpDir);
    config.languages = [Language.cpp, Language.java];

    await runQueriesWithConfig(config, []);
    t.deepEqual(
      getDatabaseRunQueriesCalls(codeql).map((c) => c.args[4]),
      [true, true],
    );
  });
});
