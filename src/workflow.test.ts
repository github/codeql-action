import test from "ava";
import * as yaml from "js-yaml";

import { setupTests } from "./testing-utils";
import {
  CodedError,
  formatWorkflowCause,
  formatWorkflowErrors,
  getCategoryInputOrThrow,
  getWorkflowErrors,
  patternIsSuperset,
  Workflow,
  WorkflowErrors,
} from "./workflow";

function errorCodes(
  actual: CodedError[],
  expected: CodedError[]
): [string[], string[]] {
  return [actual.map(({ code }) => code), expected.map(({ code }) => code)];
}

setupTests(test);

test("getWorkflowErrors() when on is empty", (t) => {
  const errors = getWorkflowErrors({ on: {} });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is an array missing pull_request", (t) => {
  const errors = getWorkflowErrors({ on: ["push"] });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is an array missing push", (t) => {
  const errors = getWorkflowErrors({ on: ["pull_request"] });

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.MissingPushHook]));
});

test("getWorkflowErrors() when on.push is valid", (t) => {
  const errors = getWorkflowErrors({
    on: ["push", "pull_request"],
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is a valid superset", (t) => {
  const errors = getWorkflowErrors({
    on: ["push", "pull_request", "schedule"],
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push should not have a path", (t) => {
  const errors = getWorkflowErrors({
    on: {
      push: { branches: ["main"], paths: ["test/*"] },
      pull_request: { branches: ["main"] },
    },
  });

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.PathsSpecified]));
});

test("getWorkflowErrors() when on.push is a correct object", (t) => {
  const errors = getWorkflowErrors({
    on: { push: { branches: ["main"] }, pull_request: { branches: ["main"] } },
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.pull_requests is a string", (t) => {
  const errors = getWorkflowErrors({
    on: { push: { branches: ["main"] }, pull_request: { branches: "*" } },
  });

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.MismatchedBranches]));
});

test("getWorkflowErrors() when on.pull_requests is a string and correct", (t) => {
  const errors = getWorkflowErrors({
    on: { push: { branches: "*" }, pull_request: { branches: "*" } },
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is correct with empty objects", (t) => {
  const errors = getWorkflowErrors(
    yaml.load(`
  on:
    push:
    pull_request:
  `) as Workflow
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is mismatched", (t) => {
  const errors = getWorkflowErrors({
    on: {
      push: { branches: ["main"] },
      pull_request: { branches: ["feature"] },
    },
  });

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.MismatchedBranches]));
});

test("getWorkflowErrors() when on.push is not mismatched", (t) => {
  const errors = getWorkflowErrors({
    on: {
      push: { branches: ["main", "feature"] },
      pull_request: { branches: ["main"] },
    },
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is mismatched for pull_request", (t) => {
  const errors = getWorkflowErrors({
    on: {
      push: { branches: ["main"] },
      pull_request: { branches: ["main", "feature"] },
    },
  });

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.MismatchedBranches]));
});

