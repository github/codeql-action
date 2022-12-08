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
const ava_1 = __importDefault(require("ava"));
const yaml = __importStar(require("js-yaml"));
const testing_utils_1 = require("./testing-utils");
const workflow_1 = require("./workflow");
function errorCodes(actual, expected) {
    return [actual.map(({ code }) => code), expected.map(({ code }) => code)];
}
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("getWorkflowErrors() when on is empty", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({ on: {} });
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is an array missing pull_request", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({ on: ["push"] });
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is an array missing push", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({ on: ["pull_request"] });
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.MissingPushHook]));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is valid", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: ["push", "pull_request"],
    });
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is a valid superset", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: ["push", "pull_request", "schedule"],
    });
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push should not have a path", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: {
            push: { branches: ["main"], paths: ["test/*"] },
            pull_request: { branches: ["main"] },
        },
    });
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.PathsSpecified]));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is a correct object", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: { push: { branches: ["main"] }, pull_request: { branches: ["main"] } },
    });
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.pull_requests is a string", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: { push: { branches: ["main"] }, pull_request: { branches: "*" } },
    });
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.MismatchedBranches]));
});
(0, ava_1.default)("getWorkflowErrors() when on.pull_requests is a string and correct", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: { push: { branches: "*" }, pull_request: { branches: "*" } },
    });
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is correct with empty objects", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)(yaml.load(`
  on:
    push:
    pull_request:
  `));
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is mismatched", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: {
            push: { branches: ["main"] },
            pull_request: { branches: ["feature"] },
        },
    });
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.MismatchedBranches]));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is not mismatched", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: {
            push: { branches: ["main", "feature"] },
            pull_request: { branches: ["main"] },
        },
    });
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is mismatched for pull_request", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: {
            push: { branches: ["main"] },
            pull_request: { branches: ["main", "feature"] },
        },
    });
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.MismatchedBranches]));
});
(0, ava_1.default)("getWorkflowErrors() for a range of malformed workflows", (t) => {
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)({
        on: {
            push: 1,
            pull_request: 1,
        },
    }), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)({
        on: 1,
    }), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: 1,
    }), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: [1],
    }), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { 1: 1 },
    }), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { test: 1 },
    }), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { test: [1] },
    }), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { test: { steps: 1 } },
    }), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { test: { steps: [{ notrun: "git checkout HEAD^2" }] } },
    }), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { test: [undefined] },
    }), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)(1), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)({
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
(0, ava_1.default)("getWorkflowErrors() when on.pull_request for every branch but push specifies branches", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on:
    push:
      branches: ["main"]
    pull_request:
  `));
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.MismatchedBranches]));
});
(0, ava_1.default)("getWorkflowErrors() when on.pull_request for wildcard branches", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: {
            push: { branches: ["feature/*"] },
            pull_request: { branches: "feature/moose" },
        },
    });
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.pull_request for mismatched wildcard branches", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: {
            push: { branches: ["feature/moose"] },
            pull_request: { branches: "feature/*" },
        },
    });
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.MismatchedBranches]));
});
(0, ava_1.default)("getWorkflowErrors() when HEAD^2 is checked out", (t) => {
    process.env.GITHUB_JOB = "test";
    const errors = (0, workflow_1.getWorkflowErrors)({
        on: ["push", "pull_request"],
        jobs: { test: { steps: [{ run: "git checkout HEAD^2" }] } },
    });
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.CheckoutWrongHead]));
});
(0, ava_1.default)("formatWorkflowErrors() when there is one error", (t) => {
    const message = (0, workflow_1.formatWorkflowErrors)([workflow_1.WorkflowErrors.CheckoutWrongHead]);
    t.true(message.startsWith("1 issue was detected with this workflow:"));
});
(0, ava_1.default)("formatWorkflowErrors() when there are multiple errors", (t) => {
    const message = (0, workflow_1.formatWorkflowErrors)([
        workflow_1.WorkflowErrors.CheckoutWrongHead,
        workflow_1.WorkflowErrors.PathsSpecified,
    ]);
    t.true(message.startsWith("2 issues were detected with this workflow:"));
});
(0, ava_1.default)("formatWorkflowCause() with no errors", (t) => {
    const message = (0, workflow_1.formatWorkflowCause)([]);
    t.deepEqual(message, undefined);
});
(0, ava_1.default)("formatWorkflowCause()", (t) => {
    const message = (0, workflow_1.formatWorkflowCause)([
        workflow_1.WorkflowErrors.CheckoutWrongHead,
        workflow_1.WorkflowErrors.PathsSpecified,
    ]);
    t.deepEqual(message, "CheckoutWrongHead,PathsSpecified");
    t.deepEqual((0, workflow_1.formatWorkflowCause)([]), undefined);
});
(0, ava_1.default)("patternIsSuperset()", (t) => {
    t.false((0, workflow_1.patternIsSuperset)("main-*", "main"));
    t.true((0, workflow_1.patternIsSuperset)("*", "*"));
    t.true((0, workflow_1.patternIsSuperset)("*", "main-*"));
    t.false((0, workflow_1.patternIsSuperset)("main-*", "*"));
    t.false((0, workflow_1.patternIsSuperset)("main-*", "main"));
    t.true((0, workflow_1.patternIsSuperset)("main", "main"));
    t.false((0, workflow_1.patternIsSuperset)("*", "feature/*"));
    t.true((0, workflow_1.patternIsSuperset)("**", "feature/*"));
    t.false((0, workflow_1.patternIsSuperset)("feature-*", "**"));
    t.false((0, workflow_1.patternIsSuperset)("a/**/c", "a/**/d"));
    t.false((0, workflow_1.patternIsSuperset)("a/**/c", "a/**"));
    t.true((0, workflow_1.patternIsSuperset)("a/**", "a/**/c"));
    t.true((0, workflow_1.patternIsSuperset)("a/**/c", "a/main-**/c"));
    t.false((0, workflow_1.patternIsSuperset)("a/**/b/**/c", "a/**/d/**/c"));
    t.true((0, workflow_1.patternIsSuperset)("a/**/b/**/c", "a/**/b/c/**/c"));
    t.true((0, workflow_1.patternIsSuperset)("a/**/b/**/c", "a/**/b/d/**/c"));
    t.false((0, workflow_1.patternIsSuperset)("a/**/c/d/**/c", "a/**/b/**/c"));
    t.false((0, workflow_1.patternIsSuperset)("a/main-**/c", "a/**/c"));
    t.true((0, workflow_1.patternIsSuperset)("/robin/*/release/*", "/robin/moose/release/goose"));
    t.false((0, workflow_1.patternIsSuperset)("/robin/moose/release/goose", "/robin/*/release/*"));
});
(0, ava_1.default)("getWorkflowErrors() when branches contain dots", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)(yaml.load(`
    on:
      push:
        branches: [4.1, master]
      pull_request:
        # The branches below must be a subset of the branches above
        branches: [4.1, master]
  `));
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push has a trailing comma", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)(yaml.load(`
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
(0, ava_1.default)("getWorkflowErrors() should only report the current job's CheckoutWrongHead", (t) => {
    process.env.GITHUB_JOB = "test";
    const errors = (0, workflow_1.getWorkflowErrors)(yaml.load(`
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
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.CheckoutWrongHead]));
});
(0, ava_1.default)("getWorkflowErrors() should not report a different job's CheckoutWrongHead", (t) => {
    process.env.GITHUB_JOB = "test3";
    const errors = (0, workflow_1.getWorkflowErrors)(yaml.load(`
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
(0, ava_1.default)("getWorkflowErrors() when on is missing", (t) => {
    const errors = (0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  `));
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() with a different on setup", (t) => {
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on: "workflow_dispatch"
  `)), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on: [workflow_dispatch]
  `)), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on:
    workflow_dispatch: {}
  `)), []));
});
(0, ava_1.default)("getWorkflowErrors() should not report an error if PRs are totally unconfigured", (t) => {
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on:
    push:
      branches: [master]
  `)), []));
    t.deepEqual(...errorCodes((0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on: ["push"]
  `)), []));
});
(0, ava_1.default)("getCategoryInputOrThrow returns category for simple workflow with category", (t) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    t.is((0, workflow_1.getCategoryInputOrThrow)(yaml.load(`
        jobs:
          analysis:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v2
              - uses: github/codeql-action/init@v2
              - uses: github/codeql-action/analyze@v2
                with:
                  category: some-category
      `), "analysis", {}), "some-category");
});
(0, ava_1.default)("getCategoryInputOrThrow returns undefined for simple workflow without category", (t) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    t.is((0, workflow_1.getCategoryInputOrThrow)(yaml.load(`
        jobs:
          analysis:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v2
              - uses: github/codeql-action/init@v2
              - uses: github/codeql-action/analyze@v2
      `), "analysis", {}), undefined);
});
(0, ava_1.default)("getCategoryInputOrThrow returns category for workflow with multiple jobs", (t) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    t.is((0, workflow_1.getCategoryInputOrThrow)(yaml.load(`
        jobs:
          foo:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v2
              - uses: github/codeql-action/init@v2
              - runs: ./build foo
              - uses: github/codeql-action/analyze@v2
                with:
                  category: foo-category
          bar:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v2
              - uses: github/codeql-action/init@v2
              - runs: ./build bar
              - uses: github/codeql-action/analyze@v2
                with:
                  category: bar-category
      `), "bar", {}), "bar-category");
});
(0, ava_1.default)("getCategoryInputOrThrow finds category for workflow with language matrix", (t) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    t.is((0, workflow_1.getCategoryInputOrThrow)(yaml.load(`
        jobs:
          analysis:
            runs-on: ubuntu-latest
            strategy:
              matrix:
                language: [javascript, python]
            steps:
              - uses: actions/checkout@v2
              - uses: github/codeql-action/init@v2
                with:
                  language: \${{ matrix.language }}
              - uses: github/codeql-action/analyze@v2
                with:
                  category: "/language:\${{ matrix.language }}"
      `), "analysis", { language: "javascript" }), "/language:javascript");
});
(0, ava_1.default)("getCategoryInputOrThrow throws error for workflow with dynamic category", (t) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    t.throws(() => (0, workflow_1.getCategoryInputOrThrow)(yaml.load(`
          jobs:
            analysis:
              steps:
                - uses: actions/checkout@v2
                - uses: github/codeql-action/init@v2
                - uses: github/codeql-action/analyze@v2
                  with:
                    category: "\${{ github.workflow }}"
        `), "analysis", {}), {
        message: "Could not get category input to github/codeql-action/analyze since it contained " +
            "an unrecognized dynamic value.",
    });
});
(0, ava_1.default)("getCategoryInputOrThrow throws error for workflow with multiple calls to analyze", (t) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    t.throws(() => (0, workflow_1.getCategoryInputOrThrow)(yaml.load(`
          jobs:
            analysis:
              runs-on: ubuntu-latest
              steps:
                - uses: actions/checkout@v2
                - uses: github/codeql-action/init@v2
                - uses: github/codeql-action/analyze@v2
                  with:
                    category: some-category
                - uses: github/codeql-action/analyze@v2
                  with:
                    category: another-category
        `), "analysis", {}), {
        message: "Could not get category input to github/codeql-action/analyze since the analysis job " +
            "calls github/codeql-action/analyze multiple times.",
    });
});
//# sourceMappingURL=workflow.test.js.map