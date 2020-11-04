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
const testing_utils_1 = require("./testing-utils");
testing_utils_1.setupTests(ava_1.default);
ava_1.default("getRef() throws on the empty string", async (t) => {
    process.env["GITHUB_REF"] = "";
    await t.throwsAsync(actionsutil.getRef);
});
ava_1.default("getRef() returns merge PR ref if GITHUB_SHA still checked out", async (t) => {
    const expectedRef = "refs/pull/1/merge";
    const currentSha = "a".repeat(40);
    process.env["GITHUB_REF"] = expectedRef;
    process.env["GITHUB_SHA"] = currentSha;
    sinon_1.default.stub(actionsutil, "getCommitOid").resolves(currentSha);
    const actualRef = await actionsutil.getRef();
    t.deepEqual(actualRef, expectedRef);
});
ava_1.default("getRef() returns head PR ref if GITHUB_SHA not currently checked out", async (t) => {
    process.env["GITHUB_REF"] = "refs/pull/1/merge";
    process.env["GITHUB_SHA"] = "a".repeat(40);
    sinon_1.default.stub(actionsutil, "getCommitOid").resolves("b".repeat(40));
    const actualRef = await actionsutil.getRef();
    t.deepEqual(actualRef, "refs/pull/1/head");
});
ava_1.default("getAnalysisKey() when a local run", async (t) => {
    process.env.CODEQL_LOCAL_RUN = "true";
    process.env.CODEQL_ACTION_ANALYSIS_KEY = "";
    process.env.GITHUB_JOB = "";
    actionsutil.prepareLocalRunEnvironment();
    const actualAnalysisKey = await actionsutil.getAnalysisKey();
    t.deepEqual(actualAnalysisKey, "LOCAL-RUN:UNKNOWN-JOB");
});
ava_1.default("prepareEnvironment() when a local run", (t) => {
    process.env.CODEQL_LOCAL_RUN = "false";
    process.env.GITHUB_JOB = "YYY";
    process.env.CODEQL_ACTION_ANALYSIS_KEY = "TEST";
    actionsutil.prepareLocalRunEnvironment();
    // unchanged
    t.deepEqual(process.env.GITHUB_JOB, "YYY");
    t.deepEqual(process.env.CODEQL_ACTION_ANALYSIS_KEY, "TEST");
    process.env.CODEQL_LOCAL_RUN = "true";
    actionsutil.prepareLocalRunEnvironment();
    // unchanged
    t.deepEqual(process.env.GITHUB_JOB, "YYY");
    t.deepEqual(process.env.CODEQL_ACTION_ANALYSIS_KEY, "TEST");
    process.env.CODEQL_ACTION_ANALYSIS_KEY = "";
    actionsutil.prepareLocalRunEnvironment();
    // updated
    t.deepEqual(process.env.GITHUB_JOB, "YYY");
    t.deepEqual(process.env.CODEQL_ACTION_ANALYSIS_KEY, "LOCAL-RUN:YYY");
    process.env.GITHUB_JOB = "";
    process.env.CODEQL_ACTION_ANALYSIS_KEY = "";
    actionsutil.prepareLocalRunEnvironment();
    // updated
    t.deepEqual(process.env.GITHUB_JOB, "UNKNOWN-JOB");
    t.deepEqual(process.env.CODEQL_ACTION_ANALYSIS_KEY, "LOCAL-RUN:UNKNOWN-JOB");
});
//# sourceMappingURL=actions-util.test.js.map