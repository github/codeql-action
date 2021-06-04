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
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const sinon_1 = __importDefault(require("sinon"));
const analyze_1 = require("./analyze");
const codeql_1 = require("./codeql");
const count_loc_1 = require("./count-loc");
const count = __importStar(require("./count-loc"));
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
testing_utils_1.setupTests(ava_1.default);
// Checks that the duration fields are populated for the correct language
// and correct case of builtin or custom. Also checks the correct search
// paths are set in the database analyze invocation.
ava_1.default("status report fields and search path setting", async (t) => {
    const mockLinesOfCode = Object.values(languages_1.Language).reduce((obj, lang, i) => {
        // use a different line count for each language
        obj[lang] = i + 1;
        return obj;
    }, {});
    sinon_1.default.stub(count, "countLoc").resolves(mockLinesOfCode);
    let searchPathsUsed = [];
    return await util.withTmpDir(async (tmpDir) => {
        testing_utils_1.setupActionsVars(tmpDir, tmpDir);
        const memoryFlag = "";
        const addSnippetsFlag = "";
        const threadsFlag = "";
        for (const language of Object.values(languages_1.Language)) {
            codeql_1.setCodeQL({
                databaseRunQueries: async (_db, searchPath) => {
                    searchPathsUsed.push(searchPath);
                },
                databaseInterpretResults: async (_db, _queriesRun, sarifFile) => {
                    fs.writeFileSync(sarifFile, JSON.stringify({
                        runs: [
                            // variant 1 uses ruleId
                            {
                                properties: {
                                    metricResults: [
                                        {
                                            ruleId: `${count_loc_1.getIdPrefix(language)}/summary/lines-of-code`,
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
                                                id: `${count_loc_1.getIdPrefix(language)}/summary/lines-of-code`,
                                            },
                                            value: 123,
                                        },
                                    ],
                                },
                            },
                            {},
                        ],
                    }));
                    return "";
                },
            });
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
                dbLocation: path.resolve(tmpDir, "codeql_databases"),
            };
            fs.mkdirSync(util.getCodeQLDatabasePath(config, language), {
                recursive: true,
            });
            config.queries[language] = {
                builtin: ["foo.ql"],
                custom: [],
            };
            const builtinStatusReport = await analyze_1.runQueries(tmpDir, memoryFlag, addSnippetsFlag, threadsFlag, undefined, config, logging_1.getRunnerLogger(true));
            t.deepEqual(Object.keys(builtinStatusReport).length, 2);
            t.true(`analyze_builtin_queries_${language}_duration_ms` in builtinStatusReport);
            t.true(`interpret_results_${language}_duration_ms` in builtinStatusReport);
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
            const customStatusReport = await analyze_1.runQueries(tmpDir, memoryFlag, addSnippetsFlag, threadsFlag, undefined, config, logging_1.getRunnerLogger(true));
            t.deepEqual(Object.keys(customStatusReport).length, 2);
            t.true(`analyze_custom_queries_${language}_duration_ms` in customStatusReport);
            t.true(`interpret_results_${language}_duration_ms` in customStatusReport);
            t.deepEqual(searchPathsUsed, [undefined, "/1", "/2"]);
        }
        verifyLineCounts(tmpDir);
    });
    function verifyLineCounts(tmpDir) {
        // eslint-disable-next-line github/array-foreach
        Object.keys(languages_1.Language).forEach((lang, i) => {
            verifyLineCountForFile(lang, path.join(tmpDir, `${lang}.sarif`), i + 1);
        });
    }
    function verifyLineCountForFile(lang, filePath, lineCount) {
        const idPrefix = count_loc_1.getIdPrefix(lang);
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
        // when the rule doesn't exists, it should not be added
        t.deepEqual(sarif.runs[2].properties.metricResults, []);
    }
});
//# sourceMappingURL=analyze.test.js.map