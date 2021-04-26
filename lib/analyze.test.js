"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const ava_1 = __importDefault(require("ava"));
const analyze_1 = require("./analyze");
const codeql_1 = require("./codeql");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
testing_utils_1.setupTests(ava_1.default);
// Checks that the duration fields are populated for the correct language
// and correct case of builtin or custom. Also checks the correct search
// paths are set in the database analyze invocation.
ava_1.default("status report fields and search path setting", async (t) => {
    let searchPathsUsed = [];
    return await util.withTmpDir(async (tmpDir) => {
        testing_utils_1.setupActionsVars(tmpDir, tmpDir);
        codeql_1.setCodeQL({
            databaseAnalyze: async (_, sarifFile, searchPath) => {
                fs.writeFileSync(sarifFile, JSON.stringify({
                    runs: [],
                }));
                searchPathsUsed.push(searchPath);
            },
        });
        const memoryFlag = "";
        const addSnippetsFlag = "";
        const threadsFlag = "";
        for (const language of Object.values(languages_1.Language)) {
            searchPathsUsed = [];
            const config = {
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
                },
            };
            fs.mkdirSync(util.getCodeQLDatabasePath(config.tempDir, language), {
                recursive: true,
            });
            config.queries[language] = {
                builtin: ["foo.ql"],
                custom: [],
            };
            const builtinStatusReport = await analyze_1.runQueries(tmpDir, memoryFlag, addSnippetsFlag, threadsFlag, config, logging_1.getRunnerLogger(true));
            t.deepEqual(Object.keys(builtinStatusReport).length, 1);
            t.true(`analyze_builtin_queries_${language}_duration_ms` in builtinStatusReport);
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
            const customStatusReport = await analyze_1.runQueries(tmpDir, memoryFlag, addSnippetsFlag, threadsFlag, config, logging_1.getRunnerLogger(true));
            t.deepEqual(Object.keys(customStatusReport).length, 1);
            t.true(`analyze_custom_queries_${language}_duration_ms` in customStatusReport);
            t.deepEqual(searchPathsUsed, [undefined, "/1", "/2"]);
        }
    });
});
//# sourceMappingURL=analyze.test.js.map