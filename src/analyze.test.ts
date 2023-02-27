import * as fs from "fs";
import * as path from "path";

import test, { ExecutionContext } from "ava";
import * as yaml from "js-yaml";
import * as sinon from "sinon";

import {
  convertPackToQuerySuiteEntry,
  createQuerySuiteContents,
  runQueries,
  validateQueryFilters,
  QueriesStatusReport,
} from "./analyze";
import { CodeQL, setCodeQL } from "./codeql";
import { Config, QueriesWithSearchPath } from "./config-utils";
import { Feature } from "./feature-flags";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import { setupTests, setupActionsVars, createFeatures } from "./testing-utils";
import * as util from "./util";

setupTests(test);

// Checks that the duration fields are populated for the correct language
// and correct case of builtin or custom. Also checks the correct search
// paths are set in the database analyze invocation.
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

    for (const language of Object.values(Language)) {
      setCodeQL({
        packDownload: async () => ({ packs: [] }),
        databaseRunQueries: async (
          _db: string,
          searchPath: string | undefined
        ) => {
          searchPathsUsed.push(searchPath);
        },
        databaseInterpretResults: async (
          _db: string,
          _queriesRun: string[],
          sarifFile: string
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
            })
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
          injectedMlQueries: false,
          packsInputCombines: false,
          queriesInputCombines: false,
        },
        trapCaches: {},
        trapCacheDownloadTime: 0,
      };
      fs.mkdirSync(util.getCodeQLDatabasePath(config, language), {
        recursive: true,
      });

      config.queries[language] = {
        builtin: ["foo.ql"],
        custom: [],
      };
      const builtinStatusReport = await runQueries(
        tmpDir,
        memoryFlag,
        addSnippetsFlag,
        threadsFlag,
        undefined,
        config,
        getRunnerLogger(true),
        createFeatures([])
      );
      const hasPacks = language in packs;
      const statusReportKeys = Object.keys(builtinStatusReport).sort();
      if (hasPacks) {
        t.deepEqual(statusReportKeys.length, 3, statusReportKeys.toString());
        t.deepEqual(
          statusReportKeys[0],
          `analyze_builtin_queries_${language}_duration_ms`
        );
        t.deepEqual(
          statusReportKeys[1],
          `analyze_custom_queries_${language}_duration_ms`
        );
        t.deepEqual(
          statusReportKeys[2],
          `interpret_results_${language}_duration_ms`
        );
      } else {
        t.deepEqual(
          statusReportKeys[0],
          `analyze_builtin_queries_${language}_duration_ms`
        );
        t.deepEqual(
          statusReportKeys[1],
          `interpret_results_${language}_duration_ms`
        );
      }

      config.queries[language] = {
        builtin: [],
        custom: [
          {
            queries: ["foo.ql"],
            searchPath: "/1",
          },
          {
            queries: ["bar.ql"],
            searchPath: "/2",
          },
        ],
      };
      const customStatusReport = await runQueries(
        tmpDir,
        memoryFlag,
        addSnippetsFlag,
        threadsFlag,
        undefined,
        config,
        getRunnerLogger(true),
        createFeatures([])
      );
      t.deepEqual(Object.keys(customStatusReport).length, 2);
      t.true(
        `analyze_custom_queries_${language}_duration_ms` in customStatusReport
      );
      const expectedSearchPathsUsed = hasPacks
        ? [undefined, undefined, "/1", "/2", undefined]
        : [undefined, "/1", "/2"];
      t.deepEqual(searchPathsUsed, expectedSearchPathsUsed);
      t.true(`interpret_results_${language}_duration_ms` in customStatusReport);
    }

    verifyQuerySuites(tmpDir);
  });

  function verifyQuerySuites(tmpDir: string) {
    const qlsContent = [
      {
        query: "foo.ql",
      },
    ];
    const qlsContent2 = [
      {
        query: "bar.ql",
      },
    ];
    for (const lang of Object.values(Language)) {
      t.deepEqual(readContents(`${lang}-queries-builtin.qls`), qlsContent);
      t.deepEqual(readContents(`${lang}-queries-custom-0.qls`), qlsContent);
      t.deepEqual(readContents(`${lang}-queries-custom-1.qls`), qlsContent2);
    }

    function readContents(name: string) {
      const x = fs.readFileSync(
        path.join(tmpDir, "codeql_databases", name),
        "utf8"
      );
      console.log(x);

      return yaml.load(
        fs.readFileSync(path.join(tmpDir, "codeql_databases", name), "utf8")
      );
    }
  }
});

