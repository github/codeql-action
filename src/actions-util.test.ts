import * as fs from "fs";
import * as path from "path";

import test from "ava";
import * as yaml from "js-yaml";
import * as sinon from "sinon";

import * as actionsutil from "./actions-util";
import { setupActionsVars, setupTests } from "./testing-utils";
import { getMode, initializeEnvironment, Mode, withTmpDir } from "./util";

function errorCodes(
  actual: actionsutil.CodedError[],
  expected: actionsutil.CodedError[]
): [string[], string[]] {
  return [actual.map(({ code }) => code), expected.map(({ code }) => code)];
}

setupTests(test);

test("getRef() throws on the empty string", async (t) => {
  process.env["GITHUB_REF"] = "";
  await t.throwsAsync(actionsutil.getRef);
});

test("getRef() returns merge PR ref if GITHUB_SHA still checked out", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
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

test("getRef() returns merge PR ref if GITHUB_REF still checked out but sha has changed (actions checkout@v1)", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
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

test("getRef() returns head PR ref if GITHUB_REF no longer checked out", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
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

test("getRef() returns ref provided as an input and ignores current HEAD", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
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

test("getRef() throws an error if only `ref` is provided as an input", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    const getAdditionalInputStub = sinon.stub(actionsutil, "getOptionalInput");
    getAdditionalInputStub.withArgs("ref").resolves("refs/pull/1/merge");

    await t.throwsAsync(
      async () => {
        await actionsutil.getRef();
      },
      {
        instanceOf: Error,
        message:
          "Both 'ref' and 'sha' are required if one of them is provided.",
      }
    );
    getAdditionalInputStub.restore();
  });
});

test("getRef() throws an error if only `sha` is provided as an input", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);
    process.env["GITHUB_WORKSPACE"] = "/tmp";
    const getAdditionalInputStub = sinon.stub(actionsutil, "getOptionalInput");
    getAdditionalInputStub.withArgs("sha").resolves("a".repeat(40));

    await t.throwsAsync(
      async () => {
        await actionsutil.getRef();
      },
      {
        instanceOf: Error,
        message:
          "Both 'ref' and 'sha' are required if one of them is provided.",
      }
    );
    getAdditionalInputStub.restore();
  });
});

test("computeAutomationID()", async (t) => {
  let actualAutomationID = actionsutil.computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"language": "javascript", "os": "linux"}'
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/"
  );

  // check the environment sorting
  actualAutomationID = actionsutil.computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"os": "linux", "language": "javascript"}'
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/"
  );

  // check that an empty environment produces the right results
  actualAutomationID = actionsutil.computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    "{}"
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/"
  );

  // check non string environment values
  actualAutomationID = actionsutil.computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"number": 1, "object": {"language": "javascript"}}'
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/number:/object:/"
  );

  // check undefined environment
  actualAutomationID = actionsutil.computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    undefined
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/"
  );
});

test("getWorkflowErrors() when on is empty", (t) => {
  const errors = actionsutil.getWorkflowErrors({ on: {} });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is an array missing pull_request", (t) => {
  const errors = actionsutil.getWorkflowErrors({ on: ["push"] });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is an array missing push", (t) => {
  const errors = actionsutil.getWorkflowErrors({ on: ["pull_request"] });

  t.deepEqual(
    ...errorCodes(errors, [actionsutil.WorkflowErrors.MissingPushHook])
  );
});

