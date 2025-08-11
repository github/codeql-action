import * as github from "@actions/github";
import test from "ava";

import {
  fixCodeQualityCategory,
  getPullRequestBranches,
  isAnalyzingPullRequest,
} from "./actions-util";
import { computeAutomationID } from "./api-client";
import { EnvVar } from "./environment";
import { getRunnerLogger } from "./logging";
import { setupTests } from "./testing-utils";
import { initializeEnvironment } from "./util";

setupTests(test);

function withMockedContext<T>(mockPayload: any, testFn: () => T): T {
  const originalPayload = github.context.payload;
  github.context.payload = mockPayload;
  try {
    return testFn();
  } finally {
    github.context.payload = originalPayload;
  }
}

function withMockedEnv<T>(
  envVars: Record<string, string | undefined>,
  testFn: () => T,
): T {
  const originalEnv = { ...process.env };

  // Apply environment changes
  for (const [key, value] of Object.entries(envVars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return testFn();
  } finally {
    // Restore original environment
    process.env = originalEnv;
  }
}

test("computeAutomationID()", async (t) => {
  let actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"language": "javascript", "os": "linux"}',
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/",
  );

  // check the environment sorting
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"os": "linux", "language": "javascript"}',
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/",
  );

  // check that an empty environment produces the right results
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    "{}",
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/",
  );

  // check non string environment values
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"number": 1, "object": {"language": "javascript"}}',
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/number:/object:/",
  );

  // check undefined environment
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    undefined,
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/",
  );
});

test("getPullRequestBranches() with pull request context", (t) => {
  withMockedContext(
    {
      pull_request: {
        number: 123,
        base: { ref: "main" },
        head: { label: "user:feature-branch" },
      },
    },
    () => {
      t.deepEqual(getPullRequestBranches(), {
        base: "main",
        head: "user:feature-branch",
      });
      t.is(isAnalyzingPullRequest(), true);
    },
  );
});

test("getPullRequestBranches() returns undefined with push context", (t) => {
  withMockedContext(
    {
      push: {
        ref: "refs/heads/main",
      },
    },
    () => {
      t.is(getPullRequestBranches(), undefined);
      t.is(isAnalyzingPullRequest(), false);
    },
  );
});

test("getPullRequestBranches() with Default Setup environment variables", (t) => {
  withMockedContext({}, () => {
    withMockedEnv(
      {
        CODE_SCANNING_REF: "refs/heads/feature-branch",
        CODE_SCANNING_BASE_BRANCH: "main",
      },
      () => {
        t.deepEqual(getPullRequestBranches(), {
          base: "main",
          head: "refs/heads/feature-branch",
        });
        t.is(isAnalyzingPullRequest(), true);
      },
    );
  });
});

test("getPullRequestBranches() returns undefined when only CODE_SCANNING_REF is set", (t) => {
  withMockedContext({}, () => {
    withMockedEnv(
      {
        CODE_SCANNING_REF: "refs/heads/feature-branch",
        CODE_SCANNING_BASE_BRANCH: undefined,
      },
      () => {
        t.is(getPullRequestBranches(), undefined);
        t.is(isAnalyzingPullRequest(), false);
      },
    );
  });
});

test("getPullRequestBranches() returns undefined when only CODE_SCANNING_BASE_BRANCH is set", (t) => {
  withMockedContext({}, () => {
    withMockedEnv(
      {
        CODE_SCANNING_REF: undefined,
        CODE_SCANNING_BASE_BRANCH: "main",
      },
      () => {
        t.is(getPullRequestBranches(), undefined);
        t.is(isAnalyzingPullRequest(), false);
      },
    );
  });
});

test("getPullRequestBranches() returns undefined when no PR context", (t) => {
  withMockedContext({}, () => {
    withMockedEnv(
      {
        CODE_SCANNING_REF: undefined,
        CODE_SCANNING_BASE_BRANCH: undefined,
      },
      () => {
        t.is(getPullRequestBranches(), undefined);
        t.is(isAnalyzingPullRequest(), false);
      },
    );
  });
});

test("initializeEnvironment", (t) => {
  initializeEnvironment("1.2.3");
  t.deepEqual(process.env[EnvVar.VERSION], "1.2.3");
});

test("fixCodeQualityCategory", (t) => {
  withMockedEnv(
    {
      GITHUB_EVENT_NAME: "dynamic",
    },
    () => {
      const logger = getRunnerLogger(true);

      // Categories that should get adjusted.
      t.is(fixCodeQualityCategory(logger, "/language:c#"), "/language:csharp");
      t.is(fixCodeQualityCategory(logger, "/language:cpp"), "/language:c-cpp");
      t.is(fixCodeQualityCategory(logger, "/language:c"), "/language:c-cpp");
      t.is(
        fixCodeQualityCategory(logger, "/language:java"),
        "/language:java-kotlin",
      );
      t.is(
        fixCodeQualityCategory(logger, "/language:javascript"),
        "/language:javascript-typescript",
      );
      t.is(
        fixCodeQualityCategory(logger, "/language:typescript"),
        "/language:javascript-typescript",
      );
      t.is(
        fixCodeQualityCategory(logger, "/language:kotlin"),
        "/language:java-kotlin",
      );

      // Categories that should not get adjusted.
      t.is(
        fixCodeQualityCategory(logger, "/language:csharp"),
        "/language:csharp",
      );
      t.is(fixCodeQualityCategory(logger, "/language:go"), "/language:go");
      t.is(
        fixCodeQualityCategory(logger, "/language:actions"),
        "/language:actions",
      );

      // Other cases.
      t.is(fixCodeQualityCategory(logger, undefined), undefined);
      t.is(fixCodeQualityCategory(logger, "random string"), "random string");
      t.is(fixCodeQualityCategory(logger, "kotlin"), "kotlin");
    },
  );
});
