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
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const apiClient = __importStar(require("./api-client"));
const diff_informed_analysis_utils_1 = require("./diff-informed-analysis-utils");
const feature_flags_1 = require("./feature-flags");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
const defaultTestCase = {
    featureEnabled: true,
    gitHubVersion: {
        type: util_1.GitHubVariant.DOTCOM,
    },
    pullRequestBranches: {
        base: "main",
        head: "feature-branch",
    },
    codeQLVersion: "2.21.0",
};
const testShouldPerformDiffInformedAnalysis = ava_1.default.macro({
    exec: async (t, _title, partialTestCase, expectedResult) => {
        return await (0, util_1.withTmpDir)(async (tmpDir) => {
            (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
            const testCase = { ...defaultTestCase, ...partialTestCase };
            const logger = (0, logging_1.getRunnerLogger)(true);
            const codeql = (0, testing_utils_1.mockCodeQLVersion)(testCase.codeQLVersion);
            if (testCase.diffInformedQueriesEnvVar !== undefined) {
                process.env.CODEQL_ACTION_DIFF_INFORMED_QUERIES =
                    testCase.diffInformedQueriesEnvVar.toString();
            }
            else {
                delete process.env.CODEQL_ACTION_DIFF_INFORMED_QUERIES;
            }
            const features = new feature_flags_1.Features(testCase.gitHubVersion, (0, repository_1.parseRepositoryNwo)("github/example"), tmpDir, logger);
            (0, testing_utils_1.mockFeatureFlagApiEndpoint)(200, {
                [feature_flags_1.Feature.DiffInformedQueries]: testCase.featureEnabled,
            });
            const getGitHubVersionStub = sinon
                .stub(apiClient, "getGitHubVersion")
                .resolves(testCase.gitHubVersion);
            const getPullRequestBranchesStub = sinon
                .stub(actionsUtil, "getPullRequestBranches")
                .returns(testCase.pullRequestBranches);
            const result = await (0, diff_informed_analysis_utils_1.shouldPerformDiffInformedAnalysis)(codeql, features, logger);
            t.is(result, expectedResult);
            delete process.env.CODEQL_ACTION_DIFF_INFORMED_QUERIES;
            getGitHubVersionStub.restore();
            getPullRequestBranchesStub.restore();
        });
    },
    title: (_, title) => `shouldPerformDiffInformedAnalysis: ${title}`,
});
(0, ava_1.default)(testShouldPerformDiffInformedAnalysis, "returns true in the default test case", {}, true);
(0, ava_1.default)(testShouldPerformDiffInformedAnalysis, "returns false when feature flag is disabled from the API", {
    featureEnabled: false,
}, false);
(0, ava_1.default)(testShouldPerformDiffInformedAnalysis, "returns false when CODEQL_ACTION_DIFF_INFORMED_QUERIES is set to false", {
    featureEnabled: true,
    diffInformedQueriesEnvVar: false,
}, false);
(0, ava_1.default)(testShouldPerformDiffInformedAnalysis, "returns true when CODEQL_ACTION_DIFF_INFORMED_QUERIES is set to true", {
    featureEnabled: false,
    diffInformedQueriesEnvVar: true,
}, true);
(0, ava_1.default)(testShouldPerformDiffInformedAnalysis, "returns false for CodeQL version 2.20.0", {
    codeQLVersion: "2.20.0",
}, false);
(0, ava_1.default)(testShouldPerformDiffInformedAnalysis, "returns false for invalid GHES version", {
    gitHubVersion: {
        type: util_1.GitHubVariant.GHES,
        version: "invalid-version",
    },
}, false);
(0, ava_1.default)(testShouldPerformDiffInformedAnalysis, "returns false for GHES version 3.18.5", {
    gitHubVersion: {
        type: util_1.GitHubVariant.GHES,
        version: "3.18.5",
    },
}, false);
(0, ava_1.default)(testShouldPerformDiffInformedAnalysis, "returns true for GHES version 3.19.0", {
    gitHubVersion: {
        type: util_1.GitHubVariant.GHES,
        version: "3.19.0",
    },
}, true);
(0, ava_1.default)(testShouldPerformDiffInformedAnalysis, "returns false when not a pull request", {
    pullRequestBranches: undefined,
}, false);
//# sourceMappingURL=diff-informed-analysis-utils.test.js.map