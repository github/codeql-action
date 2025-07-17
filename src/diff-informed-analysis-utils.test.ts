import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import type { PullRequestBranches } from "./actions-util";
import * as apiClient from "./api-client";
import { shouldPerformDiffInformedAnalysis } from "./diff-informed-analysis-utils";
import { Feature, Features } from "./feature-flags";
import { getRunnerLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import {
  setupTests,
  mockCodeQLVersion,
  mockFeatureFlagApiEndpoint,
  setupActionsVars,
} from "./testing-utils";
import { GitHubVariant, withTmpDir } from "./util";
import type { GitHubVersion } from "./util";

setupTests(test);

interface DiffInformedAnalysisTestCase {
  featureEnabled: boolean;
  gitHubVersion: GitHubVersion;
  pullRequestBranches: PullRequestBranches;
  codeQLVersion: string;
  diffInformedQueriesEnvVar?: boolean;
}

const defaultTestCase: DiffInformedAnalysisTestCase = {
  featureEnabled: true,
  gitHubVersion: {
    type: GitHubVariant.DOTCOM,
  },
  pullRequestBranches: {
    base: "main",
    head: "feature-branch",
  },
  codeQLVersion: "2.21.0",
};

const testShouldPerformDiffInformedAnalysis = test.macro({
  exec: async (
    t: ExecutionContext,
    _title: string,
    partialTestCase: Partial<DiffInformedAnalysisTestCase>,
    expectedResult: boolean,
  ) => {
    return await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      const testCase = { ...defaultTestCase, ...partialTestCase };
      const logger = getRunnerLogger(true);
      const codeql = mockCodeQLVersion(testCase.codeQLVersion);

      if (testCase.diffInformedQueriesEnvVar !== undefined) {
        process.env.CODEQL_ACTION_DIFF_INFORMED_QUERIES =
          testCase.diffInformedQueriesEnvVar.toString();
      } else {
        delete process.env.CODEQL_ACTION_DIFF_INFORMED_QUERIES;
      }

      const features = new Features(
        testCase.gitHubVersion,
        parseRepositoryNwo("github/example"),
        tmpDir,
        logger,
      );
      mockFeatureFlagApiEndpoint(200, {
        [Feature.DiffInformedQueries]: testCase.featureEnabled,
      });

      const getGitHubVersionStub = sinon
        .stub(apiClient, "getGitHubVersion")
        .resolves(testCase.gitHubVersion);
      const getPullRequestBranchesStub = sinon
        .stub(actionsUtil, "getPullRequestBranches")
        .returns(testCase.pullRequestBranches);

      const result = await shouldPerformDiffInformedAnalysis(
        codeql,
        features,
        logger,
      );

      t.is(result, expectedResult);

      delete process.env.CODEQL_ACTION_DIFF_INFORMED_QUERIES;

      getGitHubVersionStub.restore();
      getPullRequestBranchesStub.restore();
    });
  },
  title: (_, title) => `shouldPerformDiffInformedAnalysis: ${title}`,
});

test(
  testShouldPerformDiffInformedAnalysis,
  "returns true in the default test case",
  {},
  true,
);

test(
  testShouldPerformDiffInformedAnalysis,
  "returns false when feature flag is disabled from the API",
  {
    featureEnabled: false,
  },
  false,
);

test(
  testShouldPerformDiffInformedAnalysis,
  "returns false when CODEQL_ACTION_DIFF_INFORMED_QUERIES is set to false",
  {
    featureEnabled: true,
    diffInformedQueriesEnvVar: false,
  },
  false,
);

test(
  testShouldPerformDiffInformedAnalysis,
  "returns true when CODEQL_ACTION_DIFF_INFORMED_QUERIES is set to true",
  {
    featureEnabled: false,
    diffInformedQueriesEnvVar: true,
  },
  true,
);

test(
  testShouldPerformDiffInformedAnalysis,
  "returns false for CodeQL version 2.20.0",
  {
    codeQLVersion: "2.20.0",
  },
  false,
);

test(
  testShouldPerformDiffInformedAnalysis,
  "returns false for invalid GHES version",
  {
    gitHubVersion: {
      type: GitHubVariant.GHES,
      version: "invalid-version",
    },
  },
  false,
);

test(
  testShouldPerformDiffInformedAnalysis,
  "returns false for GHES version 3.18.5",
  {
    gitHubVersion: {
      type: GitHubVariant.GHES,
      version: "3.18.5",
    },
  },
  false,
);

test(
  testShouldPerformDiffInformedAnalysis,
  "returns true for GHES version 3.19.0",
  {
    gitHubVersion: {
      type: GitHubVariant.GHES,
      version: "3.19.0",
    },
  },
  true,
);

test(
  testShouldPerformDiffInformedAnalysis,
  "returns false when not a pull request",
  {
    pullRequestBranches: undefined,
  },
  false,
);
