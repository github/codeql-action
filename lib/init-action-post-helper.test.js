"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
        const uploadDatabaseBundleSpy = sinon.spy();
        const uploadLogsSpy = sinon.spy();
        const printDebugLogsSpy = sinon.spy();
        await initActionPostHelper.run(uploadDatabaseBundleSpy, uploadLogsSpy, printDebugLogsSpy, (0, repository_1.parseRepositoryNwo)("github/codeql-action"), (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        t.assert(uploadDatabaseBundleSpy.notCalled);
        t.assert(uploadLogsSpy.notCalled);
        t.assert(printDebugLogsSpy.notCalled);
    });
});
(0, ava_1.default)("post: init action with debug mode on", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
        process.env["RUNNER_TEMP"] = tmpDir;
        const gitHubVersion = {
            type: util.GitHubVariant.DOTCOM,
        };
        sinon.stub(configUtils, "getConfig").resolves({
            debugMode: true,
            gitHubVersion,
            languages: [],
            packs: [],
        });
        const uploadDatabaseBundleSpy = sinon.spy();
        const uploadLogsSpy = sinon.spy();
        const printDebugLogsSpy = sinon.spy();
        await initActionPostHelper.run(uploadDatabaseBundleSpy, uploadLogsSpy, printDebugLogsSpy, (0, repository_1.parseRepositoryNwo)("github/codeql-action"), (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        t.assert(uploadDatabaseBundleSpy.called);
        t.assert(uploadLogsSpy.called);
        t.assert(printDebugLogsSpy.called);
    });
});
(0, ava_1.default)("uploads failed SARIF run for typical workflow", async (t) => {
    const actionsWorkflow = createTestWorkflow([
        {
            name: "Checkout repository",
            uses: "actions/checkout@v3",
        },
        {
            name: "Initialize CodeQL",
            uses: "github/codeql-action/init@v2",
            with: {
                languages: "javascript",
            },
        },
        {
            name: "Perform CodeQL Analysis",
            uses: "github/codeql-action/analyze@v2",
            with: {
                category: "my-category",
            },
        },
    ]);
    await testFailedSarifUpload(t, actionsWorkflow, { category: "my-category" });
});
(0, ava_1.default)("doesn't upload failed SARIF for workflow with upload: false", async (t) => {
    const actionsWorkflow = createTestWorkflow([
        {
            name: "Checkout repository",
            uses: "actions/checkout@v3",
        },
        {
            name: "Initialize CodeQL",
            uses: "github/codeql-action/init@v2",
            with: {
                languages: "javascript",
            },
        },
        {
            name: "Perform CodeQL Analysis",
            uses: "github/codeql-action/analyze@v2",
            with: {
                category: "my-category",
                upload: false,
            },
        },
    ]);
    const result = await testFailedSarifUpload(t, actionsWorkflow, {
        expectUpload: false,
    });
    t.is(result.upload_failed_run_skipped_because, "SARIF upload is disabled");
});
(0, ava_1.default)("uploading failed SARIF run succeeds when workflow uses an input with a matrix var", async (t) => {
    const actionsWorkflow = createTestWorkflow([
        {
            name: "Checkout repository",
            uses: "actions/checkout@v3",
        },
        {
            name: "Initialize CodeQL",
            uses: "github/codeql-action/init@v2",
            with: {
                languages: "javascript",
            },
        },
        {
            name: "Perform CodeQL Analysis",
            uses: "github/codeql-action/analyze@v2",
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
            uses: "actions/checkout@v3",
        },
        {
            name: "Initialize CodeQL",
            uses: "github/codeql-action/init@v2",
            with: {
                languages: "javascript",
            },
        },
        {
            name: "Perform CodeQL Analysis",
            uses: "github/codeql-action/analyze@v2",
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
            uses: "actions/checkout@v3",
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
async function testFailedSarifUpload(t, actionsWorkflow, { category, expectUpload = true, matrix = {}, } = {}) {
    const config = {
        codeQLCmd: "codeql",
        debugMode: true,
        languages: [],
        packs: [],
    };
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
    const diagnosticsExportStub = sinon.stub(codeqlObject, "diagnosticsExport");
    sinon.stub(workflow, "getWorkflow").resolves(actionsWorkflow);
    const uploadFromActions = sinon.stub(uploadLib, "uploadFromActions");
    uploadFromActions.resolves({
        sarifID: "42",
        statusReport: { raw_upload_size_bytes: 20, zipped_upload_size_bytes: 10 },
    });
    const waitForProcessing = sinon.stub(uploadLib, "waitForProcessing");
    const result = await initActionPostHelper.tryUploadSarifIfRunFailed(config, (0, repository_1.parseRepositoryNwo)("github/codeql-action"), (0, testing_utils_1.createFeatures)([feature_flags_1.Feature.UploadFailedSarifEnabled]), (0, logging_1.getRunnerLogger)(true));
    if (expectUpload) {
        t.deepEqual(result, {
            raw_upload_size_bytes: 20,
            zipped_upload_size_bytes: 10,
        });
    }
    if (expectUpload) {
        t.true(diagnosticsExportStub.calledOnceWith(sinon.match.string, category), `Actual args were: ${diagnosticsExportStub.args}`);
        t.true(uploadFromActions.calledOnceWith(sinon.match.string, sinon.match.string, category, sinon.match.any), `Actual args were: ${uploadFromActions.args}`);
        t.true(waitForProcessing.calledOnceWith(sinon.match.any, "42", sinon.match.any, {
            isUnsuccessfulExecution: true,
        }));
    }
    else {
        t.true(diagnosticsExportStub.notCalled);
        t.true(uploadFromActions.notCalled);
        t.true(waitForProcessing.notCalled);
    }
    return result;
}
//# sourceMappingURL=init-action-post-helper.test.js.map