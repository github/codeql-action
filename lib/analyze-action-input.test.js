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
const analyze = __importStar(require("./analyze"));
const api = __importStar(require("./api-client"));
const configUtils = __importStar(require("./config-utils"));
const gitUtils = __importStar(require("./git-utils"));
const statusReport = __importStar(require("./status-report"));
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
(0, testing_utils_1.setupTests)(ava_1.default);
// This test needs to be in its own file so that ava would run it in its own
// nodejs process. The code being tested is in analyze-action.ts, which runs
// immediately on load. So the file needs to be loaded during part of the test,
// and that can happen only once per nodejs process. If multiple such tests are
// in the same test file, ava would run them in the same nodejs process, and all
// but the first test would fail.
(0, ava_1.default)("analyze action with RAM & threads from action inputs", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        process.env["GITHUB_SERVER_URL"] = util.GITHUB_DOTCOM_URL;
        process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
        process.env["GITHUB_API_URL"] = "https://api.github.com";
        sinon
            .stub(statusReport, "createStatusReportBase")
            .resolves({});
        sinon.stub(statusReport, "sendStatusReport").resolves();
        const gitHubVersion = {
            type: util.GitHubVariant.DOTCOM,
        };
        sinon.stub(configUtils, "getConfig").resolves({
            gitHubVersion,
            languages: [],
            packs: [],
            trapCaches: {},
        });
        const requiredInputStub = sinon.stub(actionsUtil, "getRequiredInput");
        requiredInputStub.withArgs("token").returns("fake-token");
        requiredInputStub.withArgs("upload-database").returns("false");
        const optionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
        optionalInputStub.withArgs("cleanup-level").returns("none");
        optionalInputStub.withArgs("expect-error").returns("false");
        sinon.stub(api, "getGitHubVersion").resolves(gitHubVersion);
        sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, {});
        process.env["CODEQL_THREADS"] = "1";
        process.env["CODEQL_RAM"] = "4992";
        // Action inputs have precedence over environment variables.
        optionalInputStub.withArgs("threads").returns("-1");
        optionalInputStub.withArgs("ram").returns("3012");
        const runFinalizeStub = sinon.stub(analyze, "runFinalize");
        const runQueriesStub = sinon.stub(analyze, "runQueries");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const analyzeAction = require("./analyze-action");
        // When analyze-action.ts loads, it runs an async function from the top
        // level but does not wait for it to finish. To ensure that calls to
        // runFinalize and runQueries are correctly captured by spies, we explicitly
        // wait for the action promise to complete before starting verification.
        await analyzeAction.runPromise;
        t.deepEqual(runFinalizeStub.firstCall.args[1], "--threads=-1");
        t.deepEqual(runFinalizeStub.firstCall.args[2], "--ram=3012");
        t.deepEqual(runQueriesStub.firstCall.args[3], "--threads=-1");
        t.deepEqual(runQueriesStub.firstCall.args[1], "--ram=3012");
    });
});
//# sourceMappingURL=analyze-action-input.test.js.map