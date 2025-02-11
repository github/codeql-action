"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const analyze_1 = require("./analyze");
const codeql_1 = require("./codeql");
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const uploadLib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
(0, testing_utils_1.setupTests)(ava_1.default);
/**
 * Checks the status report produced by the analyze Action.
 *
 * - Checks that the duration fields are populated for the correct language.
 * - Checks that the QA telemetry status report fields are populated when the QA feature flag is enabled.
 */
(0, ava_1.default)("status report fields", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const memoryFlag = "";
        const addSnippetsFlag = "";
        const threadsFlag = "";
        sinon.stub(uploadLib, "validateSarifFileSchema");
        for (const language of Object.values(languages_1.Language)) {
            (0, codeql_1.setCodeQL)({
                databaseRunQueries: async () => { },
                packDownload: async () => ({ packs: [] }),
                databaseInterpretResults: async (_db, _queriesRun, sarifFile) => {
                    fs.writeFileSync(sarifFile, JSON.stringify({
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
                    }));
                    return "";
                },
                databasePrintBaseline: async () => "",
            });
            const config = (0, testing_utils_1.createTestConfig)({
                languages: [language],
                tempDir: tmpDir,
                dbLocation: path.resolve(tmpDir, "codeql_databases"),
            });
            fs.mkdirSync(util.getCodeQLDatabasePath(config, language), {
                recursive: true,
            });
            const statusReport = await (0, analyze_1.runQueries)(tmpDir, memoryFlag, addSnippetsFlag, threadsFlag, undefined, undefined, config, (0, logging_1.getRunnerLogger)(true), (0, testing_utils_1.createFeatures)([feature_flags_1.Feature.QaTelemetryEnabled]));
            t.deepEqual(Object.keys(statusReport).sort(), [
                "analysis_is_diff_informed",
                `analyze_builtin_queries_${language}_duration_ms`,
                "event_reports",
                `interpret_results_${language}_duration_ms`,
            ]);
            for (const eventReport of statusReport.event_reports) {
                t.deepEqual(eventReport.event, "codeql database interpret-results");
                t.true("properties" in eventReport);
                t.true("alertCounts" in eventReport.properties);
            }
        }
    });
});
function runGetDiffRanges(changes, patch) {
    sinon
        .stub(actionsUtil, "getRequiredInput")
        .withArgs("checkout_path")
        .returns("/checkout/path");
    return analyze_1.exportedForTesting.getDiffRanges({
        filename: "test.txt",
        changes,
        patch: patch?.join("\n"),
    }, (0, logging_1.getRunnerLogger)(true));
}
(0, ava_1.default)("getDiffRanges: file unchanged", async (t) => {
    const diffRanges = runGetDiffRanges(0, undefined);
    t.deepEqual(diffRanges, []);
});
(0, ava_1.default)("getDiffRanges: file diff too large", async (t) => {
    const diffRanges = runGetDiffRanges(1000000, undefined);
    t.deepEqual(diffRanges, [
        {
            path: "/checkout/path/test.txt",
            startLine: 0,
            endLine: 0,
        },
    ]);
});
(0, ava_1.default)("getDiffRanges: diff thunk with single addition range", async (t) => {
    const diffRanges = runGetDiffRanges(2, [
        "@@ -30,6 +50,8 @@",
        " a",
        " b",
        " c",
        "+1",
        "+2",
        " d",
        " e",
        " f",
    ]);
    t.deepEqual(diffRanges, [
        {
            path: "/checkout/path/test.txt",
            startLine: 53,
            endLine: 54,
        },
    ]);
});
(0, ava_1.default)("getDiffRanges: diff thunk with single deletion range", async (t) => {
    const diffRanges = runGetDiffRanges(2, [
        "@@ -30,8 +50,6 @@",
        " a",
        " b",
        " c",
        "-1",
        "-2",
        " d",
        " e",
        " f",
    ]);
    t.deepEqual(diffRanges, []);
});
(0, ava_1.default)("getDiffRanges: diff thunk with single update range", async (t) => {
    const diffRanges = runGetDiffRanges(2, [
        "@@ -30,7 +50,7 @@",
        " a",
        " b",
        " c",
        "-1",
        "+2",
        " d",
        " e",
        " f",
    ]);
    t.deepEqual(diffRanges, [
        {
            path: "/checkout/path/test.txt",
            startLine: 53,
            endLine: 53,
        },
    ]);
});
(0, ava_1.default)("getDiffRanges: diff thunk with addition ranges", async (t) => {
    const diffRanges = runGetDiffRanges(2, [
        "@@ -30,7 +50,9 @@",
        " a",
        " b",
        " c",
        "+1",
        " c",
        "+2",
        " d",
        " e",
        " f",
    ]);
    t.deepEqual(diffRanges, [
        {
            path: "/checkout/path/test.txt",
            startLine: 53,
            endLine: 53,
        },
        {
            path: "/checkout/path/test.txt",
            startLine: 55,
            endLine: 55,
        },
    ]);
});
(0, ava_1.default)("getDiffRanges: diff thunk with mixed ranges", async (t) => {
    const diffRanges = runGetDiffRanges(2, [
        "@@ -30,7 +50,7 @@",
        " a",
        " b",
        " c",
        "-1",
        " d",
        "-2",
        "+3",
        " e",
        " f",
        "+4",
        "+5",
        " g",
        " h",
        " i",
    ]);
    t.deepEqual(diffRanges, [
        {
            path: "/checkout/path/test.txt",
            startLine: 54,
            endLine: 54,
        },
        {
            path: "/checkout/path/test.txt",
            startLine: 57,
            endLine: 58,
        },
    ]);
});
(0, ava_1.default)("getDiffRanges: multiple diff thunks", async (t) => {
    const diffRanges = runGetDiffRanges(2, [
        "@@ -30,6 +50,8 @@",
        " a",
        " b",
        " c",
        "+1",
        "+2",
        " d",
        " e",
        " f",
        "@@ -130,6 +150,8 @@",
        " a",
        " b",
        " c",
        "+1",
        "+2",
        " d",
        " e",
        " f",
    ]);
    t.deepEqual(diffRanges, [
        {
            path: "/checkout/path/test.txt",
            startLine: 53,
            endLine: 54,
        },
        {
            path: "/checkout/path/test.txt",
            startLine: 153,
            endLine: 154,
        },
    ]);
});
(0, ava_1.default)("getDiffRanges: no diff context lines", async (t) => {
    const diffRanges = runGetDiffRanges(2, ["@@ -30 +50,2 @@", "+1", "+2"]);
    t.deepEqual(diffRanges, [
        {
            path: "/checkout/path/test.txt",
            startLine: 50,
            endLine: 51,
        },
    ]);
});
(0, ava_1.default)("getDiffRanges: malformed thunk header", async (t) => {
    const diffRanges = runGetDiffRanges(2, ["@@ 30 +50,2 @@", "+1", "+2"]);
    t.deepEqual(diffRanges, undefined);
});
//# sourceMappingURL=analyze.test.js.map