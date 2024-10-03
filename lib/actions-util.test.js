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
const core = __importStar(require("@actions/core"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const api_client_1 = require("./api-client");
const environment_1 = require("./environment");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("getRef() throws on the empty string", async (t) => {
    process.env["GITHUB_REF"] = "";
    await t.throwsAsync(actionsUtil.getRef);
});
(0, ava_1.default)("getRef() returns merge PR ref if GITHUB_SHA still checked out", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const expectedRef = "refs/pull/1/merge";
        const currentSha = "a".repeat(40);
        process.env["GITHUB_REF"] = expectedRef;
        process.env["GITHUB_SHA"] = currentSha;
        const callback = sinon.stub(actionsUtil, "getCommitOid");
        callback.withArgs("HEAD").resolves(currentSha);
        const actualRef = await actionsUtil.getRef();
        t.deepEqual(actualRef, expectedRef);
        callback.restore();
    });
});
(0, ava_1.default)("getRef() returns merge PR ref if GITHUB_REF still checked out but sha has changed (actions checkout@v1)", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const expectedRef = "refs/pull/1/merge";
        process.env["GITHUB_REF"] = expectedRef;
        process.env["GITHUB_SHA"] = "b".repeat(40);
        const sha = "a".repeat(40);
        const callback = sinon.stub(actionsUtil, "getCommitOid");
        callback.withArgs("refs/remotes/pull/1/merge").resolves(sha);
        callback.withArgs("HEAD").resolves(sha);
        const actualRef = await actionsUtil.getRef();
        t.deepEqual(actualRef, expectedRef);
        callback.restore();
    });
});
(0, ava_1.default)("getRef() returns head PR ref if GITHUB_REF no longer checked out", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        process.env["GITHUB_REF"] = "refs/pull/1/merge";
        process.env["GITHUB_SHA"] = "a".repeat(40);
        const callback = sinon.stub(actionsUtil, "getCommitOid");
        callback.withArgs(tmpDir, "refs/pull/1/merge").resolves("a".repeat(40));
        callback.withArgs(tmpDir, "HEAD").resolves("b".repeat(40));
        const actualRef = await actionsUtil.getRef();
        t.deepEqual(actualRef, "refs/pull/1/head");
        callback.restore();
    });
});
(0, ava_1.default)("getRef() returns ref provided as an input and ignores current HEAD", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const getAdditionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
        getAdditionalInputStub.withArgs("ref").resolves("refs/pull/2/merge");
        getAdditionalInputStub.withArgs("sha").resolves("b".repeat(40));
        // These values are be ignored
        process.env["GITHUB_REF"] = "refs/pull/1/merge";
        process.env["GITHUB_SHA"] = "a".repeat(40);
        const callback = sinon.stub(actionsUtil, "getCommitOid");
        callback.withArgs("refs/pull/1/merge").resolves("b".repeat(40));
        callback.withArgs("HEAD").resolves("b".repeat(40));
        const actualRef = await actionsUtil.getRef();
        t.deepEqual(actualRef, "refs/pull/2/merge");
        callback.restore();
        getAdditionalInputStub.restore();
    });
});
(0, ava_1.default)("getRef() returns CODE_SCANNING_REF as a fallback for GITHUB_REF", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const expectedRef = "refs/pull/1/HEAD";
        const currentSha = "a".repeat(40);
        process.env["CODE_SCANNING_REF"] = expectedRef;
        process.env["GITHUB_REF"] = "";
        process.env["GITHUB_SHA"] = currentSha;
        const actualRef = await actionsUtil.getRef();
        t.deepEqual(actualRef, expectedRef);
    });
});
(0, ava_1.default)("getRef() returns GITHUB_REF over CODE_SCANNING_REF if both are provided", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const expectedRef = "refs/pull/1/merge";
        const currentSha = "a".repeat(40);
        process.env["CODE_SCANNING_REF"] = "refs/pull/1/HEAD";
        process.env["GITHUB_REF"] = expectedRef;
        process.env["GITHUB_SHA"] = currentSha;
        const actualRef = await actionsUtil.getRef();
        t.deepEqual(actualRef, expectedRef);
    });
});
(0, ava_1.default)("getRef() throws an error if only `ref` is provided as an input", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const getAdditionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
        getAdditionalInputStub.withArgs("ref").resolves("refs/pull/1/merge");
        await t.throwsAsync(async () => {
            await actionsUtil.getRef();
        }, {
            instanceOf: Error,
            message: "Both 'ref' and 'sha' are required if one of them is provided.",
        });
        getAdditionalInputStub.restore();
    });
});
(0, ava_1.default)("getRef() throws an error if only `sha` is provided as an input", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        process.env["GITHUB_WORKSPACE"] = "/tmp";
        const getAdditionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
        getAdditionalInputStub.withArgs("sha").resolves("a".repeat(40));
        await t.throwsAsync(async () => {
            await actionsUtil.getRef();
        }, {
            instanceOf: Error,
            message: "Both 'ref' and 'sha' are required if one of them is provided.",
        });
        getAdditionalInputStub.restore();
    });
});
(0, ava_1.default)("computeAutomationID()", async (t) => {
    let actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", '{"language": "javascript", "os": "linux"}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/");
    // check the environment sorting
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", '{"os": "linux", "language": "javascript"}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/");
    // check that an empty environment produces the right results
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", "{}");
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/");
    // check non string environment values
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", '{"number": 1, "object": {"language": "javascript"}}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/number:/object:/");
    // check undefined environment
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", undefined);
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/");
});
(0, ava_1.default)("initializeEnvironment", (t) => {
    (0, util_1.initializeEnvironment)("1.2.3");
    t.deepEqual(process.env[environment_1.EnvVar.VERSION], "1.2.3");
});
(0, ava_1.default)("isAnalyzingDefaultBranch()", async (t) => {
    process.env["GITHUB_EVENT_NAME"] = "push";
    process.env["CODE_SCANNING_IS_ANALYZING_DEFAULT_BRANCH"] = "true";
    t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), true);
    process.env["CODE_SCANNING_IS_ANALYZING_DEFAULT_BRANCH"] = "false";
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const envFile = path.join(tmpDir, "event.json");
        fs.writeFileSync(envFile, JSON.stringify({
            repository: {
                default_branch: "main",
            },
        }));
        process.env["GITHUB_EVENT_PATH"] = envFile;
        process.env["GITHUB_REF"] = "main";
        process.env["GITHUB_SHA"] = "1234";
        t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), true);
        process.env["GITHUB_REF"] = "refs/heads/main";
        t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), true);
        process.env["GITHUB_REF"] = "feature";
        t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), false);
        fs.writeFileSync(envFile, JSON.stringify({
            schedule: "0 0 * * *",
        }));
        process.env["GITHUB_EVENT_NAME"] = "schedule";
        process.env["GITHUB_REF"] = "refs/heads/main";
        t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), true);
        const getAdditionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
        getAdditionalInputStub
            .withArgs("ref")
            .resolves("refs/heads/something-else");
        getAdditionalInputStub
            .withArgs("sha")
            .resolves("0000000000000000000000000000000000000000");
        process.env["GITHUB_EVENT_NAME"] = "schedule";
        process.env["GITHUB_REF"] = "refs/heads/main";
        t.deepEqual(await actionsUtil.isAnalyzingDefaultBranch(), false);
        getAdditionalInputStub.restore();
    });
});
(0, ava_1.default)("determineBaseBranchHeadCommitOid non-pullrequest", async (t) => {
    const infoStub = sinon.stub(core, "info");
    process.env["GITHUB_EVENT_NAME"] = "hucairz";
    process.env["GITHUB_SHA"] = "100912429fab4cb230e66ffb11e738ac5194e73a";
    const result = await actionsUtil.determineBaseBranchHeadCommitOid(__dirname);
    t.deepEqual(result, undefined);
    t.deepEqual(0, infoStub.callCount);
    infoStub.restore();
});
(0, ava_1.default)("determineBaseBranchHeadCommitOid not git repository", async (t) => {
    const infoStub = sinon.stub(core, "info");
    process.env["GITHUB_EVENT_NAME"] = "pull_request";
    process.env["GITHUB_SHA"] = "100912429fab4cb230e66ffb11e738ac5194e73a";
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        await actionsUtil.determineBaseBranchHeadCommitOid(tmpDir);
    });
    t.deepEqual(1, infoStub.callCount);
    t.deepEqual(infoStub.firstCall.args[0], "git call failed. Will calculate the base branch SHA on the server. Error: " +
        "The checkout path provided to the action does not appear to be a git repository.");
    infoStub.restore();
});
(0, ava_1.default)("determineBaseBranchHeadCommitOid other error", async (t) => {
    const infoStub = sinon.stub(core, "info");
    process.env["GITHUB_EVENT_NAME"] = "pull_request";
    process.env["GITHUB_SHA"] = "100912429fab4cb230e66ffb11e738ac5194e73a";
    const result = await actionsUtil.determineBaseBranchHeadCommitOid(path.join(__dirname, "../../i-dont-exist"));
    t.deepEqual(result, undefined);
    t.deepEqual(1, infoStub.callCount);
    t.assert(infoStub.firstCall.args[0].startsWith("git call failed. Will calculate the base branch SHA on the server. Error: "));
    t.assert(!infoStub.firstCall.args[0].endsWith("The checkout path provided to the action does not appear to be a git repository."));
    infoStub.restore();
});
//# sourceMappingURL=actions-util.test.js.map