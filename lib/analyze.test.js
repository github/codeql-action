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
// and correct case of builtin or custom.
ava_1.default("status report fields", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        codeql_1.setCodeQL({
            databaseAnalyze: async () => undefined,
        });
        const memoryFlag = "";
        const addSnippetsFlag = "";
        const threadsFlag = "";
        for (const language of Object.values(languages_1.Language)) {
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
                custom: ["foo.ql"],
            };
            const customStatusReport = await analyze_1.runQueries(tmpDir, memoryFlag, addSnippetsFlag, threadsFlag, config, logging_1.getRunnerLogger(true));
            t.deepEqual(Object.keys(customStatusReport).length, 1);
            t.true(`analyze_custom_queries_${language}_duration_ms` in customStatusReport);
        }
    });
});
//# sourceMappingURL=analyze.test.js.map