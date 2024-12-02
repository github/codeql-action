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
const github = __importStar(require("@actions/github"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const apiClient = __importStar(require("./api-client"));
const codeql_1 = require("./codeql");
const database_upload_1 = require("./database-upload");
const languages_1 = require("./languages");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
ava_1.default.beforeEach(() => {
    (0, util_1.initializeEnvironment)("1.2.3");
});
const testRepoName = { owner: "github", repo: "example" };
const testApiDetails = {
    auth: "1234",
    url: "https://github.com",
    apiURL: undefined,
};
function getTestConfig(tmpDir) {
    return (0, testing_utils_1.createTestConfig)({
        languages: [languages_1.Language.javascript],
        dbLocation: tmpDir,
    });
}
async function mockHttpRequests(databaseUploadStatusCode) {
    // Passing an auth token is required, so we just use a dummy value
    const client = github.getOctokit("123");
    const requestSpy = sinon.stub(client, "request");
    const url = "POST /repos/:owner/:repo/code-scanning/codeql/databases/:language?name=:name&commit_oid=:commit_oid";
    const databaseUploadSpy = requestSpy.withArgs(url);
    if (databaseUploadStatusCode < 300) {
        databaseUploadSpy.resolves(undefined);
    }
    else {
        databaseUploadSpy.throws(new util_1.HTTPError("some error message", databaseUploadStatusCode));
    }
    sinon.stub(apiClient, "getApiClient").value(() => client);
    return databaseUploadSpy;
}
(0, ava_1.default)("Abort database upload if 'upload-database' input set to false", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        sinon
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("false");
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        const loggedMessages = [];
        await (0, database_upload_1.uploadDatabases)(testRepoName, getTestConfig(tmpDir), testApiDetails, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message ===
                "Database upload disabled in workflow. Skipping upload.") !== undefined);
    });
});
(0, ava_1.default)("Abort database upload if running against GHES", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        sinon
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        const config = getTestConfig(tmpDir);
        config.gitHubVersion = { type: util_1.GitHubVariant.GHES, version: "3.0" };
        const loggedMessages = [];
        await (0, database_upload_1.uploadDatabases)(testRepoName, config, testApiDetails, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message ===
                "Not running against github.com or GHEC-DR. Skipping upload.") !== undefined);
    });
});
(0, ava_1.default)("Abort database upload if not analyzing default branch", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        sinon
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(false);
        const loggedMessages = [];
        await (0, database_upload_1.uploadDatabases)(testRepoName, getTestConfig(tmpDir), testApiDetails, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Not analyzing default branch. Skipping upload.") !== undefined);
    });
});
(0, ava_1.default)("Don't crash if uploading a database fails", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        sinon
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        await mockHttpRequests(500);
        (0, codeql_1.setCodeQL)({
            async databaseBundle(_, outputFilePath) {
                fs.writeFileSync(outputFilePath, "");
            },
        });
        const loggedMessages = [];
        await (0, database_upload_1.uploadDatabases)(testRepoName, getTestConfig(tmpDir), testApiDetails, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "warning" &&
            v.message ===
                "Failed to upload database for javascript: Error: some error message") !== undefined);
    });
});
(0, ava_1.default)("Successfully uploading a database to github.com", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        sinon
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        await mockHttpRequests(201);
        (0, codeql_1.setCodeQL)({
            async databaseBundle(_, outputFilePath) {
                fs.writeFileSync(outputFilePath, "");
            },
        });
        const loggedMessages = [];
        await (0, database_upload_1.uploadDatabases)(testRepoName, getTestConfig(tmpDir), testApiDetails, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Successfully uploaded database for javascript") !== undefined);
    });
});
(0, ava_1.default)("Successfully uploading a database to GHEC-DR", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        sinon
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        const databaseUploadSpy = await mockHttpRequests(201);
        (0, codeql_1.setCodeQL)({
            async databaseBundle(_, outputFilePath) {
                fs.writeFileSync(outputFilePath, "");
            },
        });
        const loggedMessages = [];
        await (0, database_upload_1.uploadDatabases)(testRepoName, getTestConfig(tmpDir), {
            auth: "1234",
            url: "https://tenant.ghe.com",
            apiURL: undefined,
        }, (0, testing_utils_1.getRecordingLogger)(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Successfully uploaded database for javascript") !== undefined);
        t.assert(databaseUploadSpy.calledOnceWith(sinon.match.string, sinon.match.has("baseUrl", "https://uploads.tenant.ghe.com")));
    });
});
//# sourceMappingURL=database-upload.test.js.map