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
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const api = __importStar(require("./api-client"));
const logging_1 = require("./logging");
const setupCodeql = __importStar(require("./setup-codeql"));
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
ava_1.default.beforeEach(() => {
    (0, util_1.initializeEnvironment)("1.2.3");
});
(0, ava_1.default)("parse codeql bundle url version", (t) => {
    t.deepEqual(setupCodeql.getCodeQLURLVersion("https://github.com/.../codeql-bundle-20200601/..."), "20200601");
});
(0, ava_1.default)("convert to semver", (t) => {
    const tests = {
        "20200601": "0.0.0-20200601",
        "20200601.0": "0.0.0-20200601.0",
        "20200601.0.0": "20200601.0.0",
        "1.2.3": "1.2.3",
        "1.2.3-alpha": "1.2.3-alpha",
        "1.2.3-beta.1": "1.2.3-beta.1",
    };
    for (const [version, expectedVersion] of Object.entries(tests)) {
        try {
            const parsedVersion = setupCodeql.convertToSemVer(version, (0, logging_1.getRunnerLogger)(true));
            t.deepEqual(parsedVersion, expectedVersion);
        }
        catch (e) {
            t.fail(e instanceof Error ? e.message : String(e));
        }
    }
});
(0, ava_1.default)("getCodeQLActionRepository", (t) => {
    const logger = (0, logging_1.getRunnerLogger)(true);
    (0, util_1.initializeEnvironment)("1.2.3");
    // isRunningLocalAction() === true
    delete process.env["GITHUB_ACTION_REPOSITORY"];
    process.env["RUNNER_TEMP"] = path.dirname(__dirname);
    const repoLocalRunner = setupCodeql.getCodeQLActionRepository(logger);
    t.deepEqual(repoLocalRunner, "github/codeql-action");
    // isRunningLocalAction() === false
    sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
    process.env["GITHUB_ACTION_REPOSITORY"] = "xxx/yyy";
    const repoEnv = setupCodeql.getCodeQLActionRepository(logger);
    t.deepEqual(repoEnv, "xxx/yyy");
});
(0, ava_1.default)("findCodeQLBundleTagDotcomOnly() matches GitHub Release with marker file", async (t) => {
    // Look for GitHub Releases in github/codeql-action
    sinon.stub(actionsUtil, "isRunningLocalAction").resolves(true);
    sinon.stub(api, "getApiClient").value(() => ({
        repos: {
            listReleases: sinon.stub().resolves(undefined),
        },
        paginate: sinon.stub().resolves([
            {
                assets: [
                    {
                        name: "cli-version-2.12.0.txt",
                    },
                ],
                tag_name: "codeql-bundle-20230106",
            },
        ]),
    }));
    t.is(await setupCodeql.findCodeQLBundleTagDotcomOnly("2.12.0", (0, logging_1.getRunnerLogger)(true)), "codeql-bundle-20230106");
});
(0, ava_1.default)("findCodeQLBundleTagDotcomOnly() errors if no GitHub Release matches marker file", async (t) => {
    // Look for GitHub Releases in github/codeql-action
    sinon.stub(actionsUtil, "isRunningLocalAction").resolves(true);
    sinon.stub(api, "getApiClient").value(() => ({
        repos: {
            listReleases: sinon.stub().resolves(undefined),
        },
        paginate: sinon.stub().resolves([
            {
                assets: [
                    {
                        name: "cli-version-2.12.0.txt",
                    },
                ],
                tag_name: "codeql-bundle-20230106",
            },
        ]),
    }));
    await t.throwsAsync(async () => await setupCodeql.findCodeQLBundleTagDotcomOnly("2.12.1", (0, logging_1.getRunnerLogger)(true)), {
        message: "Failed to find a release of the CodeQL tools that contains CodeQL CLI 2.12.1.",
    });
});
//# sourceMappingURL=setup-codeql.test.js.map