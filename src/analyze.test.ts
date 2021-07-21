import * as fs from "fs";
import * as path from "path";

import test from "ava";
import * as yaml from "js-yaml";
import { clean } from "semver";
import sinon from "sinon";

import { runQueries } from "./analyze";
import { setCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { getIdPrefix } from "./count-loc";
import * as count from "./count-loc";
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
      [Language.cpp]: [
        {
          packName: "a/b",
          version: clean("1.0.0")!,
        },
      ],
      [Language.java]: [
        {
          packName: "c/d",
          version: clean("2.0.0")!,
        },
      ],
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
                // variant 1 uses ruleId
                {
                  properties: {
                    metricResults: [
                      {
                        ruleId: `${getIdPrefix(
                          language
                        )}/summary/lines-of-code`,
                        value: 123,
                      },
                    ],
                  },
                },
                // variant 2 uses rule.id
                {
                  properties: {
                    metricResults: [
                      {
                        rule: {
                          id: `${getIdPrefix(language)}/summary/lines-of-code`,
                        },
                        value: 123,
                      },
                    ],
                  },
                },
                // variant 3 references a rule with the lines-of-code tag
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
        toolCacheDir: tmpDir,
        codeQLCmd: "",
        gitHubVersion: {
          type: util.GitHubVariant.DOTCOM,
        } as util.GitHubVersion,
        dbLocation: path.resolve(tmpDir, "codeql_databases"),
        packs,
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
      verifyLineCountForFile(
        lang as Language,
        path.join(tmpDir, `${lang}.sarif`),
        i + 1
      );
    });
  }

  function verifyLineCountForFile(
    lang: Language,
    filePath: string,
    lineCount: number
  ) {
    const idPrefix = getIdPrefix(lang);
    const sarif = JSON.parse(fs.readFileSync(filePath, "utf8"));
    t.deepEqual(sarif.runs[0].properties.metricResults, [
      {
        ruleId: `${idPrefix}/summary/lines-of-code`,
        value: 123,
        baseline: lineCount,
      },
    ]);
    t.deepEqual(sarif.runs[1].properties.metricResults, [
      {
        rule: {
          id: `${idPrefix}/summary/lines-of-code`,
        },
        value: 123,
        baseline: lineCount,
      },
    ]);
    t.deepEqual(sarif.runs[2].properties.metricResults, [
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
    t.deepEqual(sarif.runs[3].properties.metricResults, []);
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
    const qlsPackContentCpp = [
      {
        qlpack: "a/b",
        version: "1.0.0",
      },
    ];
    const qlsPackContentJava = [
      {
        qlpack: "c/d",
        version: "2.0.0",
      },
    ];
    for (const lang of Object.values(Language)) {
      t.deepEqual(readContents(`${lang}-queries-builtin.qls`), qlsContent);
      t.deepEqual(readContents(`${lang}-queries-custom-0.qls`), qlsContent);
      t.deepEqual(readContents(`${lang}-queries-custom-1.qls`), qlsContent2);
      const packSuiteName = `${lang}-queries-packs.qls`;
      if (lang === Language.cpp) {
        t.deepEqual(readContents(packSuiteName), qlsPackContentCpp);
      } else if (lang === Language.java) {
        t.deepEqual(readContents(packSuiteName), qlsPackContentJava);
      } else {
        t.false(
          fs.existsSync(path.join(tmpDir, "codeql_databases", packSuiteName))
        );
      }
    }

    function readContents(name: string) {
      const x = fs.readFileSync(
        path.join(tmpDir, "codeql_databases", name),
        "utf8"
      );
      console.log(x);

      return yaml.safeLoad(
        fs.readFileSync(path.join(tmpDir, "codeql_databases", name), "utf8")
      );
    }
  }
});
