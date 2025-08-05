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
const github = __importStar(require("@actions/github"));
const ava_1 = __importDefault(require("ava"));
const actions_util_1 = require("./actions-util");
const api_client_1 = require("./api-client");
const environment_1 = require("./environment");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
function withMockedContext(mockPayload, testFn) {
    const originalPayload = github.context.payload;
    github.context.payload = mockPayload;
    try {
        return testFn();
    }
    finally {
        github.context.payload = originalPayload;
    }
}
function withMockedEnv(envVars, testFn) {
    const originalEnv = { ...process.env };
    // Apply environment changes
    for (const [key, value] of Object.entries(envVars)) {
        if (value === undefined) {
            delete process.env[key];
        }
        else {
            process.env[key] = value;
        }
    }
    try {
        return testFn();
    }
    finally {
        // Restore original environment
        process.env = originalEnv;
    }
}
(0, ava_1.default)("computeAutomationID()", async (t) => {
    let actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", '{"language": "javascript", "os": "linux"}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/");
    // check the environment sorting
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", '{"os": "linux", "language": "javascript"}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/");
    // check that an empty environment produces the right results
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", "{}");
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/");
    // check non string environment values
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", '{"number": 1, "object": {"language": "javascript"}}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/number:/object:/");
    // check undefined environment
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", undefined);
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/");
});
(0, ava_1.default)("getPullRequestBranches() with pull request context", (t) => {
    withMockedContext({
        pull_request: {
            number: 123,
            base: { ref: "main" },
            head: { label: "user:feature-branch" },
        },
    }, () => {
        t.deepEqual((0, actions_util_1.getPullRequestBranches)(), {
            base: "main",
            head: "user:feature-branch",
        });
        t.is((0, actions_util_1.isAnalyzingPullRequest)(), true);
    });
});
(0, ava_1.default)("getPullRequestBranches() returns undefined with push context", (t) => {
    withMockedContext({
        push: {
            ref: "refs/heads/main",
        },
    }, () => {
        t.is((0, actions_util_1.getPullRequestBranches)(), undefined);
        t.is((0, actions_util_1.isAnalyzingPullRequest)(), false);
    });
});
(0, ava_1.default)("getPullRequestBranches() with Default Setup environment variables", (t) => {
    withMockedContext({}, () => {
        withMockedEnv({
            CODE_SCANNING_REF: "refs/heads/feature-branch",
            CODE_SCANNING_BASE_BRANCH: "main",
        }, () => {
            t.deepEqual((0, actions_util_1.getPullRequestBranches)(), {
                base: "main",
                head: "refs/heads/feature-branch",
            });
            t.is((0, actions_util_1.isAnalyzingPullRequest)(), true);
        });
    });
});
(0, ava_1.default)("getPullRequestBranches() returns undefined when only CODE_SCANNING_REF is set", (t) => {
    withMockedContext({}, () => {
        withMockedEnv({
            CODE_SCANNING_REF: "refs/heads/feature-branch",
            CODE_SCANNING_BASE_BRANCH: undefined,
        }, () => {
            t.is((0, actions_util_1.getPullRequestBranches)(), undefined);
            t.is((0, actions_util_1.isAnalyzingPullRequest)(), false);
        });
    });
});
(0, ava_1.default)("getPullRequestBranches() returns undefined when only CODE_SCANNING_BASE_BRANCH is set", (t) => {
    withMockedContext({}, () => {
        withMockedEnv({
            CODE_SCANNING_REF: undefined,
            CODE_SCANNING_BASE_BRANCH: "main",
        }, () => {
            t.is((0, actions_util_1.getPullRequestBranches)(), undefined);
            t.is((0, actions_util_1.isAnalyzingPullRequest)(), false);
        });
    });
});
(0, ava_1.default)("getPullRequestBranches() returns undefined when no PR context", (t) => {
    withMockedContext({}, () => {
        withMockedEnv({
            CODE_SCANNING_REF: undefined,
            CODE_SCANNING_BASE_BRANCH: undefined,
        }, () => {
            t.is((0, actions_util_1.getPullRequestBranches)(), undefined);
            t.is((0, actions_util_1.isAnalyzingPullRequest)(), false);
        });
    });
});
(0, ava_1.default)("initializeEnvironment", (t) => {
    (0, util_1.initializeEnvironment)("1.2.3");
    t.deepEqual(process.env[environment_1.EnvVar.VERSION], "1.2.3");
});
//# sourceMappingURL=actions-util.test.js.map