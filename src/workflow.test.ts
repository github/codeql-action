import test, { ExecutionContext } from "ava";
import * as yaml from "js-yaml";
import * as sinon from "sinon";

import { getCodeQLForTesting } from "./codeql";
import { setupTests } from "./testing-utils";
import {
  CodedError,
  formatWorkflowCause,
  formatWorkflowErrors,
  getCategoryInputOrThrow,
  getWorkflowErrors,
  Workflow,
  WorkflowErrors,
} from "./workflow";

function errorCodes(
  actual: CodedError[],
  expected: CodedError[],
): [string[], string[]] {
  return [actual.map(({ code }) => code), expected.map(({ code }) => code)];
}

setupTests(test);

test("getWorkflowErrors() when on is empty", async (t) => {
  const errors = await getWorkflowErrors(
    { on: {} },
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is an array missing pull_request", async (t) => {
  const errors = await getWorkflowErrors(
    { on: ["push"] },
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is an array missing push", async (t) => {
  const errors = await getWorkflowErrors(
    { on: ["pull_request"] },
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.MissingPushHook]));
});

test("getWorkflowErrors() when on.push is valid", async (t) => {
  const errors = await getWorkflowErrors(
    {
      on: ["push", "pull_request"],
    },
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is a valid superset", async (t) => {
  const errors = await getWorkflowErrors(
    {
      on: ["push", "pull_request", "schedule"],
    },
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is a correct object", async (t) => {
  const errors = await getWorkflowErrors(
    {
      on: {
        push: { branches: ["main"] },
        pull_request: { branches: ["main"] },
      },
    },
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.pull_requests is a string and correct", async (t) => {
  const errors = await getWorkflowErrors(
    {
      on: { push: { branches: "*" }, pull_request: { branches: "*" } },
    },
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is correct with empty objects", async (t) => {
  const errors = await getWorkflowErrors(
    yaml.load(`
  on:
    push:
    pull_request:
  `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is not mismatched", async (t) => {
  const errors = await getWorkflowErrors(
    {
      on: {
        push: { branches: ["main", "feature"] },
        pull_request: { branches: ["main"] },
      },
    },
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() for a range of malformed workflows", async (t) => {
  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        {
          on: {
            push: 1,
            pull_request: 1,
          },
        } as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        {
          on: 1,
        } as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        {
          on: 1,
          jobs: 1,
        } as unknown as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        {
          on: 1,
          jobs: [1],
        } as unknown as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        {
          on: 1,
          jobs: { 1: 1 },
        } as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        {
          on: 1,
          jobs: { test: 1 },
        } as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        {
          on: 1,
          jobs: { test: [1] },
        } as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        {
          on: 1,
          jobs: { test: { steps: 1 } },
        } as unknown as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        {
          on: 1,
          jobs: { test: { steps: [{ notrun: "git checkout HEAD^2" }] } },
        } as unknown as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        {
          on: 1,
          jobs: { test: [undefined] },
        } as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(1 as Workflow, await getCodeQLForTesting()),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        {
          on: {
            push: {
              branches: 1,
            },
            pull_request: {
              branches: 1,
            },
          },
        } as unknown as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );
});

test("getWorkflowErrors() when on.pull_request for wildcard branches", async (t) => {
  const errors = await getWorkflowErrors(
    {
      on: {
        push: { branches: ["feature/*"] },
        pull_request: { branches: "feature/moose" },
      },
    },
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when HEAD^2 is checked out", async (t) => {
  process.env.GITHUB_JOB = "test";

  const errors = await getWorkflowErrors(
    {
      on: ["push", "pull_request"],
      jobs: { test: { steps: [{ run: "git checkout HEAD^2" }] } },
    },
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.CheckoutWrongHead]));
});

test("getWorkflowErrors() produces an error for workflow with language name and its alias", async (t) => {
  await testLanguageAliases(
    t,
    ["java", "kotlin"],
    { java: ["java-kotlin", "kotlin"] },
    [
      "CodeQL language 'java' is referenced by more than one entry in the 'language' matrix " +
        "parameter for job 'test'. This may result in duplicate alerts. Please edit the 'language' " +
        "matrix parameter to keep only one of the following: 'java', 'kotlin'.",
    ],
  );
});

test("getWorkflowErrors() produces an error for workflow with two aliases same language", async (t) => {
  await testLanguageAliases(
    t,
    ["java-kotlin", "kotlin"],
    { java: ["java-kotlin", "kotlin"] },
    [
      "CodeQL language 'java' is referenced by more than one entry in the 'language' matrix " +
        "parameter for job 'test'. This may result in duplicate alerts. Please edit the 'language' " +
        "matrix parameter to keep only one of the following: 'java-kotlin', 'kotlin'.",
    ],
  );
});

test("getWorkflowErrors() does not produce an error for workflow with two distinct languages", async (t) => {
  await testLanguageAliases(
    t,
    ["java", "typescript"],
    {
      java: ["java-kotlin", "kotlin"],
      javascript: ["javascript-typescript", "typescript"],
    },
    [],
  );
});

test("getWorkflowErrors() does not produce an error if codeql doesn't support language aliases", async (t) => {
  await testLanguageAliases(t, ["java-kotlin", "kotlin"], undefined, []);
});

async function testLanguageAliases(
  t: ExecutionContext<unknown>,
  matrixLanguages: string[],
  aliases: { [languageName: string]: string[] } | undefined,
  expectedErrorMessages: string[],
) {
  process.env.GITHUB_JOB = "test";

  const codeql = await getCodeQLForTesting();
  sinon.stub(codeql, "betterResolveLanguages").resolves({
    aliases:
      aliases !== undefined
        ? // Remap from languageName -> aliases to alias -> languageName
          Object.assign(
            {},
            ...Object.entries(aliases).flatMap(([language, languageAliases]) =>
              languageAliases.map((alias) => ({
                [alias]: language,
              })),
            ),
          )
        : undefined,
    extractors: {
      java: [
        {
          extractor_root: "",
        },
      ],
    },
  });

  const errors = await getWorkflowErrors(
    {
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
    } as Workflow,
    codeql,
  );

  t.is(errors.length, expectedErrorMessages.length);
  t.deepEqual(
    errors.map((e) => e.message),
    expectedErrorMessages,
  );
}

test("formatWorkflowErrors() when there is one error", (t) => {
  const message = formatWorkflowErrors([WorkflowErrors.CheckoutWrongHead]);
  t.true(message.startsWith("1 issue was detected with this workflow:"));
});

test("formatWorkflowErrors() when there are multiple errors", (t) => {
  const message = formatWorkflowErrors([
    WorkflowErrors.CheckoutWrongHead,
    WorkflowErrors.MissingPushHook,
  ]);
  t.true(message.startsWith("2 issues were detected with this workflow:"));
});

test("formatWorkflowCause() with no errors", (t) => {
  const message = formatWorkflowCause([]);

  t.deepEqual(message, undefined);
});

test("formatWorkflowCause()", (t) => {
  const message = formatWorkflowCause([
    WorkflowErrors.CheckoutWrongHead,
    WorkflowErrors.MissingPushHook,
  ]);

  t.deepEqual(message, "CheckoutWrongHead,MissingPushHook");
  t.deepEqual(formatWorkflowCause([]), undefined);
});

test("getWorkflowErrors() when branches contain dots", async (t) => {
  const errors = await getWorkflowErrors(
    yaml.load(`
    on:
      push:
        branches: [4.1, master]
      pull_request:
        # The branches below must be a subset of the branches above
        branches: [4.1, master]
  `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push has a trailing comma", async (t) => {
  const errors = await getWorkflowErrors(
    yaml.load(`
  name: "CodeQL"
  on:
    push:
      branches: [master, ]
    pull_request:
      # The branches below must be a subset of the branches above
      branches: [master]
  `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() should only report the current job's CheckoutWrongHead", async (t) => {
  process.env.GITHUB_JOB = "test";

  const errors = await getWorkflowErrors(
    yaml.load(`
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
  `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.CheckoutWrongHead]));
});

test("getWorkflowErrors() should not report a different job's CheckoutWrongHead", async (t) => {
  process.env.GITHUB_JOB = "test3";

  const errors = await getWorkflowErrors(
    yaml.load(`
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
  `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on is missing", async (t) => {
  const errors = await getWorkflowErrors(
    yaml.load(`
  name: "CodeQL"
  `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() with a different on setup", async (t) => {
  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        yaml.load(`
  name: "CodeQL"
  on: "workflow_dispatch"
  `) as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        yaml.load(`
  name: "CodeQL"
  on: [workflow_dispatch]
  `) as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        yaml.load(`
  name: "CodeQL"
  on:
    workflow_dispatch: {}
  `) as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );
});

test("getWorkflowErrors() should not report an error if PRs are totally unconfigured", async (t) => {
  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        yaml.load(`
  name: "CodeQL"
  on:
    push:
      branches: [master]
  `) as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );

  t.deepEqual(
    ...errorCodes(
      await getWorkflowErrors(
        yaml.load(`
  name: "CodeQL"
  on: ["push"]
  `) as Workflow,
        await getCodeQLForTesting(),
      ),
      [],
    ),
  );
});

test("getWorkflowErrors() should not report a warning if there is a workflow_call trigger", async (t) => {
  const errors = await getWorkflowErrors(
    yaml.load(`
    name: "CodeQL"
    on:
      workflow_call:
    `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() should not report a warning if there is a workflow_call trigger as a string", async (t) => {
  const errors = await getWorkflowErrors(
    yaml.load(`
    name: "CodeQL"
    on: workflow_call
    `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() should not report a warning if there is a workflow_call trigger as an array", async (t) => {
  const errors = await getWorkflowErrors(
    yaml.load(`
    name: "CodeQL"
    on:
      - workflow_call
    `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() should report a warning if different versions of the CodeQL Action are used", async (t) => {
  const errors = await getWorkflowErrors(
    yaml.load(`
      name: "CodeQL"
      on:
        push:
          branches: [main]
      jobs:
        analyze:
          steps:
            - uses: github/codeql-action/init@v2
            - uses: github/codeql-action/analyze@v3
    `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(
    ...errorCodes(errors, [WorkflowErrors.InconsistentActionVersion]),
  );
});

test("getWorkflowErrors() should not report a warning if the same versions of the CodeQL Action are used", async (t) => {
  const errors = await getWorkflowErrors(
    yaml.load(`
      name: "CodeQL"
      on:
        push:
          branches: [main]
      jobs:
        analyze:
          steps:
            - uses: github/codeql-action/init@v3
            - uses: github/codeql-action/analyze@v3
    `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() should not report a warning involving versions of other actions", async (t) => {
  const errors = await getWorkflowErrors(
    yaml.load(`
      name: "CodeQL"
      on:
        push:
          branches: [main]
      jobs:
        analyze:
          steps:
            - uses: actions/checkout@v5
            - uses: github/codeql-action/init@v3
    `) as Workflow,
    await getCodeQLForTesting(),
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getCategoryInputOrThrow returns category for simple workflow with category", (t) => {
  process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
  t.is(
    getCategoryInputOrThrow(
      yaml.load(`
        jobs:
          analysis:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v3
              - uses: github/codeql-action/init@v3
              - uses: github/codeql-action/analyze@v3
                with:
                  category: some-category
      `) as Workflow,
      "analysis",
      {},
    ),
    "some-category",
  );
});

test("getCategoryInputOrThrow returns undefined for simple workflow without category", (t) => {
  process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
  t.is(
    getCategoryInputOrThrow(
      yaml.load(`
        jobs:
          analysis:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v3
              - uses: github/codeql-action/init@v3
              - uses: github/codeql-action/analyze@v3
      `) as Workflow,
      "analysis",
      {},
    ),
    undefined,
  );
});

test("getCategoryInputOrThrow returns category for workflow with multiple jobs", (t) => {
  process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
  t.is(
    getCategoryInputOrThrow(
      yaml.load(`
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
      `) as Workflow,
      "bar",
      {},
    ),
    "bar-category",
  );
});

test("getCategoryInputOrThrow finds category for workflow with language matrix", (t) => {
  process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
  t.is(
    getCategoryInputOrThrow(
      yaml.load(`
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
      `) as Workflow,
      "analysis",
      { language: "javascript" },
    ),
    "/language:javascript",
  );
});

test("getCategoryInputOrThrow throws error for workflow with dynamic category", (t) => {
  process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
  t.throws(
    () =>
      getCategoryInputOrThrow(
        yaml.load(`
          jobs:
            analysis:
              steps:
                - uses: actions/checkout@v3
                - uses: github/codeql-action/init@v3
                - uses: github/codeql-action/analyze@v3
                  with:
                    category: "\${{ github.workflow }}"
        `) as Workflow,
        "analysis",
        {},
      ),
    {
      message:
        "Could not get category input to github/codeql-action/analyze since it contained " +
        "an unrecognized dynamic value.",
    },
  );
});

test("getCategoryInputOrThrow throws error for workflow with multiple calls to analyze", (t) => {
  process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
  t.throws(
    () =>
      getCategoryInputOrThrow(
        yaml.load(`
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
        `) as Workflow,
        "analysis",
        {},
      ),
    {
      message:
        "Could not get category input to github/codeql-action/analyze since the analysis job " +
        "calls github/codeql-action/analyze multiple times.",
    },
  );
});
