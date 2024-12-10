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
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const environment_1 = require("./environment");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const status_report_1 = require("./status-report");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
function setupEnvironmentAndStub(tmpDir) {
    (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
    process.env["CODEQL_ACTION_ANALYSIS_KEY"] = "analysis-key";
    process.env["GITHUB_EVENT_NAME"] = "dynamic";
    process.env["GITHUB_REF"] = "refs/heads/main";
    process.env["GITHUB_REPOSITORY"] = "octocat/HelloWorld";
    process.env["GITHUB_RUN_ATTEMPT"] = "2";
    process.env["GITHUB_RUN_ID"] = "100";
    process.env["GITHUB_SHA"] = "a".repeat(40);
    process.env["ImageVersion"] = "2023.05.19.1";
    process.env["RUNNER_OS"] = "macOS";
    process.env["RUNNER_TEMP"] = tmpDir;
    const getRequiredInput = sinon.stub(actionsUtil, "getRequiredInput");
    getRequiredInput.withArgs("matrix").resolves("input/matrix");
}
(0, ava_1.default)("createStatusReportBase", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        setupEnvironmentAndStub(tmpDir);
        const statusReport = await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.Init, "failure", new Date("May 19, 2023 05:19:00"), (0, testing_utils_1.createTestConfig)({
            buildMode: util_1.BuildMode.None,
            languages: [languages_1.Language.java, languages_1.Language.swift],
        }), { numAvailableBytes: 100, numTotalBytes: 500 }, (0, logging_1.getRunnerLogger)(false), "failure cause", "exception stack trace");
        t.truthy(statusReport);
        if (statusReport !== undefined) {
            t.is(statusReport.action_name, status_report_1.ActionName.Init);
            t.is(statusReport.action_oid, "unknown");
            t.is(typeof statusReport.action_version, "string");
            t.is(statusReport.action_started_at, new Date("May 19, 2023 05:19:00").toISOString());
            t.is(statusReport.actions_event_name, "dynamic");
            t.is(statusReport.analysis_key, "analysis-key");
            t.is(statusReport.build_mode, util_1.BuildMode.None);
            t.is(statusReport.cause, "failure cause");
            t.is(statusReport.commit_oid, process.env["GITHUB_SHA"]);
            t.is(statusReport.exception, "exception stack trace");
            t.is(statusReport.job_name, process.env["GITHUB_JOB"] || "");
            t.is(typeof statusReport.job_run_uuid, "string");
            t.is(statusReport.languages, "java,swift");
            t.is(statusReport.ref, process.env["GITHUB_REF"]);
            t.is(statusReport.runner_available_disk_space_bytes, 100);
            t.is(statusReport.runner_image_version, process.env["ImageVersion"]);
            t.is(statusReport.runner_os, process.env["RUNNER_OS"]);
            t.is(statusReport.started_at, process.env[environment_1.EnvVar.WORKFLOW_STARTED_AT]);
            t.is(statusReport.status, "failure");
            t.is(statusReport.steady_state_default_setup, false);
            t.is(statusReport.workflow_name, process.env["GITHUB_WORKFLOW"] || "");
            t.is(statusReport.workflow_run_attempt, 2);
            t.is(statusReport.workflow_run_id, 100);
        }
    });
});
(0, ava_1.default)("createStatusReportBase_firstParty", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        setupEnvironmentAndStub(tmpDir);
        t.is((await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.UploadSarif, "failure", new Date("May 19, 2023 05:19:00"), (0, testing_utils_1.createTestConfig)({}), { numAvailableBytes: 100, numTotalBytes: 500 }, (0, logging_1.getRunnerLogger)(false), "failure cause", "exception stack trace"))?.first_party_analysis, false);
        t.is((await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.Autobuild, "failure", new Date("May 19, 2023 05:19:00"), (0, testing_utils_1.createTestConfig)({}), { numAvailableBytes: 100, numTotalBytes: 500 }, (0, logging_1.getRunnerLogger)(false), "failure cause", "exception stack trace"))?.first_party_analysis, true);
        process.env["CODEQL_ACTION_INIT_HAS_RUN"] = "foobar";
        t.is((await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.UploadSarif, "failure", new Date("May 19, 2023 05:19:00"), (0, testing_utils_1.createTestConfig)({}), { numAvailableBytes: 100, numTotalBytes: 500 }, (0, logging_1.getRunnerLogger)(false), "failure cause", "exception stack trace"))?.first_party_analysis, false);
        t.is((await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.Init, "failure", new Date("May 19, 2023 05:19:00"), (0, testing_utils_1.createTestConfig)({}), { numAvailableBytes: 100, numTotalBytes: 500 }, (0, logging_1.getRunnerLogger)(false), "failure cause", "exception stack trace"))?.first_party_analysis, true);
        process.env["CODEQL_ACTION_INIT_HAS_RUN"] = "true";
        t.is((await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.UploadSarif, "failure", new Date("May 19, 2023 05:19:00"), (0, testing_utils_1.createTestConfig)({}), { numAvailableBytes: 100, numTotalBytes: 500 }, (0, logging_1.getRunnerLogger)(false), "failure cause", "exception stack trace"))?.first_party_analysis, true);
        t.is((await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.Analyze, "failure", new Date("May 19, 2023 05:19:00"), (0, testing_utils_1.createTestConfig)({}), { numAvailableBytes: 100, numTotalBytes: 500 }, (0, logging_1.getRunnerLogger)(false), "failure cause", "exception stack trace"))?.first_party_analysis, true);
    });
});
//# sourceMappingURL=status-report.test.js.map