test("getWorkflowErrors() for a range of malformed workflows", (t) => {
  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors({
        on: {
          push: 1,
          pull_request: 1,
        },
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors({
        on: 1,
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors({
        on: 1,
        jobs: 1,
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors({
        on: 1,
        jobs: [1],
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors({
        on: 1,
        jobs: { 1: 1 },
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors({
        on: 1,
        jobs: { test: 1 },
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors({
        on: 1,
        jobs: { test: [1] },
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors({
        on: 1,
        jobs: { test: { steps: 1 } },
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors({
        on: 1,
        jobs: { test: { steps: [{ notrun: "git checkout HEAD^2" }] } },
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors({
        on: 1,
        jobs: { test: [undefined] },
      } as any),
      []
    )
  );

  t.deepEqual(...errorCodes(getWorkflowErrors(1 as any), []));

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors({
        on: {
          push: {
            branches: 1,
          },
          pull_request: {
            branches: 1,
          },
        },
      } as any),
      []
    )
  );
});

test("getWorkflowErrors() when on.pull_request for every branch but push specifies branches", (t) => {
  const errors = getWorkflowErrors(
    yaml.load(`
  name: "CodeQL"
  on:
    push:
      branches: ["main"]
    pull_request:
  `) as Workflow
  );

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.MismatchedBranches]));
});

test("getWorkflowErrors() when on.pull_request for wildcard branches", (t) => {
  const errors = getWorkflowErrors({
    on: {
      push: { branches: ["feature/*"] },
      pull_request: { branches: "feature/moose" },
    },
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.pull_request for mismatched wildcard branches", (t) => {
  const errors = getWorkflowErrors({
    on: {
      push: { branches: ["feature/moose"] },
      pull_request: { branches: "feature/*" },
    },
  });

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.MismatchedBranches]));
});

test("getWorkflowErrors() when HEAD^2 is checked out", (t) => {
  process.env.GITHUB_JOB = "test";

  const errors = getWorkflowErrors({
    on: ["push", "pull_request"],
    jobs: { test: { steps: [{ run: "git checkout HEAD^2" }] } },
  });

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.CheckoutWrongHead]));
});

test("formatWorkflowErrors() when there is one error", (t) => {
  const message = formatWorkflowErrors([WorkflowErrors.CheckoutWrongHead]);
  t.true(message.startsWith("1 issue was detected with this workflow:"));
});

test("formatWorkflowErrors() when there are multiple errors", (t) => {
  const message = formatWorkflowErrors([
    WorkflowErrors.CheckoutWrongHead,
    WorkflowErrors.PathsSpecified,
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
    WorkflowErrors.PathsSpecified,
  ]);

  t.deepEqual(message, "CheckoutWrongHead,PathsSpecified");
  t.deepEqual(formatWorkflowCause([]), undefined);
});

test("patternIsSuperset()", (t) => {
  t.false(patternIsSuperset("main-*", "main"));
  t.true(patternIsSuperset("*", "*"));
  t.true(patternIsSuperset("*", "main-*"));
  t.false(patternIsSuperset("main-*", "*"));
  t.false(patternIsSuperset("main-*", "main"));
  t.true(patternIsSuperset("main", "main"));
  t.false(patternIsSuperset("*", "feature/*"));
  t.true(patternIsSuperset("**", "feature/*"));
  t.false(patternIsSuperset("feature-*", "**"));
  t.false(patternIsSuperset("a/**/c", "a/**/d"));
  t.false(patternIsSuperset("a/**/c", "a/**"));
  t.true(patternIsSuperset("a/**", "a/**/c"));
  t.true(patternIsSuperset("a/**/c", "a/main-**/c"));
  t.false(patternIsSuperset("a/**/b/**/c", "a/**/d/**/c"));
  t.true(patternIsSuperset("a/**/b/**/c", "a/**/b/c/**/c"));
  t.true(patternIsSuperset("a/**/b/**/c", "a/**/b/d/**/c"));
  t.false(patternIsSuperset("a/**/c/d/**/c", "a/**/b/**/c"));
  t.false(patternIsSuperset("a/main-**/c", "a/**/c"));
  t.true(patternIsSuperset("/robin/*/release/*", "/robin/moose/release/goose"));
  t.false(
    patternIsSuperset("/robin/moose/release/goose", "/robin/*/release/*")
  );
});

test("getWorkflowErrors() when branches contain dots", (t) => {
  const errors = getWorkflowErrors(
    yaml.load(`
    on:
      push:
        branches: [4.1, master]
      pull_request:
        # The branches below must be a subset of the branches above
        branches: [4.1, master]
  `) as Workflow
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push has a trailing comma", (t) => {
  const errors = getWorkflowErrors(
    yaml.load(`
  name: "CodeQL"
  on:
    push:
      branches: [master, ]
    pull_request:
      # The branches below must be a subset of the branches above
      branches: [master]
  `) as Workflow
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() should only report the current job's CheckoutWrongHead", (t) => {
  process.env.GITHUB_JOB = "test";

  const errors = getWorkflowErrors(
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
  `) as Workflow
  );

  t.deepEqual(...errorCodes(errors, [WorkflowErrors.CheckoutWrongHead]));
});

test("getWorkflowErrors() should not report a different job's CheckoutWrongHead", (t) => {
  process.env.GITHUB_JOB = "test3";

  const errors = getWorkflowErrors(
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
  `) as Workflow
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on is missing", (t) => {
  const errors = getWorkflowErrors(
    yaml.load(`
  name: "CodeQL"
  `) as Workflow
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() with a different on setup", (t) => {
  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors(
        yaml.load(`
  name: "CodeQL"
  on: "workflow_dispatch"
  `) as Workflow
      ),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors(
        yaml.load(`
  name: "CodeQL"
  on: [workflow_dispatch]
  `) as Workflow
      ),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors(
        yaml.load(`
  name: "CodeQL"
  on:
    workflow_dispatch: {}
  `) as Workflow
      ),
      []
    )
  );
});

test("getWorkflowErrors() should not report an error if PRs are totally unconfigured", (t) => {
  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors(
        yaml.load(`
  name: "CodeQL"
  on:
    push:
      branches: [master]
  `) as Workflow
      ),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      getWorkflowErrors(
        yaml.load(`
  name: "CodeQL"
  on: ["push"]
  `) as Workflow
      ),
      []
    )
  );
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
              - uses: actions/checkout@v2
              - uses: github/codeql-action/init@v2
              - uses: github/codeql-action/analyze@v2
                with:
                  category: some-category
      `) as Workflow,
      "analysis",
      {}
    ),
    "some-category"
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
              - uses: actions/checkout@v2
              - uses: github/codeql-action/init@v2
              - uses: github/codeql-action/analyze@v2
      `) as Workflow,
      "analysis",
      {}
    ),
    undefined
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
      `) as Workflow,
      "bar",
      {}
    ),
    "bar-category"
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
              - uses: actions/checkout@v2
              - uses: github/codeql-action/init@v2
                with:
                  language: \${{ matrix.language }}
              - uses: github/codeql-action/analyze@v2
                with:
                  category: "/language:\${{ matrix.language }}"
      `) as Workflow,
      "analysis",
      { language: "javascript" }
    ),
    "/language:javascript"
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
                - uses: actions/checkout@v2
                - uses: github/codeql-action/init@v2
                - uses: github/codeql-action/analyze@v2
                  with:
                    category: "\${{ github.workflow }}"
        `) as Workflow,
        "analysis",
        {}
      ),
    {
      message:
        "Could not get category input to github/codeql-action/analyze since it contained " +
        "an unrecognized dynamic value.",
    }
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
                - uses: actions/checkout@v2
                - uses: github/codeql-action/init@v2
                - uses: github/codeql-action/analyze@v2
                  with:
                    category: some-category
                - uses: github/codeql-action/analyze@v2
                  with:
                    category: another-category
        `) as Workflow,
        "analysis",
        {}
      ),
    {
      message:
        "Could not get category input to github/codeql-action/analyze since the analysis job " +
        "calls github/codeql-action/analyze multiple times.",
    }
  );
});
