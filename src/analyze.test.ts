import * as fs from "fs";
import * as path from "path";

import test, { ExecutionContext } from "ava";
import * as yaml from "js-yaml";
import * as sinon from "sinon";

import {
  convertPackToQuerySuiteEntry,
  createdDBForScannedLanguages,
  createQuerySuiteContents,
  runQueries,
  validateQueryFilters,
} from "./analyze";
import { setCodeQL, getCodeQLForTesting } from "./codeql";
import { stubToolRunnerConstructor } from "./codeql.test";
import { Config } from "./config-utils";
import * as count from "./count-loc";
import { createFeatureFlags, FeatureFlag } from "./feature-flags";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import { setupTests, setupActionsVars } from "./testing-utils";
import * as util from "./util";

setupTests(test);

// Checks that the duration fields are populated for the correct language
// and correct case of builtin or custom. Also checks the correct search
// paths are set in the database analyze invocation.
test("status report fields and search path setting", async (t) => {
  const mockLinesOfCode = Object.values(Language).reduce((obj, lang, i) => {
    // use a different line count for each language
    obj[lang] = i + 1;
    return obj;
  }, {});
  sinon.stub(count, "countLoc").resolves(mockLinesOfCode);
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
        getRunnerLogger(true)
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
        getRunnerLogger(true)
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

    verifyLineCounts(tmpDir);
    verifyQuerySuites(tmpDir);
  });

  function verifyLineCounts(tmpDir: string) {
    // eslint-disable-next-line github/array-foreach
    Object.keys(Language).forEach((lang, i) => {
      verifyLineCountForFile(path.join(tmpDir, `${lang}.sarif`), i + 1);
    });
  }

  function verifyLineCountForFile(filePath: string, lineCount: number) {
    const sarif = JSON.parse(fs.readFileSync(filePath, "utf8"));
    t.deepEqual(sarif.runs[0].properties.metricResults, [
      {
        rule: {
          index: 0,
          toolComponent: {
            index: 0,
          },
        },
        value: 123,
        baseline: lineCount,
      },
    ]);
    // when the rule doesn't exist, it should not be added
    t.deepEqual(sarif.runs[1].properties.metricResults, []);
  }

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

const stubConfig: Config = {
  languages: [Language.cpp, Language.go],
  queries: {},
  pathsIgnore: [],
  paths: [],
  originalUserInput: {},
  tempDir: "",
  codeQLCmd: "",
  gitHubVersion: {
    type: util.GitHubVariant.DOTCOM,
  } as util.GitHubVersion,
  dbLocation: "",
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
};

for (const options of [
  {
    name: "Lua feature flag enabled, but old CLI",
    version: "2.9.0",
    featureFlags: [FeatureFlag.LuaTracerConfigEnabled],
    yesFlagSet: false,
    noFlagSet: false,
  },
  {
    name: "Lua feature flag disabled, with old CLI",
    version: "2.9.0",
    featureFlags: [],
    yesFlagSet: false,
    noFlagSet: false,
  },
  {
    name: "Lua feature flag enabled, with new CLI",
    version: "2.10.0",
    featureFlags: [FeatureFlag.LuaTracerConfigEnabled],
    yesFlagSet: true,
    noFlagSet: false,
  },
  {
    name: "Lua feature flag disabled, with new CLI",
    version: "2.10.0",
    featureFlags: [],
    yesFlagSet: false,
    noFlagSet: true,
  },
]) {
  test(`createdDBForScannedLanguages() ${options.name}`, async (t) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await getCodeQLForTesting("codeql/for-testing");
    sinon.stub(codeqlObject, "getVersion").resolves(options.version);

    const promise = createdDBForScannedLanguages(
      codeqlObject,
      stubConfig,
      getRunnerLogger(true),
      createFeatureFlags(options.featureFlags)
    );
    // call listener on `codeql resolve extractor`
    const mockToolRunner = runnerConstructorStub.getCall(0);
    mockToolRunner.args[2].listeners.stdout('"/path/to/extractor"');
    await promise;
    if (options.yesFlagSet)
      t.true(
        runnerConstructorStub.secondCall.args[1].includes(
          "--internal-use-lua-tracing"
        ),
        "--internal-use-lua-tracing should be present, but it is absent"
      );
    else
      t.false(
        runnerConstructorStub.secondCall.args[1].includes(
          "--internal-use-lua-tracing"
        ),
        "--internal-use-lua-tracing should be absent, but it is present"
      );
    if (options.noFlagSet)
      t.true(
        runnerConstructorStub.secondCall.args[1].includes(
          "--no-internal-use-lua-tracing"
        ),
        "--no-internal-use-lua-tracing should be present, but it is absent"
      );
    else
      t.false(
        runnerConstructorStub.secondCall.args[1].includes(
          "--no-internal-use-lua-tracing"
        ),
        "--no-internal-use-lua-tracing should be absent, but it is present"
      );
  });
}
