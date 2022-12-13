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
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsutil = __importStar(require("./actions-util"));
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("getRef() throws on the empty string", async (t) => {
    process.env["GITHUB_REF"] = "";
    await t.throwsAsync(actionsutil.getRef);
});
(0, ava_1.default)("getRef() returns merge PR ref if GITHUB_SHA still checked out", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const expectedRef = "refs/pull/1/merge";
        const currentSha = "a".repeat(40);
        process.env["GITHUB_REF"] = expectedRef;
        process.env["GITHUB_SHA"] = currentSha;
        const callback = sinon.stub(actionsutil, "getCommitOid");
        callback.withArgs("HEAD").resolves(currentSha);
        const actualRef = await actionsutil.getRef();
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
        const callback = sinon.stub(actionsutil, "getCommitOid");
        callback.withArgs("refs/remotes/pull/1/merge").resolves(sha);
        callback.withArgs("HEAD").resolves(sha);
        const actualRef = await actionsutil.getRef();
        t.deepEqual(actualRef, expectedRef);
        callback.restore();
    });
});
(0, ava_1.default)("getRef() returns head PR ref if GITHUB_REF no longer checked out", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        process.env["GITHUB_REF"] = "refs/pull/1/merge";
        process.env["GITHUB_SHA"] = "a".repeat(40);
        const callback = sinon.stub(actionsutil, "getCommitOid");
        callback.withArgs(tmpDir, "refs/pull/1/merge").resolves("a".repeat(40));
        callback.withArgs(tmpDir, "HEAD").resolves("b".repeat(40));
        const actualRef = await actionsutil.getRef();
        t.deepEqual(actualRef, "refs/pull/1/head");
        callback.restore();
    });
});
(0, ava_1.default)("getRef() returns ref provided as an input and ignores current HEAD", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const getAdditionalInputStub = sinon.stub(actionsutil, "getOptionalInput");
        getAdditionalInputStub.withArgs("ref").resolves("refs/pull/2/merge");
        getAdditionalInputStub.withArgs("sha").resolves("b".repeat(40));
        // These values are be ignored
        process.env["GITHUB_REF"] = "refs/pull/1/merge";
        process.env["GITHUB_SHA"] = "a".repeat(40);
        const callback = sinon.stub(actionsutil, "getCommitOid");
        callback.withArgs("refs/pull/1/merge").resolves("b".repeat(40));
        callback.withArgs("HEAD").resolves("b".repeat(40));
        const actualRef = await actionsutil.getRef();
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
        const actualRef = await actionsutil.getRef();
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
        const actualRef = await actionsutil.getRef();
        t.deepEqual(actualRef, expectedRef);
    });
});
(0, ava_1.default)("getRef() throws an error if only `ref` is provided as an input", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const getAdditionalInputStub = sinon.stub(actionsutil, "getOptionalInput");
        getAdditionalInputStub.withArgs("ref").resolves("refs/pull/1/merge");
        await t.throwsAsync(async () => {
            await actionsutil.getRef();
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
        const getAdditionalInputStub = sinon.stub(actionsutil, "getOptionalInput");
        getAdditionalInputStub.withArgs("sha").resolves("a".repeat(40));
        await t.throwsAsync(async () => {
            await actionsutil.getRef();
        }, {
            instanceOf: Error,
            message: "Both 'ref' and 'sha' are required if one of them is provided.",
        });
        getAdditionalInputStub.restore();
    });
});
(0, ava_1.default)("computeAutomationID()", async (t) => {
    let actualAutomationID = actionsutil.computeAutomationID(".github/workflows/codeql-analysis.yml:analyze", '{"language": "javascript", "os": "linux"}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/");
    // check the environment sorting
    actualAutomationID = actionsutil.computeAutomationID(".github/workflows/codeql-analysis.yml:analyze", '{"os": "linux", "language": "javascript"}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/");
    // check that an empty environment produces the right results
    actualAutomationID = actionsutil.computeAutomationID(".github/workflows/codeql-analysis.yml:analyze", "{}");
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/");
    // check non string environment values
    actualAutomationID = actionsutil.computeAutomationID(".github/workflows/codeql-analysis.yml:analyze", '{"number": 1, "object": {"language": "javascript"}}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/number:/object:/");
    // check undefined environment
    actualAutomationID = actionsutil.computeAutomationID(".github/workflows/codeql-analysis.yml:analyze", undefined);
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/");
});
(0, ava_1.default)("initializeEnvironment", (t) => {
    (0, util_1.initializeEnvironment)("1.2.3");
    t.deepEqual(process.env.CODEQL_ACTION_VERSION, "1.2.3");
});
(0, ava_1.default)("isAnalyzingDefaultBranch()", async (t) => {
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
        t.deepEqual(await actionsutil.isAnalyzingDefaultBranch(), true);
        process.env["GITHUB_REF"] = "refs/heads/main";
        t.deepEqual(await actionsutil.isAnalyzingDefaultBranch(), true);
        process.env["GITHUB_REF"] = "feature";
        t.deepEqual(await actionsutil.isAnalyzingDefaultBranch(), false);
        fs.writeFileSync(envFile, JSON.stringify({
            schedule: "0 0 * * *",
        }));
        process.env["GITHUB_EVENT_NAME"] = "schedule";
        process.env["GITHUB_REF"] = "refs/heads/main";
        t.deepEqual(await actionsutil.isAnalyzingDefaultBranch(), true);
        const getAdditionalInputStub = sinon.stub(actionsutil, "getOptionalInput");
        getAdditionalInputStub
            .withArgs("ref")
            .resolves("refs/heads/something-else");
        getAdditionalInputStub
            .withArgs("sha")
            .resolves("0000000000000000000000000000000000000000");
        process.env["GITHUB_EVENT_NAME"] = "schedule";
        process.env["GITHUB_REF"] = "refs/heads/main";
        t.deepEqual(await actionsutil.isAnalyzingDefaultBranch(), false);
        getAdditionalInputStub.restore();
    });
});
(0, ava_1.default)("workflowEventName()", async (t) => {
    process.env["GITHUB_EVENT_NAME"] = "push";
    t.deepEqual(actionsutil.workflowEventName(), "push");
    process.env["GITHUB_EVENT_NAME"] = "dynamic";
    t.deepEqual(actionsutil.workflowEventName(), "dynamic");
    process.env["CODESCANNING_EVENT_NAME"] = "push";
    t.deepEqual(actionsutil.workflowEventName(), "push");
});
//# sourceMappingURL=actions-util.test.js.map