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
const github = __importStar(require("@actions/github"));
const ava_1 = __importDefault(require("ava"));
const sinon_1 = __importDefault(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const apiClient = __importStar(require("./api-client"));
const codeql_1 = require("./codeql");
const database_upload_1 = require("./database-upload");
const languages_1 = require("./languages");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
testing_utils_1.setupTests(ava_1.default);
ava_1.default.beforeEach(() => {
    util_1.initializeEnvironment(util_1.Mode.actions, "1.2.3");
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
    const requestSpy = sinon_1.default.stub(client, "request");
    const optInSpy = requestSpy.withArgs("GET /repos/:owner/:repo/code-scanning/codeql/databases");
    if (optInStatusCode < 300) {
        optInSpy.resolves(undefined);
    }
    else {
        optInSpy.throws(new util_1.HTTPError("some error message", optInStatusCode));
    }
    if (databaseUploadStatusCode !== undefined) {
        const databaseUploadSpy = requestSpy.withArgs("PUT /repos/:owner/:repo/code-scanning/codeql/databases/javascript");
        if (databaseUploadStatusCode < 300) {
            databaseUploadSpy.resolves(undefined);
        }
        else {
            databaseUploadSpy.throws(new util_1.HTTPError("some error message", databaseUploadStatusCode));
        }
    }
    sinon_1.default.stub(apiClient, "getApiClient").value(() => client);
}
ava_1.default("Abort database upload if 'upload-database' input set to false", async (t) => {
    await util_1.withTmpDir(async (tmpDir) => {
        testing_utils_1.setupActionsVars(tmpDir, tmpDir);
        sinon_1.default
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("false");
        sinon_1.default.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        const loggedMessages = [];
        await database_upload_1.uploadDatabases(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Database upload disabled in workflow. Skipping upload.") !== undefined);
    });
});
ava_1.default("Abort database upload if running against GHES", async (t) => {
    await util_1.withTmpDir(async (tmpDir) => {
        testing_utils_1.setupActionsVars(tmpDir, tmpDir);
        sinon_1.default
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon_1.default.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        const config = getTestConfig(tmpDir);
        config.gitHubVersion = { type: util_1.GitHubVariant.GHES, version: "3.0" };
        const loggedMessages = [];
        await database_upload_1.uploadDatabases(testRepoName, config, testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Not running against github.com. Skipping upload.") !== undefined);
    });
});
ava_1.default("Abort database upload if running against GHAE", async (t) => {
    await util_1.withTmpDir(async (tmpDir) => {
        testing_utils_1.setupActionsVars(tmpDir, tmpDir);
        sinon_1.default
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon_1.default.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        const config = getTestConfig(tmpDir);
        config.gitHubVersion = { type: util_1.GitHubVariant.GHAE };
        const loggedMessages = [];
        await database_upload_1.uploadDatabases(testRepoName, config, testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Not running against github.com. Skipping upload.") !== undefined);
    });
});
ava_1.default("Abort database upload if not analyzing default branch", async (t) => {
    await util_1.withTmpDir(async (tmpDir) => {
        testing_utils_1.setupActionsVars(tmpDir, tmpDir);
        sinon_1.default
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon_1.default.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(false);
        const loggedMessages = [];
        await database_upload_1.uploadDatabases(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Not analyzing default branch. Skipping upload.") !== undefined);
    });
});
ava_1.default("Abort database upload if opt-in request returns 404", async (t) => {
    await util_1.withTmpDir(async (tmpDir) => {
        testing_utils_1.setupActionsVars(tmpDir, tmpDir);
        sinon_1.default
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon_1.default.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        mockHttpRequests(404);
        codeql_1.setCodeQL({
            async databaseBundle() {
                return;
            },
        });
        const loggedMessages = [];
        await database_upload_1.uploadDatabases(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message ===
                "Repository is not opted in to database uploads. Skipping upload.") !== undefined);
    });
});
ava_1.default("Abort database upload if opt-in request fails with something other than 404", async (t) => {
    await util_1.withTmpDir(async (tmpDir) => {
        testing_utils_1.setupActionsVars(tmpDir, tmpDir);
        sinon_1.default
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon_1.default.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        mockHttpRequests(500);
        codeql_1.setCodeQL({
            async databaseBundle() {
                return;
            },
        });
        const loggedMessages = [];
        await database_upload_1.uploadDatabases(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "info" &&
            v.message ===
                "Skipping database upload due to unknown error: Error: some error message") !== undefined);
    });
});
ava_1.default("Don't crash if uploading a database fails", async (t) => {
    await util_1.withTmpDir(async (tmpDir) => {
        testing_utils_1.setupActionsVars(tmpDir, tmpDir);
        sinon_1.default
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon_1.default.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        mockHttpRequests(204, 500);
        codeql_1.setCodeQL({
            async databaseBundle(_, outputFilePath) {
                fs.writeFileSync(outputFilePath, "");
            },
        });
        const loggedMessages = [];
        await database_upload_1.uploadDatabases(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "warning" &&
            v.message ===
                "Failed to upload database for javascript: Error: some error message") !== undefined);
    });
});
ava_1.default("Successfully uploading a database", async (t) => {
    await util_1.withTmpDir(async (tmpDir) => {
        testing_utils_1.setupActionsVars(tmpDir, tmpDir);
        sinon_1.default
            .stub(actionsUtil, "getRequiredInput")
            .withArgs("upload-database")
            .returns("true");
        sinon_1.default.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        mockHttpRequests(204, 201);
        codeql_1.setCodeQL({
            async databaseBundle(_, outputFilePath) {
                fs.writeFileSync(outputFilePath, "");
            },
        });
        const loggedMessages = [];
        await database_upload_1.uploadDatabases(testRepoName, getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" &&
            v.message === "Successfully uploaded database for javascript") !== undefined);
    });
});
//# sourceMappingURL=database-upload.test.js.map