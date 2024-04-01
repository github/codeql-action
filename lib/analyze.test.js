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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
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
            const statusReport = await (0, analyze_1.runQueries)(tmpDir, memoryFlag, addSnippetsFlag, threadsFlag, undefined, config, (0, logging_1.getRunnerLogger)(true), (0, testing_utils_1.createFeatures)([feature_flags_1.Feature.QaTelemetryEnabled]));
            t.deepEqual(Object.keys(statusReport).sort(), [
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
//# sourceMappingURL=analyze.test.js.map