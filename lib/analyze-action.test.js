"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const sinon_1 = __importDefault(require("sinon"));
const actionsutil = __importStar(require("./actions-util"));
const analyze_action_1 = require("./analyze-action");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
testing_utils_1.setupTests(ava_1.default);
const testRepoName = { owner: "github", repo: "example" };
const testApiDetails = {
    auth: "1234",
    url: "https://example.github.com"
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
        dbLocation: "foo",
        packs: {}
    };
}
function getRecordingLogger(messages) {
    const baseLogger = logging_1.getRunnerLogger(true);
    return {
        debug: (message) => {
            messages.push({ type: "debug", message });
            baseLogger.debug(message);
        },
        info: (message) => {
            messages.push({ type: "info", message });
            baseLogger.info(message);
        },
        warning: (message) => {
            messages.push({ type: "warning", message });
            baseLogger.warning(message);
        },
        error: (message) => {
            messages.push({ type: "error", message });
            baseLogger.error(message);
        },
        isDebug: () => true,
        startGroup: () => undefined,
        endGroup: () => undefined,
    };
}
ava_1.default("Abort database upload if 'upload-database' input set to false", async (t) => {
    await util_1.withTmpDir(async (tmpDir) => {
        const callback = sinon_1.default.stub(actionsutil, "getRequiredInput");
        callback.withArgs("upload-database").resolves("false");
        const loggedMessages = [];
        await analyze_action_1.uploadDatabases(testRepoName, await getTestConfig(tmpDir), testApiDetails, getRecordingLogger(loggedMessages));
        t.assert(loggedMessages.find((v) => v.type === "debug" && v.message === "Database upload disabled in workflow. Skipping upload.") !== undefined);
        callback.restore();
    });
});
//# sourceMappingURL=analyze-action.test.js.map