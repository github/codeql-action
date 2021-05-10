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
const yaml = __importStar(require("js-yaml"));
const sinon_1 = __importDefault(require("sinon"));
const actionsutil = __importStar(require("./actions-util"));
const testing_utils_1 = require("./testing-utils");
function errorCodes(actual, expected) {
    return [actual.map(({ code }) => code), expected.map(({ code }) => code)];
}
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
    const callback = sinon_1.default.stub(actionsutil, "getCommitOid");
    callback.withArgs("HEAD").resolves(currentSha);
    const actualRef = await actionsutil.getRef();
    t.deepEqual(actualRef, expectedRef);
    callback.restore();
});
ava_1.default("getRef() returns merge PR ref if GITHUB_REF still checked out but sha has changed (actions checkout@v1)", async (t) => {
    const expectedRef = "refs/pull/1/merge";
    process.env["GITHUB_REF"] = expectedRef;
    process.env["GITHUB_SHA"] = "b".repeat(40);
    const sha = "a".repeat(40);
    const callback = sinon_1.default.stub(actionsutil, "getCommitOid");
    callback.withArgs("refs/remotes/pull/1/merge").resolves(sha);
    callback.withArgs("HEAD").resolves(sha);
    const actualRef = await actionsutil.getRef();
    t.deepEqual(actualRef, expectedRef);
    callback.restore();
});
ava_1.default("getRef() returns head PR ref if GITHUB_REF no longer checked out", async (t) => {
    process.env["GITHUB_REF"] = "refs/pull/1/merge";
    process.env["GITHUB_SHA"] = "a".repeat(40);
    const callback = sinon_1.default.stub(actionsutil, "getCommitOid");
    callback.withArgs("refs/pull/1/merge").resolves("a".repeat(40));
    callback.withArgs("HEAD").resolves("b".repeat(40));
    const actualRef = await actionsutil.getRef();
    t.deepEqual(actualRef, "refs/pull/1/head");
    callback.restore();
});
ava_1.default("getAnalysisKey() when a local run", async (t) => {
    process.env.CODEQL_LOCAL_RUN = "true";
    process.env.CODEQL_ACTION_ANALYSIS_KEY = "";
    process.env.GITHUB_JOB = "";
    actionsutil.prepareLocalRunEnvironment();
    const actualAnalysisKey = await actionsutil.getAnalysisKey();
    t.deepEqual(actualAnalysisKey, "LOCAL-RUN:UNKNOWN-JOB");
});
ava_1.default("computeAutomationID()", async (t) => {
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
ava_1.default("getWorkflowErrors() when on is empty", (t) => {
    const errors = actionsutil.getWorkflowErrors({ on: {} });
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() when on.push is an array missing pull_request", (t) => {
    const errors = actionsutil.getWorkflowErrors({ on: ["push"] });
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() when on.push is an array missing push", (t) => {
    const errors = actionsutil.getWorkflowErrors({ on: ["pull_request"] });
    t.deepEqual(...errorCodes(errors, [actionsutil.WorkflowErrors.MissingPushHook]));
});
ava_1.default("getWorkflowErrors() when on.push is valid", (t) => {
    const errors = actionsutil.getWorkflowErrors({
        on: ["push", "pull_request"],
    });
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() when on.push is a valid superset", (t) => {
    const errors = actionsutil.getWorkflowErrors({
        on: ["push", "pull_request", "schedule"],
    });
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() when on.push should not have a path", (t) => {
    const errors = actionsutil.getWorkflowErrors({
        on: {
            push: { branches: ["main"], paths: ["test/*"] },
            pull_request: { branches: ["main"] },
        },
    });
    t.deepEqual(...errorCodes(errors, [actionsutil.WorkflowErrors.PathsSpecified]));
});
ava_1.default("getWorkflowErrors() when on.push is a correct object", (t) => {
    const errors = actionsutil.getWorkflowErrors({
        on: { push: { branches: ["main"] }, pull_request: { branches: ["main"] } },
    });
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() when on.pull_requests is a string", (t) => {
    const errors = actionsutil.getWorkflowErrors({
        on: { push: { branches: ["main"] }, pull_request: { branches: "*" } },
    });
    t.deepEqual(...errorCodes(errors, [actionsutil.WorkflowErrors.MismatchedBranches]));
});
ava_1.default("getWorkflowErrors() when on.pull_requests is a string and correct", (t) => {
    const errors = actionsutil.getWorkflowErrors({
        on: { push: { branches: "*" }, pull_request: { branches: "*" } },
    });
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() when on.push is correct with empty objects", (t) => {
    const errors = actionsutil.getWorkflowErrors(yaml.safeLoad(`
on:
  push:
  pull_request:
`));
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() when on.push is mismatched", (t) => {
    const errors = actionsutil.getWorkflowErrors({
        on: {
            push: { branches: ["main"] },
            pull_request: { branches: ["feature"] },
        },
    });
    t.deepEqual(...errorCodes(errors, [actionsutil.WorkflowErrors.MismatchedBranches]));
});
ava_1.default("getWorkflowErrors() when on.push is not mismatched", (t) => {
    const errors = actionsutil.getWorkflowErrors({
        on: {
            push: { branches: ["main", "feature"] },
            pull_request: { branches: ["main"] },
        },
    });
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() when on.push is mismatched for pull_request", (t) => {
    const errors = actionsutil.getWorkflowErrors({
        on: {
            push: { branches: ["main"] },
            pull_request: { branches: ["main", "feature"] },
        },
    });
    t.deepEqual(...errorCodes(errors, [actionsutil.WorkflowErrors.MismatchedBranches]));
});
ava_1.default("getWorkflowErrors() for a range of malformed workflows", (t) => {
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors({
        on: {
            push: 1,
            pull_request: 1,
        },
    }), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors({
        on: 1,
    }), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors({
        on: 1,
        jobs: 1,
    }), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors({
        on: 1,
        jobs: [1],
    }), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { 1: 1 },
    }), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { test: 1 },
    }), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { test: [1] },
    }), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { test: { steps: 1 } },
    }), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { test: { steps: [{ notrun: "git checkout HEAD^2" }] } },
    }), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { test: [undefined] },
    }), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors(1), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors({
        on: {
            push: {
                branches: 1,
            },
            pull_request: {
                branches: 1,
            },
        },
    }), []));
});
ava_1.default("getWorkflowErrors() when on.pull_request for every branch but push specifies branches", (t) => {
    const errors = actionsutil.getWorkflowErrors(yaml.safeLoad(`
name: "CodeQL"
on:
  push:
    branches: ["main"]
  pull_request:
`));
    t.deepEqual(...errorCodes(errors, [actionsutil.WorkflowErrors.MismatchedBranches]));
});
ava_1.default("getWorkflowErrors() when on.pull_request for wildcard branches", (t) => {
    const errors = actionsutil.getWorkflowErrors({
        on: {
            push: { branches: ["feature/*"] },
            pull_request: { branches: "feature/moose" },
        },
    });
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() when on.pull_request for mismatched wildcard branches", (t) => {
    const errors = actionsutil.getWorkflowErrors({
        on: {
            push: { branches: ["feature/moose"] },
            pull_request: { branches: "feature/*" },
        },
    });
    t.deepEqual(...errorCodes(errors, [actionsutil.WorkflowErrors.MismatchedBranches]));
});
ava_1.default("getWorkflowErrors() when HEAD^2 is checked out", (t) => {
    process.env.GITHUB_JOB = "test";
    const errors = actionsutil.getWorkflowErrors({
        on: ["push", "pull_request"],
        jobs: { test: { steps: [{ run: "git checkout HEAD^2" }] } },
    });
    t.deepEqual(...errorCodes(errors, [actionsutil.WorkflowErrors.CheckoutWrongHead]));
});
ava_1.default("formatWorkflowErrors() when there is one error", (t) => {
    const message = actionsutil.formatWorkflowErrors([
        actionsutil.WorkflowErrors.CheckoutWrongHead,
    ]);
    t.true(message.startsWith("1 issue was detected with this workflow:"));
});
ava_1.default("formatWorkflowErrors() when there are multiple errors", (t) => {
    const message = actionsutil.formatWorkflowErrors([
        actionsutil.WorkflowErrors.CheckoutWrongHead,
        actionsutil.WorkflowErrors.PathsSpecified,
    ]);
    t.true(message.startsWith("2 issues were detected with this workflow:"));
});
ava_1.default("formatWorkflowCause() with no errors", (t) => {
    const message = actionsutil.formatWorkflowCause([]);
    t.deepEqual(message, undefined);
});
ava_1.default("formatWorkflowCause()", (t) => {
    const message = actionsutil.formatWorkflowCause([
        actionsutil.WorkflowErrors.CheckoutWrongHead,
        actionsutil.WorkflowErrors.PathsSpecified,
    ]);
    t.deepEqual(message, "CheckoutWrongHead,PathsSpecified");
    t.deepEqual(actionsutil.formatWorkflowCause([]), undefined);
});
ava_1.default("patternIsSuperset()", (t) => {
    t.false(actionsutil.patternIsSuperset("main-*", "main"));
    t.true(actionsutil.patternIsSuperset("*", "*"));
    t.true(actionsutil.patternIsSuperset("*", "main-*"));
    t.false(actionsutil.patternIsSuperset("main-*", "*"));
    t.false(actionsutil.patternIsSuperset("main-*", "main"));
    t.true(actionsutil.patternIsSuperset("main", "main"));
    t.false(actionsutil.patternIsSuperset("*", "feature/*"));
    t.true(actionsutil.patternIsSuperset("**", "feature/*"));
    t.false(actionsutil.patternIsSuperset("feature-*", "**"));
    t.false(actionsutil.patternIsSuperset("a/**/c", "a/**/d"));
    t.false(actionsutil.patternIsSuperset("a/**/c", "a/**"));
    t.true(actionsutil.patternIsSuperset("a/**", "a/**/c"));
    t.true(actionsutil.patternIsSuperset("a/**/c", "a/main-**/c"));
    t.false(actionsutil.patternIsSuperset("a/**/b/**/c", "a/**/d/**/c"));
    t.true(actionsutil.patternIsSuperset("a/**/b/**/c", "a/**/b/c/**/c"));
    t.true(actionsutil.patternIsSuperset("a/**/b/**/c", "a/**/b/d/**/c"));
    t.false(actionsutil.patternIsSuperset("a/**/c/d/**/c", "a/**/b/**/c"));
    t.false(actionsutil.patternIsSuperset("a/main-**/c", "a/**/c"));
    t.true(actionsutil.patternIsSuperset("/robin/*/release/*", "/robin/moose/release/goose"));
    t.false(actionsutil.patternIsSuperset("/robin/moose/release/goose", "/robin/*/release/*"));
});
ava_1.default("getWorkflowErrors() when branches contain dots", (t) => {
    const errors = actionsutil.getWorkflowErrors(yaml.safeLoad(`
  on:
    push:
      branches: [4.1, master]
    pull_request:
      # The branches below must be a subset of the branches above
      branches: [4.1, master]
`));
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() when on.push has a trailing comma", (t) => {
    const errors = actionsutil.getWorkflowErrors(yaml.safeLoad(`
name: "CodeQL"
on:
  push:
    branches: [master, ]
  pull_request:
    # The branches below must be a subset of the branches above
    branches: [master]
`));
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() should only report the current job's CheckoutWrongHead", (t) => {
    process.env.GITHUB_JOB = "test";
    const errors = actionsutil.getWorkflowErrors(yaml.safeLoad(`
name: "CodeQL"
on:
  push:
    branches: [master]
  pull_request:
    # The branches below must be a subset of the branches above
    branches: [master]
jobs:
  test:
    steps:
      - run: "git checkout HEAD^2"

  test2:
    steps:
      - run: "git checkout HEAD^2"

  test3:
    steps: []
`));
    t.deepEqual(...errorCodes(errors, [actionsutil.WorkflowErrors.CheckoutWrongHead]));
});
ava_1.default("getWorkflowErrors() should not report a different job's CheckoutWrongHead", (t) => {
    process.env.GITHUB_JOB = "test3";
    const errors = actionsutil.getWorkflowErrors(yaml.safeLoad(`
name: "CodeQL"
on:
  push:
    branches: [master]
  pull_request:
    # The branches below must be a subset of the branches above
    branches: [master]
jobs:
  test:
    steps:
      - run: "git checkout HEAD^2"

  test2:
    steps:
      - run: "git checkout HEAD^2"

  test3:
    steps: []
`));
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() when on is missing", (t) => {
    const errors = actionsutil.getWorkflowErrors(yaml.safeLoad(`
name: "CodeQL"
`));
    t.deepEqual(...errorCodes(errors, []));
});
ava_1.default("getWorkflowErrors() with a different on setup", (t) => {
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors(yaml.safeLoad(`
name: "CodeQL"
on: "workflow_dispatch"
`)), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors(yaml.safeLoad(`
name: "CodeQL"
on: [workflow_dispatch]
`)), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors(yaml.safeLoad(`
name: "CodeQL"
on:
  workflow_dispatch: {}
`)), []));
});
ava_1.default("getWorkflowErrors() should not report an error if PRs are totally unconfigured", (t) => {
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors(yaml.safeLoad(`
name: "CodeQL"
on:
  push:
    branches: [master]
`)), []));
    t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors(yaml.safeLoad(`
name: "CodeQL"
on: ["push"]
`)), []));
});
//# sourceMappingURL=actions-util.test.js.map