test("getWorkflowErrors() when on.push is valid", (t) => {
  const errors = actionsutil.getWorkflowErrors({
    on: ["push", "pull_request"],
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is a valid superset", (t) => {
  const errors = actionsutil.getWorkflowErrors({
    on: ["push", "pull_request", "schedule"],
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push should not have a path", (t) => {
  const errors = actionsutil.getWorkflowErrors({
    on: {
      push: { branches: ["main"], paths: ["test/*"] },
      pull_request: { branches: ["main"] },
    },
  });

  t.deepEqual(
    ...errorCodes(errors, [actionsutil.WorkflowErrors.PathsSpecified])
  );
});

test("getWorkflowErrors() when on.push is a correct object", (t) => {
  const errors = actionsutil.getWorkflowErrors({
    on: { push: { branches: ["main"] }, pull_request: { branches: ["main"] } },
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.pull_requests is a string", (t) => {
  const errors = actionsutil.getWorkflowErrors({
    on: { push: { branches: ["main"] }, pull_request: { branches: "*" } },
  });

  t.deepEqual(
    ...errorCodes(errors, [actionsutil.WorkflowErrors.MismatchedBranches])
  );
});

test("getWorkflowErrors() when on.pull_requests is a string and correct", (t) => {
  const errors = actionsutil.getWorkflowErrors({
    on: { push: { branches: "*" }, pull_request: { branches: "*" } },
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is correct with empty objects", (t) => {
  const errors = actionsutil.getWorkflowErrors(
    yaml.load(`
on:
  push:
  pull_request:
`)
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is mismatched", (t) => {
  const errors = actionsutil.getWorkflowErrors({
    on: {
      push: { branches: ["main"] },
      pull_request: { branches: ["feature"] },
    },
  });

  t.deepEqual(
    ...errorCodes(errors, [actionsutil.WorkflowErrors.MismatchedBranches])
  );
});

test("getWorkflowErrors() when on.push is not mismatched", (t) => {
  const errors = actionsutil.getWorkflowErrors({
    on: {
      push: { branches: ["main", "feature"] },
      pull_request: { branches: ["main"] },
    },
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push is mismatched for pull_request", (t) => {
  const errors = actionsutil.getWorkflowErrors({
    on: {
      push: { branches: ["main"] },
      pull_request: { branches: ["main", "feature"] },
    },
  });

  t.deepEqual(
    ...errorCodes(errors, [actionsutil.WorkflowErrors.MismatchedBranches])
  );
});

test("getWorkflowErrors() for a range of malformed workflows", (t) => {
  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors({
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
      actionsutil.getWorkflowErrors({
        on: 1,
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors({
        on: 1,
        jobs: 1,
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors({
        on: 1,
        jobs: [1],
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { 1: 1 },
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { test: 1 },
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { test: [1] },
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { test: { steps: 1 } },
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { test: { steps: [{ notrun: "git checkout HEAD^2" }] } },
      } as any),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors({
        on: 1,
        jobs: { test: [undefined] },
      } as any),
      []
    )
  );

  t.deepEqual(...errorCodes(actionsutil.getWorkflowErrors(1 as any), []));

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors({
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
  const errors = actionsutil.getWorkflowErrors(
    yaml.load(`
name: "CodeQL"
on:
  push:
    branches: ["main"]
  pull_request:
`)
  );

  t.deepEqual(
    ...errorCodes(errors, [actionsutil.WorkflowErrors.MismatchedBranches])
  );
});

test("getWorkflowErrors() when on.pull_request for wildcard branches", (t) => {
  const errors = actionsutil.getWorkflowErrors({
    on: {
      push: { branches: ["feature/*"] },
      pull_request: { branches: "feature/moose" },
    },
  });

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.pull_request for mismatched wildcard branches", (t) => {
  const errors = actionsutil.getWorkflowErrors({
    on: {
      push: { branches: ["feature/moose"] },
      pull_request: { branches: "feature/*" },
    },
  });

  t.deepEqual(
    ...errorCodes(errors, [actionsutil.WorkflowErrors.MismatchedBranches])
  );
});

test("getWorkflowErrors() when HEAD^2 is checked out", (t) => {
  process.env.GITHUB_JOB = "test";

  const errors = actionsutil.getWorkflowErrors({
    on: ["push", "pull_request"],
    jobs: { test: { steps: [{ run: "git checkout HEAD^2" }] } },
  });

  t.deepEqual(
    ...errorCodes(errors, [actionsutil.WorkflowErrors.CheckoutWrongHead])
  );
});

test("formatWorkflowErrors() when there is one error", (t) => {
  const message = actionsutil.formatWorkflowErrors([
    actionsutil.WorkflowErrors.CheckoutWrongHead,
  ]);
  t.true(message.startsWith("1 issue was detected with this workflow:"));
});

test("formatWorkflowErrors() when there are multiple errors", (t) => {
  const message = actionsutil.formatWorkflowErrors([
    actionsutil.WorkflowErrors.CheckoutWrongHead,
    actionsutil.WorkflowErrors.PathsSpecified,
  ]);
  t.true(message.startsWith("2 issues were detected with this workflow:"));
});

test("formatWorkflowCause() with no errors", (t) => {
  const message = actionsutil.formatWorkflowCause([]);

  t.deepEqual(message, undefined);
});

test("formatWorkflowCause()", (t) => {
  const message = actionsutil.formatWorkflowCause([
    actionsutil.WorkflowErrors.CheckoutWrongHead,
    actionsutil.WorkflowErrors.PathsSpecified,
  ]);

  t.deepEqual(message, "CheckoutWrongHead,PathsSpecified");
  t.deepEqual(actionsutil.formatWorkflowCause([]), undefined);
});

test("patternIsSuperset()", (t) => {
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
  t.true(
    actionsutil.patternIsSuperset(
      "/robin/*/release/*",
      "/robin/moose/release/goose"
    )
  );
  t.false(
    actionsutil.patternIsSuperset(
      "/robin/moose/release/goose",
      "/robin/*/release/*"
    )
  );
});

test("getWorkflowErrors() when branches contain dots", (t) => {
  const errors = actionsutil.getWorkflowErrors(
    yaml.load(`
  on:
    push:
      branches: [4.1, master]
    pull_request:
      # The branches below must be a subset of the branches above
      branches: [4.1, master]
`)
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on.push has a trailing comma", (t) => {
  const errors = actionsutil.getWorkflowErrors(
    yaml.load(`
name: "CodeQL"
on:
  push:
    branches: [master, ]
  pull_request:
    # The branches below must be a subset of the branches above
    branches: [master]
`)
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() should only report the current job's CheckoutWrongHead", (t) => {
  process.env.GITHUB_JOB = "test";

  const errors = actionsutil.getWorkflowErrors(
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
`)
  );

  t.deepEqual(
    ...errorCodes(errors, [actionsutil.WorkflowErrors.CheckoutWrongHead])
  );
});

test("getWorkflowErrors() should not report a different job's CheckoutWrongHead", (t) => {
  process.env.GITHUB_JOB = "test3";

  const errors = actionsutil.getWorkflowErrors(
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
`)
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() when on is missing", (t) => {
  const errors = actionsutil.getWorkflowErrors(
    yaml.load(`
name: "CodeQL"
`)
  );

  t.deepEqual(...errorCodes(errors, []));
});

test("getWorkflowErrors() with a different on setup", (t) => {
  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors(
        yaml.load(`
name: "CodeQL"
on: "workflow_dispatch"
`)
      ),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors(
        yaml.load(`
name: "CodeQL"
on: [workflow_dispatch]
`)
      ),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors(
        yaml.load(`
name: "CodeQL"
on:
  workflow_dispatch: {}
`)
      ),
      []
    )
  );
});

test("getWorkflowErrors() should not report an error if PRs are totally unconfigured", (t) => {
  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors(
        yaml.load(`
name: "CodeQL"
on:
  push:
    branches: [master]
`)
      ),
      []
    )
  );

  t.deepEqual(
    ...errorCodes(
      actionsutil.getWorkflowErrors(
        yaml.load(`
name: "CodeQL"
on: ["push"]
`)
      ),
      []
    )
  );
});

test("initializeEnvironment", (t) => {
  initializeEnvironment(Mode.actions, "1.2.3");
  t.deepEqual(getMode(), Mode.actions);
  t.deepEqual(process.env.CODEQL_ACTION_VERSION, "1.2.3");

  initializeEnvironment(Mode.runner, "4.5.6");
  t.deepEqual(getMode(), Mode.runner);
  t.deepEqual(process.env.CODEQL_ACTION_VERSION, "4.5.6");
});

test("isAnalyzingDefaultBranch()", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const envFile = path.join(tmpDir, "event.json");
    fs.writeFileSync(
      envFile,
      JSON.stringify({
        repository: {
          default_branch: "main",
        },
      })
    );
    process.env["GITHUB_EVENT_PATH"] = envFile;

    process.env["GITHUB_REF"] = "main";
    process.env["GITHUB_SHA"] = "1234";
    t.deepEqual(await actionsutil.isAnalyzingDefaultBranch(), true);

    process.env["GITHUB_REF"] = "refs/heads/main";
    t.deepEqual(await actionsutil.isAnalyzingDefaultBranch(), true);

    process.env["GITHUB_REF"] = "feature";
    t.deepEqual(await actionsutil.isAnalyzingDefaultBranch(), false);
  });
});

test("sanitizeArifactName", (t) => {
  t.deepEqual(actionsutil.sanitizeArifactName("hello-world_"), "hello-world_");
  t.deepEqual(actionsutil.sanitizeArifactName("hello`world`"), "helloworld");
  t.deepEqual(actionsutil.sanitizeArifactName("hello===123"), "hello123");
  t.deepEqual(
    actionsutil.sanitizeArifactName("*m)a&n^y%i££n+v!a:l[i]d"),
    "manyinvalid"
  );
});