function mockCodeQL(): Partial<CodeQL> {
  return {
    getVersion: async () => "2.12.2",
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
      injectedMlQueries: false,
      packsInputCombines: false,
      queriesInputCombines: false,
    },
    trapCaches: {},
    trapCacheDownloadTime: 0,
  };
}

function createQueryConfig(
  builtin: string[],
  custom: string[]
): { builtin: string[]; custom: QueriesWithSearchPath[] } {
  return {
    builtin,
    custom: custom.map((c) => ({ searchPath: "/search", queries: [c] })),
  };
}

async function runQueriesWithConfig(
  config: Config,
  features: Feature[]
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
    createFeatures(features)
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
    config.queries.cpp = createQueryConfig(["foo.ql"], []);

    await runQueriesWithConfig(config, []);
    t.deepEqual(
      getDatabaseRunQueriesCalls(codeql).map((c) => c.args[4]),
      [true]
    );
  });
});

test("optimizeForLastQueryRun for two languages", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const codeql = mockCodeQL();
    setCodeQL(codeql);
    const config: Config = createBaseConfig(tmpDir);
    config.languages = [Language.cpp, Language.java];
    config.queries.cpp = createQueryConfig(["foo.ql"], []);
    config.queries.java = createQueryConfig(["bar.ql"], []);

    await runQueriesWithConfig(config, []);
    t.deepEqual(
      getDatabaseRunQueriesCalls(codeql).map((c) => c.args[4]),
      [true, true]
    );
  });
});

test("optimizeForLastQueryRun for two languages, with custom queries", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const codeql = mockCodeQL();
    setCodeQL(codeql);
    const config: Config = createBaseConfig(tmpDir);
    config.languages = [Language.cpp, Language.java];
    config.queries.cpp = createQueryConfig(["foo.ql"], ["c1.ql", "c2.ql"]);
    config.queries.java = createQueryConfig(["bar.ql"], ["c3.ql"]);

    await runQueriesWithConfig(config, []);
    t.deepEqual(
      getDatabaseRunQueriesCalls(codeql).map((c) => c.args[4]),
      [false, false, true, false, true]
    );
  });
});

test("optimizeForLastQueryRun for two languages, with custom queries and packs", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const codeql = mockCodeQL();
    setCodeQL(codeql);
    const config: Config = createBaseConfig(tmpDir);
    config.languages = [Language.cpp, Language.java];
    config.queries.cpp = createQueryConfig(["foo.ql"], ["c1.ql", "c2.ql"]);
    config.queries.java = createQueryConfig(["bar.ql"], ["c3.ql"]);
    config.packs.cpp = ["a/cpp-pack1@0.1.0"];
    config.packs.java = ["b/java-pack1@0.2.0", "b/java-pack2@0.3.3"];
    await runQueriesWithConfig(config, []);
    t.deepEqual(
      getDatabaseRunQueriesCalls(codeql).map((c) => c.args[4]),
      [false, false, false, true, false, false, true]
    );
  });
});

test("optimizeForLastQueryRun for one language, CliConfigFileEnabled", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const codeql = mockCodeQL();
    setCodeQL(codeql);
    const config: Config = createBaseConfig(tmpDir);
    config.languages = [Language.cpp];

    await runQueriesWithConfig(config, [Feature.CliConfigFileEnabled]);
    t.deepEqual(
      getDatabaseRunQueriesCalls(codeql).map((c) => c.args[4]),
      [true]
    );
  });
});

test("optimizeForLastQueryRun for two languages, CliConfigFileEnabled", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const codeql = mockCodeQL();
    setCodeQL(codeql);
    const config: Config = createBaseConfig(tmpDir);
    config.languages = [Language.cpp, Language.java];

    await runQueriesWithConfig(config, [Feature.CliConfigFileEnabled]);
    t.deepEqual(
      getDatabaseRunQueriesCalls(codeql).map((c) => c.args[4]),
      [true, true]
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
    { message: /Query filter must have exactly one key/ }
  );

  t.throws(
    () => {
      return validateQueryFilters([{ xxx: "foo" } as any]);
    },
    { message: /Only "include" or "exclude" filters are allowed/ }
  );

  t.throws(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return validateQueryFilters({ exclude: "foo" } as any);
    },
    {
      message:
        /Query filters must be an array of "include" or "exclude" entries/,
    }
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
    ]
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
