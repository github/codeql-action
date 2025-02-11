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
const codeql = __importStar(require("./codeql"));
const configUtils = __importStar(require("./config-utils"));
const feature_flags_1 = require("./feature-flags");
const initActionPostHelper = __importStar(require("./init-action-post-helper"));
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const testing_utils_1 = require("./testing-utils");
const uploadLib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
const workflow = __importStar(require("./workflow"));
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("post: init action with debug mode off", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
        process.env["RUNNER_TEMP"] = tmpDir;
        const gitHubVersion = {
            type: util.GitHubVariant.DOTCOM,
        };
        sinon.stub(configUtils, "getConfig").resolves({
            debugMode: false,
            gitHubVersion,
            languages: [],
            packs: [],
        });
        const uploadAllAvailableDebugArtifactsSpy = sinon.spy();
        const printDebugLogsSpy = sinon.spy();
        await initActionPostHelper.run(uploadAllAvailableDebugArtifactsSpy, printDebugLogsSpy, (0, testing_utils_1.createTestConfig)({ debugMode: false }), (0, repository_1.parseRepositoryNwo)("github/codeql-action"), (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        t.assert(uploadAllAvailableDebugArtifactsSpy.notCalled);
        t.assert(printDebugLogsSpy.notCalled);
    });
});
(0, ava_1.default)("post: init action with debug mode on", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
        process.env["RUNNER_TEMP"] = tmpDir;
        const uploadAllAvailableDebugArtifactsSpy = sinon.spy();
        const printDebugLogsSpy = sinon.spy();
        await initActionPostHelper.run(uploadAllAvailableDebugArtifactsSpy, printDebugLogsSpy, (0, testing_utils_1.createTestConfig)({ debugMode: true }), (0, repository_1.parseRepositoryNwo)("github/codeql-action"), (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        t.assert(uploadAllAvailableDebugArtifactsSpy.called);
        t.assert(printDebugLogsSpy.called);
    });
});
(0, ava_1.default)("uploads failed SARIF run with `diagnostics export` if feature flag is off", async (t) => {
    const actionsWorkflow = createTestWorkflow([
        {
            name: "Checkout repository",
            uses: "actions/checkout@v4",
        },
        {
            name: "Initialize CodeQL",
            uses: "github/codeql-action/init@v3",
            with: {
                languages: "javascript",
            },
        },
        {
            name: "Perform CodeQL Analysis",
            uses: "github/codeql-action/analyze@v3",
            with: {
                category: "my-category",
            },
        },
    ]);
    await testFailedSarifUpload(t, actionsWorkflow, { category: "my-category" });
});
(0, ava_1.default)("uploads failed SARIF run with `diagnostics export` if the database doesn't exist", async (t) => {
    const actionsWorkflow = createTestWorkflow([
        {
            name: "Checkout repository",
            uses: "actions/checkout@v4",
        },
        {
            name: "Initialize CodeQL",
            uses: "github/codeql-action/init@v3",
            with: {
                languages: "javascript",
            },
        },
        {
            name: "Perform CodeQL Analysis",
            uses: "github/codeql-action/analyze@v3",
            with: {
                category: "my-category",
            },
        },
    ]);
    await testFailedSarifUpload(t, actionsWorkflow, {
        category: "my-category",
        databaseExists: false,
    });
});
(0, ava_1.default)("uploads failed SARIF run with database export-diagnostics if the database exists and feature flag is on", async (t) => {
    const actionsWorkflow = createTestWorkflow([
        {
            name: "Checkout repository",
            uses: "actions/checkout@v4",
        },
        {
            name: "Initialize CodeQL",
            uses: "github/codeql-action/init@v3",
            with: {
                languages: "javascript",
            },
        },
        {
            name: "Perform CodeQL Analysis",
            uses: "github/codeql-action/analyze@v3",
            with: {
                category: "my-category",
            },
        },
    ]);
    await testFailedSarifUpload(t, actionsWorkflow, {
        category: "my-category",
        exportDiagnosticsEnabled: true,
    });
});
const UPLOAD_INPUT_TEST_CASES = [
    {
        uploadInput: "true",
        shouldUpload: true,
    },
    {
        uploadInput: "false",
        shouldUpload: true,
    },
    {
        uploadInput: "always",
        shouldUpload: true,
    },
    {
        uploadInput: "failure-only",
        shouldUpload: true,
    },
    {
        uploadInput: "never",
        shouldUpload: false,
    },
    {
        uploadInput: "unrecognized-value",
        shouldUpload: true,
    },
];
for (const { uploadInput, shouldUpload } of UPLOAD_INPUT_TEST_CASES) {
    (0, ava_1.default)(`does ${shouldUpload ? "" : "not "}upload failed SARIF run for workflow with upload: ${uploadInput}`, async (t) => {
        const actionsWorkflow = createTestWorkflow([
            {
                name: "Checkout repository",
                uses: "actions/checkout@v4",
            },
            {
                name: "Initialize CodeQL",
                uses: "github/codeql-action/init@v3",
                with: {
                    languages: "javascript",
                },
            },
            {
                name: "Perform CodeQL Analysis",
                uses: "github/codeql-action/analyze@v3",
                with: {
                    category: "my-category",
                    upload: uploadInput,
                },
            },
        ]);
        const result = await testFailedSarifUpload(t, actionsWorkflow, {
            category: "my-category",
            expectUpload: shouldUpload,
        });
        if (!shouldUpload) {
            t.is(result.upload_failed_run_skipped_because, "SARIF upload is disabled");
        }
    });
}
(0, ava_1.default)("uploading failed SARIF run succeeds when workflow uses an input with a matrix var", async (t) => {
    const actionsWorkflow = createTestWorkflow([
        {
            name: "Checkout repository",
            uses: "actions/checkout@v4",
        },
        {
            name: "Initialize CodeQL",
            uses: "github/codeql-action/init@v3",
            with: {
                languages: "javascript",
            },
        },
        {
            name: "Perform CodeQL Analysis",
            uses: "github/codeql-action/analyze@v3",
            with: {
                category: "/language:${{ matrix.language }}",
            },
        },
    ]);
    await testFailedSarifUpload(t, actionsWorkflow, {
        category: "/language:csharp",
        matrix: { language: "csharp" },
    });
});
(0, ava_1.default)("uploading failed SARIF run fails when workflow uses a complex upload input", async (t) => {
    const actionsWorkflow = createTestWorkflow([
        {
            name: "Checkout repository",
            uses: "actions/checkout@v4",
        },
        {
            name: "Initialize CodeQL",
            uses: "github/codeql-action/init@v3",
            with: {
                languages: "javascript",
            },
        },
        {
            name: "Perform CodeQL Analysis",
            uses: "github/codeql-action/analyze@v3",
            with: {
                upload: "${{ matrix.language != 'csharp' }}",
            },
        },
    ]);
    const result = await testFailedSarifUpload(t, actionsWorkflow, {
        expectUpload: false,
    });
    t.is(result.upload_failed_run_error, "Could not get upload input to github/codeql-action/analyze since it contained an " +
        "unrecognized dynamic value.");
});
(0, ava_1.default)("uploading failed SARIF run fails when workflow does not reference github/codeql-action", async (t) => {
    const actionsWorkflow = createTestWorkflow([
        {
            name: "Checkout repository",
            uses: "actions/checkout@v4",
        },
    ]);
    const result = await testFailedSarifUpload(t, actionsWorkflow, {
        expectUpload: false,
    });
    t.is(result.upload_failed_run_error, "Could not get upload input to github/codeql-action/analyze since the analyze job does not " +
        "call github/codeql-action/analyze.");
    t.truthy(result.upload_failed_run_stack_trace);
});
function createTestWorkflow(steps) {
    return {
        name: "CodeQL",
        on: {
            push: {
                branches: ["main"],
            },
            pull_request: {
                branches: ["main"],
            },
        },
        jobs: {
            analyze: {
                name: "CodeQL Analysis",
                "runs-on": "ubuntu-latest",
                steps,
            },
        },
    };
}
async function testFailedSarifUpload(t, actionsWorkflow, { category, databaseExists = true, expectUpload = true, exportDiagnosticsEnabled = false, matrix = {}, } = {}) {
    const config = {
        codeQLCmd: "codeql",
        debugMode: true,
        languages: [],
        packs: [],
    };
    if (databaseExists) {
        config.dbLocation = "path/to/database";
    }
    process.env["GITHUB_JOB"] = "analyze";
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    process.env["GITHUB_WORKSPACE"] =
        "/home/runner/work/codeql-action/codeql-action";
    sinon
        .stub(actionsUtil, "getRequiredInput")
        .withArgs("matrix")
        .returns(JSON.stringify(matrix));
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeql, "getCodeQL").resolves(codeqlObject);
    sinon.stub(codeqlObject, "getVersion").resolves((0, testing_utils_1.makeVersionInfo)("2.17.6"));
    const databaseExportDiagnosticsStub = sinon.stub(codeqlObject, "databaseExportDiagnostics");
    const diagnosticsExportStub = sinon.stub(codeqlObject, "diagnosticsExport");
    sinon.stub(workflow, "getWorkflow").resolves(actionsWorkflow);
    const uploadFiles = sinon.stub(uploadLib, "uploadFiles");
    uploadFiles.resolves({
        sarifID: "42",
        statusReport: { raw_upload_size_bytes: 20, zipped_upload_size_bytes: 10 },
    });
    const waitForProcessing = sinon.stub(uploadLib, "waitForProcessing");
    const features = [];
    if (exportDiagnosticsEnabled) {
        features.push(feature_flags_1.Feature.ExportDiagnosticsEnabled);
    }
    const result = await initActionPostHelper.tryUploadSarifIfRunFailed(config, (0, repository_1.parseRepositoryNwo)("github/codeql-action"), (0, testing_utils_1.createFeatures)(features), (0, logging_1.getRunnerLogger)(true));
    if (expectUpload) {
        t.deepEqual(result, {
            sarifID: "42",
            raw_upload_size_bytes: 20,
            zipped_upload_size_bytes: 10,
        });
        if (databaseExists && exportDiagnosticsEnabled) {
            t.true(databaseExportDiagnosticsStub.calledOnceWith(config.dbLocation, sinon.match.string, category), `Actual args were: ${JSON.stringify(databaseExportDiagnosticsStub.args)}`);
        }
        else {
            t.true(diagnosticsExportStub.calledOnceWith(sinon.match.string, category, config), `Actual args were: ${JSON.stringify(diagnosticsExportStub.args)}`);
        }
        t.true(uploadFiles.calledOnceWith(sinon.match.string, sinon.match.string, category, sinon.match.any, sinon.match.any), `Actual args were: ${JSON.stringify(uploadFiles.args)}`);
        t.true(waitForProcessing.calledOnceWith(sinon.match.any, "42", sinon.match.any, {
            isUnsuccessfulExecution: true,
        }));
    }
    else {
        t.true(diagnosticsExportStub.notCalled);
        t.true(uploadFiles.notCalled);
        t.true(waitForProcessing.notCalled);
    }
    return result;
}
//# sourceMappingURL=init-action-post-helper.test.js.map