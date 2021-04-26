import * as fs from "fs";

import test from "ava";

import { runQueries } from "./analyze";
import { setCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import { setupTests, setupActionsVars } from "./testing-utils";
import * as util from "./util";

setupTests(test);

// Checks that the duration fields are populated for the correct language
// and correct case of builtin or custom. Also checks the correct search
// paths are set in the database analyze invocation.
test("status report fields and search path setting", async (t) => {
  let searchPathsUsed: string[] = [];
  return await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    setCodeQL({
      databaseAnalyze: async (
        _,
        sarifFile: string,
        searchPath: string | undefined
      ) => {
        fs.writeFileSync(
          sarifFile,
          JSON.stringify({
            runs: [],
          })
        );
        searchPathsUsed.push(searchPath!);
      },
    });

    const memoryFlag = "";
    const addSnippetsFlag = "";
    const threadsFlag = "";

    for (const language of Object.values(Language)) {
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
  });
});
