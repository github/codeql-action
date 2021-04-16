import * as fs from "fs";
import * as path from "path";

import test from "ava";
import sinon from "sinon";

import { runQueries } from "./analyze";
import { setCodeQL } from "./codeql";
import { Config } from "./config-utils";
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
  const mockLinesOfCode = Object.entries(Language).reduce((obj, [lang], i) => {
    // use a different line count for each languaged
    obj[lang] = i + 1;
    return obj;
  }, {});
  sinon.stub(count, "countLoc").resolves(mockLinesOfCode);
  let searchPathsUsed: string[] = [];
  return await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const memoryFlag = "";
    const addSnippetsFlag = "";
    const threadsFlag = "";

    for (const language of Object.values(Language)) {
      setCodeQL({
        databaseAnalyze: async (
          _,
          sarifFile: string,
          searchPath: string | undefined
        ) => {
          fs.writeFileSync(
            sarifFile,
            JSON.stringify({
              runs: [
                // variant 1 uses metricId
                {
                  properties: {
                    metricResults: [
                      {
                        metricId: `${language}/summary/lines-of-code`,
                        value: 123,
                      },
                    ],
                  },
                },
                // variant 2 uses metric.id
                {
                  properties: {
                    metricResults: [
                      {
                        metric: {
                          id: `${language}/summary/lines-of-code`,
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
          searchPathsUsed.push(searchPath!);
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
      };
      fs.mkdirSync(util.getCodeQLDatabasePath(config.tempDir, language), {
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
        config,
        getRunnerLogger(true)
      );
      t.deepEqual(Object.keys(builtinStatusReport).length, 1);
      t.true(
        `analyze_builtin_queries_${language}_duration_ms` in builtinStatusReport
      );

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
        config,
        getRunnerLogger(true)
      );
      t.deepEqual(Object.keys(customStatusReport).length, 1);
      t.true(
        `analyze_custom_queries_${language}_duration_ms` in customStatusReport
      );
      t.deepEqual(searchPathsUsed, [undefined, "/1", "/2"]);
    }

    verifyLineCounts(tmpDir);
  });

  function verifyLineCounts(tmpDir: string) {
    // eslint-disable-next-line github/array-foreach
    Object.keys(Language).forEach((lang, i) => {
      verifyLineCountForFile(
        lang,
        path.join(tmpDir, `${lang}-builtin.sarif`),
        i + 1
      );
      verifyLineCountForFile(
        lang,
        path.join(tmpDir, `${lang}-custom.sarif`),
        i + 1
      );
    });
  }

  function verifyLineCountForFile(
    lang: string,
    filePath: string,
    lineCount: number
  ) {
    const sarif = JSON.parse(fs.readFileSync(filePath, "utf8"));
    t.deepEqual(sarif.runs[0].properties.metricResults, [
      {
        metricId: `${lang}/summary/lines-of-code`,
        value: 123,
        baseline: lineCount,
      },
    ]);
    t.deepEqual(sarif.runs[1].properties.metricResults, [
      {
        metric: {
          id: `${lang}/summary/lines-of-code`,
        },
        value: 123,
        baseline: lineCount,
      },
    ]);
    // when the metric doesn't exists, it should not be added
    t.deepEqual(sarif.runs[2].properties.metricResults, []);
  }
});
