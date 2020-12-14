import * as fs from "fs";

import test from "ava";

import { runQueries } from "./analyze";
import { setCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import { setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

// Checks that the duration fields are populated for the correct language
// and correct case of builtin or custom.
test("status report fields", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    setCodeQL({
      databaseAnalyze: async () => undefined,
    });

    const memoryFlag = "";
    const addSnippetsFlag = "";
    const threadsFlag = "";

    for (const language of Object.values(Language)) {
      const config: Config = {
        languages: [language],
        queries: {},
        pathsIgnore: [],
        paths: [],
        originalUserInput: {},
        tempDir: tmpDir,
        toolCacheDir: tmpDir,
        codeQLCmd: "",
        gitHubVersion: { type: "dotcom" } as util.GitHubVersion,
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
        custom: ["foo.ql"],
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
    }
  });
});
