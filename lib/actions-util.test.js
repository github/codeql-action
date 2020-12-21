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
ava_1.default("validateWorkflow() when on is missing", (t) => {
    const errors = actionsutil.validateWorkflow({});
    t.deepEqual(errors, [actionsutil.WorkflowErrors.MissingHooks]);
});
ava_1.default("validateWorkflow() when on.push is missing", (t) => {
    const errors = actionsutil.validateWorkflow({ on: {} });
    console.log(errors);
    t.deepEqual(errors, [actionsutil.WorkflowErrors.MissingHooks]);
});
ava_1.default("validateWorkflow() when on.push is an array missing pull_request", (t) => {
    const errors = actionsutil.validateWorkflow({ on: ["push"] });
    t.deepEqual(errors, [actionsutil.WorkflowErrors.MissingPullRequestHook]);
});
ava_1.default("validateWorkflow() when on.push is an array missing push", (t) => {
    const errors = actionsutil.validateWorkflow({ on: ["pull_request"] });
    t.deepEqual(errors, [actionsutil.WorkflowErrors.MissingPushHook]);
});
ava_1.default("validateWorkflow() when on.push is valid", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: ["push", "pull_request"],
    });
    t.deepEqual(errors, []);
});
ava_1.default("validateWorkflow() when on.push is a valid superset", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: ["push", "pull_request", "schedule"],
    });
    t.deepEqual(errors, []);
});
ava_1.default("validateWorkflow() when on.push should not have a path", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: {
            push: { branches: ["main"], paths: ["test/*"] },
            pull_request: { branches: ["main"] },
        },
    });
    t.deepEqual(errors, [actionsutil.WorkflowErrors.PathsSpecified]);
});
ava_1.default("validateWorkflow() when on.push is a correct object", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: { push: { branches: ["main"] }, pull_request: { branches: ["main"] } },
    });
    t.deepEqual(errors, []);
});
ava_1.default("validateWorkflow() when on.pull_requests is a string", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: { push: { branches: ["main"] }, pull_request: { branches: "*" } },
    });
    t.deepEqual(errors, [actionsutil.WorkflowErrors.MismatchedBranches]);
});
ava_1.default("validateWorkflow() when on.pull_requests is a string and correct", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: { push: { branches: "*" }, pull_request: { branches: "*" } },
    });
    t.deepEqual(errors, []);
});
ava_1.default("validateWorkflow() when on.push is correct with empty objects", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: { push: undefined, pull_request: undefined },
    });
    t.deepEqual(errors, []);
});
ava_1.default("validateWorkflow() when on.push is mismatched", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: {
            push: { branches: ["main"] },
            pull_request: { branches: ["feature"] },
        },
    });
    t.deepEqual(errors, [actionsutil.WorkflowErrors.MismatchedBranches]);
});
ava_1.default("validateWorkflow() when on.push is not mismatched", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: {
            push: { branches: ["main", "feature"] },
            pull_request: { branches: ["main"] },
        },
    });
    t.deepEqual(errors, []);
});
ava_1.default("validateWorkflow() when on.push is mismatched for pull_request", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: {
            push: { branches: ["main"] },
            pull_request: { branches: ["main", "feature"] },
        },
    });
    t.deepEqual(errors, [actionsutil.WorkflowErrors.MismatchedBranches]);
});
ava_1.default("validateWorkflow() for a range of malformed workflows", (t) => {
    t.deepEqual(actionsutil.validateWorkflow({
        on: {
            push: 1,
            pull_request: 1,
        },
    }), []);
    t.deepEqual(actionsutil.validateWorkflow({
        on: 1,
    }), [actionsutil.WorkflowErrors.MissingHooks]);
    t.deepEqual(actionsutil.validateWorkflow({
        on: 1,
        jobs: 1,
    }), [actionsutil.WorkflowErrors.MissingHooks]);
    t.deepEqual(actionsutil.validateWorkflow({
        on: 1,
        jobs: [1],
    }), [actionsutil.WorkflowErrors.MissingHooks]);
    t.deepEqual(actionsutil.validateWorkflow({
        on: 1,
        jobs: { 1: 1 },
    }), [actionsutil.WorkflowErrors.MissingHooks]);
    t.deepEqual(actionsutil.validateWorkflow({
        on: 1,
        jobs: { test: 1 },
    }), [actionsutil.WorkflowErrors.MissingHooks]);
    t.deepEqual(actionsutil.validateWorkflow({
        on: 1,
        jobs: { test: [1] },
    }), [actionsutil.WorkflowErrors.MissingHooks]);
    t.deepEqual(actionsutil.validateWorkflow({
        on: 1,
        jobs: { test: { steps: 1 } },
    }), [actionsutil.WorkflowErrors.MissingHooks]);
    t.deepEqual(actionsutil.validateWorkflow({
        on: 1,
        jobs: { test: { steps: [{ notrun: "git checkout HEAD^2" }] } },
    }), [actionsutil.WorkflowErrors.MissingHooks]);
    t.deepEqual(actionsutil.validateWorkflow({
        on: 1,
        jobs: { test: [undefined] },
    }), [actionsutil.WorkflowErrors.MissingHooks]);
    t.deepEqual(actionsutil.validateWorkflow(1), [
        actionsutil.WorkflowErrors.MissingHooks,
    ]);
    t.deepEqual(actionsutil.validateWorkflow({
        on: {
            push: {
                branches: 1,
            },
            pull_request: {
                branches: 1,
            },
        },
    }), []);
});
ava_1.default("validateWorkflow() when on.pull_request for every branch but push specifies branches", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: {
            push: { branches: ["main"] },
            pull_request: null,
        },
    });
    t.deepEqual(errors, [actionsutil.WorkflowErrors.MismatchedBranches]);
});
ava_1.default("validateWorkflow() when on.pull_request for wildcard branches", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: {
            push: { branches: ["feature/*"] },
            pull_request: { branches: "feature/moose" },
        },
    });
    t.deepEqual(errors, []);
});
ava_1.default("validateWorkflow() when on.pull_request for mismatched wildcard branches", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: {
            push: { branches: ["feature/moose"] },
            pull_request: { branches: "feature/*" },
        },
    });
    t.deepEqual(errors, [actionsutil.WorkflowErrors.MismatchedBranches]);
});
ava_1.default("validateWorkflow() when HEAD^2 is checked out", (t) => {
    const errors = actionsutil.validateWorkflow({
        on: ["push", "pull_request"],
        jobs: { test: { steps: [{ run: "git checkout HEAD^2" }] } },
    });
    t.deepEqual(errors, [actionsutil.WorkflowErrors.CheckoutWrongHead]);
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
ava_1.default("validateWorkflow() when branches contain dots", (t) => {
    const errors = actionsutil.validateWorkflow(yaml.safeLoad(`
  on:
    push:
      branches: [4.1, master]
    pull_request:
      # The branches below must be a subset of the branches above
      branches: [4.1, master]
`));
    t.deepEqual(errors, []);
});
ava_1.default("validateWorkflow() when on.push has a trailing comma", (t) => {
    const errors = actionsutil.validateWorkflow(yaml.safeLoad(`
name: "CodeQL"
on:
  push:
    branches: [master, ]
  pull_request:
    # The branches below must be a subset of the branches above
    branches: [master]
`));
    t.deepEqual(errors, []);
});
ava_1.default("validateWorkflow() should only report the first CheckoutWrongHead", (t) => {
    const errors = actionsutil.validateWorkflow(yaml.safeLoad(`
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
      - run: "git checkout HEAD^2"
      - run: "git checkout HEAD^2"
      - run: "git checkout HEAD^2"
      - run: "git checkout HEAD^2"
`));
    t.deepEqual(errors, [actionsutil.WorkflowErrors.CheckoutWrongHead]);
});
//# sourceMappingURL=actions-util.test.js.map