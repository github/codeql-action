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
    (0, util_1.initializeEnvironment)(util_1.Mode.actions, "1.2.3");
});
const testRepoName = { owner: "github", repo: "example" };
const testApiDetails = {
    auth: "1234",
    url: "https://github.com",
};
function getTestConfig(tmpDir) {
    return {
        languages: [languages_1.Language.javascript],
        queries: {},
        pathsIgnore: [],
        paths: [],
        originalUserInput: {},
        tempDir: tmpDir,
        toolCacheDir: tmpDir,
        codeQLCmd: "foo",
        gitHubVersion: { type: util_1.GitHubVariant.DOTCOM },
        dbLocation: tmpDir,
        packs: {},
    };
}
function getRecordingLogger(messages) {
    return {
        debug: (message) => {
            messages.push({ type: "debug", message });
            console.debug(message);
        },
        info: (message) => {
            messages.push({ type: "info", message });
            console.info(message);
        },
        warning: (message) => {
            messages.push({ type: "warning", message });
            console.warn(message);
        },
        error: (message) => {
            messages.push({ type: "error", message });
            console.error(message);
        },
        isDebug: () => true,
        startGroup: () => undefined,
        endGroup: () => undefined,
    };
}
function mockHttpRequests(optInStatusCode, databaseUploadStatusCode) {
    // Passing an auth token is required, so we just use a dummy value
    const client = github.getOctokit("123");
    const requestSpy = sinon.stub(client, "request");
    const optInSpy = requestSpy.withArgs("GET /repos/:owner/:repo/code-scanning/codeql/databases");
    if (optInStatusCode < 300) {
        optInSpy.resolves(undefined);
    }
    else {
        optInSpy.throws(new util_1.HTTPError("some error message", optInStatusCode));
    }
    if (databaseUploadStatusCode !== undefined) {
        const databaseUploadSpy = requestSpy.withArgs("PUT /repos/:owner/:repo/code-scanning/codeql/databases/:language");
        if (databaseUploadStatusCode < 300) {
            databaseUploadSpy.resolves(undefined);
        }
        else {
            databaseUploadSpy.throws(new util_1.HTTPError("some error message", databaseUploadStatusCode));
        }
    }
    sinon.stub(apiClient, "getApiClient").value(() => client);
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
        await (0, database_upload_1.uploadDatabases)(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Database upload disabled in workflow. Skipping upload.") !== undefined);
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
        await (0, database_upload_1.uploadDatabases)(testRepoName, config, testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Not running against github.com. Skipping upload.") !== undefined);
    });
});
(0, ava_1.default)("Abort database upload if running against GHAE", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        sinon
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        const config = getTestConfig(tmpDir);
        config.gitHubVersion = { type: util_1.GitHubVariant.GHAE };
        const loggedMessages = [];
        await (0, database_upload_1.uploadDatabases)(testRepoName, config, testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Not running against github.com. Skipping upload.") !== undefined);
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
        await (0, database_upload_1.uploadDatabases)(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Not analyzing default branch. Skipping upload.") !== undefined);
    });
});
(0, ava_1.default)("Abort database upload if opt-in request returns 404", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        sinon
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        mockHttpRequests(404);
        (0, codeql_1.setCodeQL)({
            async databaseBundle() {
                return;
            },
        });
        const loggedMessages = [];
        await (0, database_upload_1.uploadDatabases)(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message ===
                "Repository is not opted in to database uploads. Skipping upload.") !== undefined);
    });
});
(0, ava_1.default)("Abort database upload if opt-in request fails with something other than 404", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        sinon
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        mockHttpRequests(500);
        (0, codeql_1.setCodeQL)({
            async databaseBundle() {
                return;
            },
        });
        const loggedMessages = [];
        await (0, database_upload_1.uploadDatabases)(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "info" &&
            v.message ===
                "Skipping database upload due to unknown error: Error: some error message") !== undefined);
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
        mockHttpRequests(204, 500);
        (0, codeql_1.setCodeQL)({
            async databaseBundle(_, outputFilePath) {
                fs.writeFileSync(outputFilePath, "");
            },
        });
        const loggedMessages = [];
        await (0, database_upload_1.uploadDatabases)(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "warning" &&
            v.message ===
                "Failed to upload database for javascript: Error: some error message") !== undefined);
    });
});
(0, ava_1.default)("Successfully uploading a database", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        sinon
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        mockHttpRequests(204, 201);
        (0, codeql_1.setCodeQL)({
            async databaseBundle(_, outputFilePath) {
                fs.writeFileSync(outputFilePath, "");
            },
        });
        const loggedMessages = [];
        await (0, database_upload_1.uploadDatabases)(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Successfully uploaded database for javascript") !== undefined);
    });
});
//# sourceMappingURL=database-upload.test.js.map