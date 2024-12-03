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
const yaml = __importStar(require("js-yaml"));
const sinon = __importStar(require("sinon"));
const codeql_1 = require("./codeql");
const testing_utils_1 = require("./testing-utils");
const workflow_1 = require("./workflow");
function errorCodes(actual, expected) {
    return [actual.map(({ code }) => code), expected.map(({ code }) => code)];
}
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("getWorkflowErrors() when on is empty", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)({ on: {} }, await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is an array missing pull_request", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)({ on: ["push"] }, await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is an array missing push", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)({ on: ["pull_request"] }, await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.MissingPushHook]));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is valid", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)({
        on: ["push", "pull_request"],
    }, await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is a valid superset", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)({
        on: ["push", "pull_request", "schedule"],
    }, await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is a correct object", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)({
        on: {
            push: { branches: ["main"] },
            pull_request: { branches: ["main"] },
        },
    }, await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.pull_requests is a string and correct", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)({
        on: { push: { branches: "*" }, pull_request: { branches: "*" } },
    }, await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is correct with empty objects", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)(yaml.load(`
  on:
    push:
    pull_request:
  `), await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push is not mismatched", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)({
        on: {
            push: { branches: ["main", "feature"] },
            pull_request: { branches: ["main"] },
        },
    }, await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() for a range of malformed workflows", async (t) => {
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)({
        on: {
            push: 1,
            pull_request: 1,
        },
    }, await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)({
        on: 1,
    }, await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: 1,
    }, await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: [1],
    }, await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { 1: 1 },
    }, await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { test: 1 },
    }, await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { test: [1] },
    }, await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { test: { steps: 1 } },
    }, await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { test: { steps: [{ notrun: "git checkout HEAD^2" }] } },
    }, await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)({
        on: 1,
        jobs: { test: [undefined] },
    }, await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)(1, await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)({
        on: {
            push: {
                branches: 1,
            },
            pull_request: {
                branches: 1,
            },
        },
    }, await (0, codeql_1.getCodeQLForTesting)()), []));
});
(0, ava_1.default)("getWorkflowErrors() when on.pull_request for wildcard branches", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)({
        on: {
            push: { branches: ["feature/*"] },
            pull_request: { branches: "feature/moose" },
        },
    }, await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when HEAD^2 is checked out", async (t) => {
    process.env.GITHUB_JOB = "test";
    const errors = await (0, workflow_1.getWorkflowErrors)({
        on: ["push", "pull_request"],
        jobs: { test: { steps: [{ run: "git checkout HEAD^2" }] } },
    }, await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.CheckoutWrongHead]));
});
(0, ava_1.default)("getWorkflowErrors() produces an error for workflow with language name and its alias", async (t) => {
    await testLanguageAliases(t, ["java", "kotlin"], { java: ["java-kotlin", "kotlin"] }, [
        "CodeQL language 'java' is referenced by more than one entry in the 'language' matrix " +
            "parameter for job 'test'. This may result in duplicate alerts. Please edit the 'language' " +
            "matrix parameter to keep only one of the following: 'java', 'kotlin'.",
    ]);
});
(0, ava_1.default)("getWorkflowErrors() produces an error for workflow with two aliases same language", async (t) => {
    await testLanguageAliases(t, ["java-kotlin", "kotlin"], { java: ["java-kotlin", "kotlin"] }, [
        "CodeQL language 'java' is referenced by more than one entry in the 'language' matrix " +
            "parameter for job 'test'. This may result in duplicate alerts. Please edit the 'language' " +
            "matrix parameter to keep only one of the following: 'java-kotlin', 'kotlin'.",
    ]);
});
(0, ava_1.default)("getWorkflowErrors() does not produce an error for workflow with two distinct languages", async (t) => {
    await testLanguageAliases(t, ["java", "typescript"], {
        java: ["java-kotlin", "kotlin"],
        javascript: ["javascript-typescript", "typescript"],
    }, []);
});
(0, ava_1.default)("getWorkflowErrors() does not produce an error if codeql doesn't support language aliases", async (t) => {
    await testLanguageAliases(t, ["java-kotlin", "kotlin"], undefined, []);
});
async function testLanguageAliases(t, matrixLanguages, aliases, expectedErrorMessages) {
    process.env.GITHUB_JOB = "test";
    const codeql = await (0, codeql_1.getCodeQLForTesting)();
    sinon.stub(codeql, "betterResolveLanguages").resolves({
        aliases: aliases !== undefined
            ? // Remap from languageName -> aliases to alias -> languageName
                Object.assign({}, ...Object.entries(aliases).flatMap(([language, languageAliases]) => languageAliases.map((alias) => ({
                    [alias]: language,
                }))))
            : undefined,
        extractors: {
            java: [
                {
                    extractor_root: "",
                },
            ],
        },
    });
    const errors = await (0, workflow_1.getWorkflowErrors)({
        on: ["push", "pull_request"],
        jobs: {
            test: {
                strategy: {
                    matrix: {
                        language: matrixLanguages,
                    },
                },
                steps: [
                    { uses: "actions/checkout@v3" },
                    { uses: "github/codeql-action/init@v3" },
                    { uses: "github/codeql-action/analyze@v3" },
                ],
            },
        },
    }, codeql);
    t.is(errors.length, expectedErrorMessages.length);
    t.deepEqual(errors.map((e) => e.message), expectedErrorMessages);
}
(0, ava_1.default)("formatWorkflowErrors() when there is one error", (t) => {
    const message = (0, workflow_1.formatWorkflowErrors)([workflow_1.WorkflowErrors.CheckoutWrongHead]);
    t.true(message.startsWith("1 issue was detected with this workflow:"));
});
(0, ava_1.default)("formatWorkflowErrors() when there are multiple errors", (t) => {
    const message = (0, workflow_1.formatWorkflowErrors)([
        workflow_1.WorkflowErrors.CheckoutWrongHead,
        workflow_1.WorkflowErrors.MissingPushHook,
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
        workflow_1.WorkflowErrors.MissingPushHook,
    ]);
    t.deepEqual(message, "CheckoutWrongHead,MissingPushHook");
    t.deepEqual((0, workflow_1.formatWorkflowCause)([]), undefined);
});
(0, ava_1.default)("getWorkflowErrors() when branches contain dots", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)(yaml.load(`
    on:
      push:
        branches: [4.1, master]
      pull_request:
        # The branches below must be a subset of the branches above
        branches: [4.1, master]
  `), await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on.push has a trailing comma", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on:
    push:
      branches: [master, ]
    pull_request:
      # The branches below must be a subset of the branches above
      branches: [master]
  `), await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() should only report the current job's CheckoutWrongHead", async (t) => {
    process.env.GITHUB_JOB = "test";
    const errors = await (0, workflow_1.getWorkflowErrors)(yaml.load(`
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
  `), await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, [workflow_1.WorkflowErrors.CheckoutWrongHead]));
});
(0, ava_1.default)("getWorkflowErrors() should not report a different job's CheckoutWrongHead", async (t) => {
    process.env.GITHUB_JOB = "test3";
    const errors = await (0, workflow_1.getWorkflowErrors)(yaml.load(`
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
  `), await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() when on is missing", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  `), await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() with a different on setup", async (t) => {
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on: "workflow_dispatch"
  `), await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on: [workflow_dispatch]
  `), await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on:
    workflow_dispatch: {}
  `), await (0, codeql_1.getCodeQLForTesting)()), []));
});
(0, ava_1.default)("getWorkflowErrors() should not report an error if PRs are totally unconfigured", async (t) => {
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on:
    push:
      branches: [master]
  `), await (0, codeql_1.getCodeQLForTesting)()), []));
    t.deepEqual(...errorCodes(await (0, workflow_1.getWorkflowErrors)(yaml.load(`
  name: "CodeQL"
  on: ["push"]
  `), await (0, codeql_1.getCodeQLForTesting)()), []));
});
(0, ava_1.default)("getWorkflowErrors() should not report a warning if there is a workflow_call trigger", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)(yaml.load(`
    name: "CodeQL"
    on:
      workflow_call:
    `), await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() should not report a warning if there is a workflow_call trigger as a string", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)(yaml.load(`
    name: "CodeQL"
    on: workflow_call
    `), await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getWorkflowErrors() should not report a warning if there is a workflow_call trigger as an array", async (t) => {
    const errors = await (0, workflow_1.getWorkflowErrors)(yaml.load(`
    name: "CodeQL"
    on:
      - workflow_call
    `), await (0, codeql_1.getCodeQLForTesting)());
    t.deepEqual(...errorCodes(errors, []));
});
(0, ava_1.default)("getCategoryInputOrThrow returns category for simple workflow with category", (t) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    t.is((0, workflow_1.getCategoryInputOrThrow)(yaml.load(`
        jobs:
          analysis:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v3
              - uses: github/codeql-action/init@v3
              - uses: github/codeql-action/analyze@v3
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
              - uses: actions/checkout@v3
              - uses: github/codeql-action/init@v3
              - uses: github/codeql-action/analyze@v3
      `), "analysis", {}), undefined);
});
(0, ava_1.default)("getCategoryInputOrThrow returns category for workflow with multiple jobs", (t) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    t.is((0, workflow_1.getCategoryInputOrThrow)(yaml.load(`
        jobs:
          foo:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v3
              - uses: github/codeql-action/init@v3
              - runs: ./build foo
              - uses: github/codeql-action/analyze@v3
                with:
                  category: foo-category
          bar:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v3
              - uses: github/codeql-action/init@v3
              - runs: ./build bar
              - uses: github/codeql-action/analyze@v3
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
              - uses: actions/checkout@v3
              - uses: github/codeql-action/init@v3
                with:
                  language: \${{ matrix.language }}
              - uses: github/codeql-action/analyze@v3
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
                - uses: actions/checkout@v3
                - uses: github/codeql-action/init@v3
                - uses: github/codeql-action/analyze@v3
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
                - uses: actions/checkout@v3
                - uses: github/codeql-action/init@v3
                - uses: github/codeql-action/analyze@v3
                  with:
                    category: some-category
                - uses: github/codeql-action/analyze@v3
                  with:
                    category: another-category
        `), "analysis", {}), {
        message: "Could not get category input to github/codeql-action/analyze since the analysis job " +
            "calls github/codeql-action/analyze multiple times.",
    });
});
//# sourceMappingURL=workflow.test.js.map