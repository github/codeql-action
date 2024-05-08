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
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const logging_1 = require("./logging");
const setupCodeql = __importStar(require("./setup-codeql"));
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
ava_1.default.beforeEach(() => {
    (0, util_1.initializeEnvironment)("1.2.3");
});
(0, ava_1.default)("parse codeql bundle url version", (t) => {
    t.deepEqual(setupCodeql.getCodeQLURLVersion("https://github.com/.../codeql-bundle-20200601/..."), "20200601");
});
(0, ava_1.default)("convert to semver", (t) => {
    const tests = {
        "20200601": "0.0.0-20200601",
        "20200601.0": "0.0.0-20200601.0",
        "20200601.0.0": "20200601.0.0",
        "1.2.3": "1.2.3",
        "1.2.3-alpha": "1.2.3-alpha",
        "1.2.3-beta.1": "1.2.3-beta.1",
    };
    for (const [version, expectedVersion] of Object.entries(tests)) {
        try {
            const parsedVersion = setupCodeql.convertToSemVer(version, (0, logging_1.getRunnerLogger)(true));
            t.deepEqual(parsedVersion, expectedVersion);
        }
        catch (e) {
            t.fail((0, util_1.wrapError)(e).message);
        }
    }
});
(0, ava_1.default)("getCodeQLActionRepository", (t) => {
    const logger = (0, logging_1.getRunnerLogger)(true);
    (0, util_1.initializeEnvironment)("1.2.3");
    // isRunningLocalAction() === true
    delete process.env["GITHUB_ACTION_REPOSITORY"];
    process.env["RUNNER_TEMP"] = path.dirname(__dirname);
    const repoLocalRunner = setupCodeql.getCodeQLActionRepository(logger);
    t.deepEqual(repoLocalRunner, "github/codeql-action");
    // isRunningLocalAction() === false
    sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
    process.env["GITHUB_ACTION_REPOSITORY"] = "xxx/yyy";
    const repoEnv = setupCodeql.getCodeQLActionRepository(logger);
    t.deepEqual(repoEnv, "xxx/yyy");
});
(0, ava_1.default)("getCodeQLSource sets CLI version for a semver tagged bundle", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const tagName = "codeql-bundle-v1.2.3";
        (0, testing_utils_1.mockBundleDownloadApi)({ tagName });
        const source = await setupCodeql.getCodeQLSource(`https://github.com/github/codeql-action/releases/download/${tagName}/codeql-bundle-linux64.tar.gz`, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, util_1.GitHubVariant.DOTCOM, (0, logging_1.getRunnerLogger)(true));
        t.is(source.sourceType, "download");
        t.is(source["cliVersion"], "1.2.3");
    });
});
(0, ava_1.default)("getCodeQLSource correctly returns bundled CLI version when tools == linked", async (t) => {
    const loggedMessages = [];
    const logger = (0, testing_utils_1.getRecordingLogger)(loggedMessages);
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource("linked", testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, util_1.GitHubVariant.DOTCOM, logger);
        t.is(source.toolsVersion, testing_utils_1.LINKED_CLI_VERSION.cliVersion);
        t.is(source.sourceType, "download");
    });
});
(0, ava_1.default)("getCodeQLSource correctly returns bundled CLI version when tools == latest", async (t) => {
    const loggedMessages = [];
    const logger = (0, testing_utils_1.getRecordingLogger)(loggedMessages);
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const source = await setupCodeql.getCodeQLSource("latest", testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, util_1.GitHubVariant.DOTCOM, logger);
        t.is(source.toolsVersion, testing_utils_1.LINKED_CLI_VERSION.cliVersion);
        t.is(source.sourceType, "download");
    });
});
//# sourceMappingURL=setup-codeql.test.js.map