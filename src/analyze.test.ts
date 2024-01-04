import * as fs from "fs";
import * as path from "path";

import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import {
  convertPackToQuerySuiteEntry,
  createQuerySuiteContents,
  runQueries,
  validateQueryFilters,
  QueriesStatusReport,
} from "./analyze";
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

/** Checks that the duration fields are populated for the correct language
 * and correct case of builtin or custom. Also checks the correct search
 * paths are set in the database analyze invocation.
 *
 * Mocks the QA telemetry feature flag and checks the appropriate status report
 * fields.
 */
test("status report fields and search path setting", async (t) => {
  let searchPathsUsed: Array<string | undefined> = [];
  return await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const memoryFlag = "";
    const addSnippetsFlag = "";
    const threadsFlag = "";
    const packs = {
      [Language.cpp]: ["a/b@1.0.0"],
      [Language.java]: ["c/d@2.0.0"],
    };

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
        queries: {},
        pathsIgnore: [],
        paths: [],
        originalUserInput: {},
        tempDir: tmpDir,
        codeQLCmd: "",
        gitHubVersion: {
          type: util.GitHubVariant.DOTCOM,
        } as util.GitHubVersion,
        dbLocation: path.resolve(tmpDir, "codeql_databases"),
        packs,
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

      const builtinStatusReport = await runQueries(
        tmpDir,
        memoryFlag,
        addSnippetsFlag,
        threadsFlag,
        undefined,
        config,
        getRunnerLogger(true),
        createFeatures([Feature.QaTelemetryEnabled]),
      );
      t.deepEqual(Object.keys(builtinStatusReport).sort(), [
        `analyze_builtin_queries_${language}_duration_ms`,
        "event_reports",
        `interpret_results_${language}_duration_ms`,
      ]);
      for (const eventReport of builtinStatusReport.event_reports!) {
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
    queries: {},
    pathsIgnore: [],
    paths: [],
    originalUserInput: {},
    tempDir: "tempDir",
    codeQLCmd: "",
    gitHubVersion: {
      type: util.GitHubVariant.DOTCOM,
    } as util.GitHubVersion,
    dbLocation: path.resolve(tmpDir, "codeql_databases"),
    packs: {},
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

test("validateQueryFilters", (t) => {
  t.notThrows(() => validateQueryFilters([]));
  t.notThrows(() => validateQueryFilters(undefined));
  t.notThrows(() => {
    return validateQueryFilters([
      {
        exclude: {
          "problem.severity": "recommendation",
        },
      },
      {
        exclude: {
          "tags contain": ["foo", "bar"],
        },
      },
      {
        include: {
          "problem.severity": "something-to-think-about",
        },
      },
      {
        include: {
          "tags contain": ["baz", "bop"],
        },
      },
    ]);
  });

  t.throws(
    () => {
      return validateQueryFilters([
        {
          exclude: {
            "tags contain": ["foo", "bar"],
          },
          include: {
            "tags contain": ["baz", "bop"],
          },
        },
      ]);
    },
    { message: /Query filter must have exactly one key/ },
  );

  t.throws(
    () => {
      return validateQueryFilters([{ xxx: "foo" } as any]);
    },
    { message: /Only "include" or "exclude" filters are allowed/ },
  );

  t.throws(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return validateQueryFilters({ exclude: "foo" } as any);
    },
    {
      message:
        /Query filters must be an array of "include" or "exclude" entries/,
    },
  );
});

const convertPackToQuerySuiteEntryMacro = test.macro({
  exec: (t: ExecutionContext<unknown>, packSpec: string, suiteEntry: any) =>
    t.deepEqual(convertPackToQuerySuiteEntry(packSpec), suiteEntry),

  title: (_providedTitle, packSpec: string) => `Query Suite Entry: ${packSpec}`,
});

test(convertPackToQuerySuiteEntryMacro, "a/b", {
  qlpack: "a/b",
  from: undefined,
  version: undefined,
  query: undefined,
  queries: undefined,
  apply: undefined,
});

test(convertPackToQuerySuiteEntryMacro, "a/b@~1.2.3", {
  qlpack: "a/b",
  from: undefined,
  version: "~1.2.3",
  query: undefined,
  queries: undefined,
  apply: undefined,
});

test(convertPackToQuerySuiteEntryMacro, "a/b:my/path", {
  qlpack: undefined,
  from: "a/b",
  version: undefined,
  query: undefined,
  queries: "my/path",
  apply: undefined,
});

test(convertPackToQuerySuiteEntryMacro, "a/b@~1.2.3:my/path", {
  qlpack: undefined,
  from: "a/b",
  version: "~1.2.3",
  query: undefined,
  queries: "my/path",
  apply: undefined,
});

test(convertPackToQuerySuiteEntryMacro, "a/b:my/path/query.ql", {
  qlpack: undefined,
  from: "a/b",
  version: undefined,
  query: "my/path/query.ql",
  queries: undefined,
  apply: undefined,
});

test(convertPackToQuerySuiteEntryMacro, "a/b@~1.2.3:my/path/query.ql", {
  qlpack: undefined,
  from: "a/b",
  version: "~1.2.3",
  query: "my/path/query.ql",
  queries: undefined,
  apply: undefined,
});

test(convertPackToQuerySuiteEntryMacro, "a/b:my/path/suite.qls", {
  qlpack: undefined,
  from: "a/b",
  version: undefined,
  query: undefined,
  queries: undefined,
  apply: "my/path/suite.qls",
});

test(convertPackToQuerySuiteEntryMacro, "a/b@~1.2.3:my/path/suite.qls", {
  qlpack: undefined,
  from: "a/b",
  version: "~1.2.3",
  query: undefined,
  queries: undefined,
  apply: "my/path/suite.qls",
});

test("convertPackToQuerySuiteEntry Failure", (t) => {
  t.throws(() => convertPackToQuerySuiteEntry("this-is-not-a-pack"));
});

test("createQuerySuiteContents", (t) => {
  const yamlResult = createQuerySuiteContents(
    ["query1.ql", "query2.ql"],
    [
      {
        exclude: { "problem.severity": "recommendation" },
      },
      {
        include: { "problem.severity": "recommendation" },
      },
    ],
  );
  const expected = `- query: query1.ql
- query: query2.ql
- exclude:
    problem.severity: recommendation
- include:
    problem.severity: recommendation
`;

  t.deepEqual(yamlResult, expected);
});
