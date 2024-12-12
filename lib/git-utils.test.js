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
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const gitUtils = __importStar(require("./git-utils"));
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("getRef() throws on the empty string", async (t) => {
    process.env["GITHUB_REF"] = "";
    await t.throwsAsync(gitUtils.getRef);
});
(0, ava_1.default)("getRef() returns merge PR ref if GITHUB_SHA still checked out", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const expectedRef = "refs/pull/1/merge";
        const currentSha = "a".repeat(40);
        process.env["GITHUB_REF"] = expectedRef;
        process.env["GITHUB_SHA"] = currentSha;
        const callback = sinon.stub(gitUtils, "getCommitOid");
        callback.withArgs("HEAD").resolves(currentSha);
        const actualRef = await gitUtils.getRef();
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
        const callback = sinon.stub(gitUtils, "getCommitOid");
        callback.withArgs("refs/remotes/pull/1/merge").resolves(sha);
        callback.withArgs("HEAD").resolves(sha);
        const actualRef = await gitUtils.getRef();
        t.deepEqual(actualRef, expectedRef);
        callback.restore();
    });
});
(0, ava_1.default)("getRef() returns head PR ref if GITHUB_REF no longer checked out", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        process.env["GITHUB_REF"] = "refs/pull/1/merge";
        process.env["GITHUB_SHA"] = "a".repeat(40);
        const callback = sinon.stub(gitUtils, "getCommitOid");
        callback.withArgs(tmpDir, "refs/pull/1/merge").resolves("a".repeat(40));
        callback.withArgs(tmpDir, "HEAD").resolves("b".repeat(40));
        const actualRef = await gitUtils.getRef();
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
        const callback = sinon.stub(gitUtils, "getCommitOid");
        callback.withArgs("refs/pull/1/merge").resolves("b".repeat(40));
        callback.withArgs("HEAD").resolves("b".repeat(40));
        const actualRef = await gitUtils.getRef();
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
        const actualRef = await gitUtils.getRef();
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
        const actualRef = await gitUtils.getRef();
        t.deepEqual(actualRef, expectedRef);
    });
});
(0, ava_1.default)("getRef() throws an error if only `ref` is provided as an input", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const getAdditionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
        getAdditionalInputStub.withArgs("ref").resolves("refs/pull/1/merge");
        await t.throwsAsync(async () => {
            await gitUtils.getRef();
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
            await gitUtils.getRef();
        }, {
            instanceOf: Error,
            message: "Both 'ref' and 'sha' are required if one of them is provided.",
        });
        getAdditionalInputStub.restore();
    });
});
(0, ava_1.default)("isAnalyzingDefaultBranch()", async (t) => {
    process.env["GITHUB_EVENT_NAME"] = "push";
    process.env["CODE_SCANNING_IS_ANALYZING_DEFAULT_BRANCH"] = "true";
    t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), true);
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
        t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), true);
        process.env["GITHUB_REF"] = "refs/heads/main";
        t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), true);
        process.env["GITHUB_REF"] = "feature";
        t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), false);
        fs.writeFileSync(envFile, JSON.stringify({
            schedule: "0 0 * * *",
        }));
        process.env["GITHUB_EVENT_NAME"] = "schedule";
        process.env["GITHUB_REF"] = "refs/heads/main";
        t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), true);
        const getAdditionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
        getAdditionalInputStub
            .withArgs("ref")
            .resolves("refs/heads/something-else");
        getAdditionalInputStub
            .withArgs("sha")
            .resolves("0000000000000000000000000000000000000000");
        process.env["GITHUB_EVENT_NAME"] = "schedule";
        process.env["GITHUB_REF"] = "refs/heads/main";
        t.deepEqual(await gitUtils.isAnalyzingDefaultBranch(), false);
        getAdditionalInputStub.restore();
    });
});
(0, ava_1.default)("determineBaseBranchHeadCommitOid non-pullrequest", async (t) => {
    const infoStub = sinon.stub(core, "info");
    process.env["GITHUB_EVENT_NAME"] = "hucairz";
    process.env["GITHUB_SHA"] = "100912429fab4cb230e66ffb11e738ac5194e73a";
    const result = await gitUtils.determineBaseBranchHeadCommitOid(__dirname);
    t.deepEqual(result, undefined);
    t.deepEqual(0, infoStub.callCount);
    infoStub.restore();
});
(0, ava_1.default)("determineBaseBranchHeadCommitOid not git repository", async (t) => {
    const infoStub = sinon.stub(core, "info");
    process.env["GITHUB_EVENT_NAME"] = "pull_request";
    process.env["GITHUB_SHA"] = "100912429fab4cb230e66ffb11e738ac5194e73a";
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        await gitUtils.determineBaseBranchHeadCommitOid(tmpDir);
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
    const result = await gitUtils.determineBaseBranchHeadCommitOid(path.join(__dirname, "../../i-dont-exist"));
    t.deepEqual(result, undefined);
    t.deepEqual(1, infoStub.callCount);
    t.assert(infoStub.firstCall.args[0].startsWith("git call failed. Will calculate the base branch SHA on the server. Error: "));
    t.assert(!infoStub.firstCall.args[0].endsWith("The checkout path provided to the action does not appear to be a git repository."));
    infoStub.restore();
});
(0, ava_1.default)("decodeGitFilePath unquoted strings", async (t) => {
    t.deepEqual(gitUtils.decodeGitFilePath("foo"), "foo");
    t.deepEqual(gitUtils.decodeGitFilePath("foo bar"), "foo bar");
    t.deepEqual(gitUtils.decodeGitFilePath("foo\\\\bar"), "foo\\\\bar");
    t.deepEqual(gitUtils.decodeGitFilePath('foo\\"bar'), 'foo\\"bar');
    t.deepEqual(gitUtils.decodeGitFilePath("foo\\001bar"), "foo\\001bar");
    t.deepEqual(gitUtils.decodeGitFilePath("foo\\abar"), "foo\\abar");
    t.deepEqual(gitUtils.decodeGitFilePath("foo\\bbar"), "foo\\bbar");
    t.deepEqual(gitUtils.decodeGitFilePath("foo\\fbar"), "foo\\fbar");
    t.deepEqual(gitUtils.decodeGitFilePath("foo\\nbar"), "foo\\nbar");
    t.deepEqual(gitUtils.decodeGitFilePath("foo\\rbar"), "foo\\rbar");
    t.deepEqual(gitUtils.decodeGitFilePath("foo\\tbar"), "foo\\tbar");
    t.deepEqual(gitUtils.decodeGitFilePath("foo\\vbar"), "foo\\vbar");
    t.deepEqual(gitUtils.decodeGitFilePath("\\a\\b\\f\\n\\r\\t\\v"), "\\a\\b\\f\\n\\r\\t\\v");
});
(0, ava_1.default)("decodeGitFilePath quoted strings", async (t) => {
    t.deepEqual(gitUtils.decodeGitFilePath('"foo"'), "foo");
    t.deepEqual(gitUtils.decodeGitFilePath('"foo bar"'), "foo bar");
    t.deepEqual(gitUtils.decodeGitFilePath('"foo\\\\bar"'), "foo\\bar");
    t.deepEqual(gitUtils.decodeGitFilePath('"foo\\"bar"'), 'foo"bar');
    t.deepEqual(gitUtils.decodeGitFilePath('"foo\\001bar"'), "foo\x01bar");
    t.deepEqual(gitUtils.decodeGitFilePath('"foo\\abar"'), "foo\x07bar");
    t.deepEqual(gitUtils.decodeGitFilePath('"foo\\bbar"'), "foo\bbar");
    t.deepEqual(gitUtils.decodeGitFilePath('"foo\\fbar"'), "foo\fbar");
    t.deepEqual(gitUtils.decodeGitFilePath('"foo\\nbar"'), "foo\nbar");
    t.deepEqual(gitUtils.decodeGitFilePath('"foo\\rbar"'), "foo\rbar");
    t.deepEqual(gitUtils.decodeGitFilePath('"foo\\tbar"'), "foo\tbar");
    t.deepEqual(gitUtils.decodeGitFilePath('"foo\\vbar"'), "foo\vbar");
    t.deepEqual(gitUtils.decodeGitFilePath('"\\a\\b\\f\\n\\r\\t\\v"'), "\x07\b\f\n\r\t\v");
});
//# sourceMappingURL=git-utils.test.js.map