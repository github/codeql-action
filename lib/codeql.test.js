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
exports.stubToolRunnerConstructor = stubToolRunnerConstructor;
const fs = __importStar(require("fs"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const io = __importStar(require("@actions/io"));
const toolcache = __importStar(require("@actions/tool-cache"));
const ava_1 = __importDefault(require("ava"));
const del_1 = __importDefault(require("del"));
const yaml = __importStar(require("js-yaml"));
const nock_1 = __importDefault(require("nock"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const cli_errors_1 = require("./cli-errors");
const codeql = __importStar(require("./codeql"));
const defaults = __importStar(require("./defaults.json"));
const doc_url_1 = require("./doc-url");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const setup_codeql_1 = require("./setup-codeql");
const testing_utils_1 = require("./testing-utils");
const tools_features_1 = require("./tools-features");
const util = __importStar(require("./util"));
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
let stubConfig;
const NO_FEATURES = (0, testing_utils_1.createFeatures)([]);
ava_1.default.beforeEach(() => {
    (0, util_1.initializeEnvironment)("1.2.3");
    stubConfig = (0, testing_utils_1.createTestConfig)({
        languages: [languages_1.Language.cpp],
    });
});
async function installIntoToolcache({ apiDetails = testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, cliVersion, isPinned, tagName, tmpDir, }) {
    const url = (0, testing_utils_1.mockBundleDownloadApi)({ apiDetails, isPinned, tagName });
    await codeql.setupCodeQL(cliVersion !== undefined ? undefined : url, apiDetails, tmpDir, util.GitHubVariant.GHES, cliVersion !== undefined
        ? { cliVersion, tagName }
        : testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), NO_FEATURES, false);
}
function mockReleaseApi({ apiDetails = testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, assetNames, tagName, }) {
    return (0, nock_1.default)(apiDetails.apiURL)
        .get(`/repos/github/codeql-action/releases/tags/${tagName}`)
        .reply(200, {
        assets: assetNames.map((name) => ({
            name,
        })),
        tag_name: tagName,
    });
}
function mockApiDetails(apiDetails) {
    // This is a workaround to mock `api.getApiDetails()` since it doesn't seem to be possible to
    // mock this directly. The difficulty is that `getApiDetails()` is called locally in
    // `api-client.ts`, but `sinon.stub(api, "getApiDetails")` only affects calls to
    // `getApiDetails()` via an imported `api` module.
    sinon
        .stub(actionsUtil, "getRequiredInput")
        .withArgs("token")
        .returns(apiDetails.auth);
    process.env["GITHUB_SERVER_URL"] = apiDetails.url;
    process.env["GITHUB_API_URL"] = apiDetails.apiURL || "";
}
(0, ava_1.default)("downloads and caches explicitly requested bundles that aren't in the toolcache", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const versions = ["20200601", "20200610"];
        for (let i = 0; i < versions.length; i++) {
            const version = versions[i];
            const url = (0, testing_utils_1.mockBundleDownloadApi)({
                tagName: `codeql-bundle-${version}`,
                isPinned: false,
            });
            const result = await codeql.setupCodeQL(url, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, tmpDir, util.GitHubVariant.DOTCOM, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), NO_FEATURES, false);
            t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
            t.is(result.toolsVersion, `0.0.0-${version}`);
            t.is(result.toolsSource, setup_codeql_1.ToolsSource.Download);
        }
        t.is(toolcache.findAllVersions("CodeQL").length, 2);
    });
});
(0, ava_1.default)("caches semantically versioned bundles using their semantic version number", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const url = (0, testing_utils_1.mockBundleDownloadApi)({
            tagName: `codeql-bundle-v2.15.0`,
            isPinned: false,
        });
        const result = await codeql.setupCodeQL(url, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, tmpDir, util.GitHubVariant.DOTCOM, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), NO_FEATURES, false);
        t.is(toolcache.findAllVersions("CodeQL").length, 1);
        t.assert(toolcache.find("CodeQL", `2.15.0`));
        t.is(result.toolsVersion, `2.15.0`);
        t.is(result.toolsSource, setup_codeql_1.ToolsSource.Download);
        if (result.toolsDownloadStatusReport) {
            assertDurationsInteger(t, result.toolsDownloadStatusReport);
        }
    });
});
(0, ava_1.default)("downloads an explicitly requested bundle even if a different version is cached", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        await installIntoToolcache({
            tagName: "codeql-bundle-20200601",
            isPinned: true,
            tmpDir,
        });
        const url = (0, testing_utils_1.mockBundleDownloadApi)({
            tagName: "codeql-bundle-20200610",
        });
        const result = await codeql.setupCodeQL(url, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, tmpDir, util.GitHubVariant.DOTCOM, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), NO_FEATURES, false);
        t.assert(toolcache.find("CodeQL", "0.0.0-20200610"));
        t.deepEqual(result.toolsVersion, "0.0.0-20200610");
        t.is(result.toolsSource, setup_codeql_1.ToolsSource.Download);
        if (result.toolsDownloadStatusReport) {
            assertDurationsInteger(t, result.toolsDownloadStatusReport);
        }
    });
});
const EXPLICITLY_REQUESTED_BUNDLE_TEST_CASES = [
    {
        tagName: "codeql-bundle-2.17.6",
        expectedToolcacheVersion: "2.17.6",
    },
    {
        tagName: "codeql-bundle-20240805",
        expectedToolcacheVersion: "0.0.0-20240805",
    },
];
for (const { tagName, expectedToolcacheVersion, } of EXPLICITLY_REQUESTED_BUNDLE_TEST_CASES) {
    (0, ava_1.default)(`caches explicitly requested bundle ${tagName} as ${expectedToolcacheVersion}`, async (t) => {
        await util.withTmpDir(async (tmpDir) => {
            (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
            mockApiDetails(testing_utils_1.SAMPLE_DOTCOM_API_DETAILS);
            sinon.stub(actionsUtil, "isRunningLocalAction").returns(true);
            const url = (0, testing_utils_1.mockBundleDownloadApi)({
                tagName,
            });
            const result = await codeql.setupCodeQL(url, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, tmpDir, util.GitHubVariant.DOTCOM, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), NO_FEATURES, false);
            t.assert(toolcache.find("CodeQL", expectedToolcacheVersion));
            t.deepEqual(result.toolsVersion, expectedToolcacheVersion);
            t.is(result.toolsSource, setup_codeql_1.ToolsSource.Download);
            t.assert(Number.isInteger(result.toolsDownloadStatusReport?.downloadDurationMs));
        });
    });
}
for (const toolcacheVersion of [
    // Test that we use the tools from the toolcache when `SAMPLE_DEFAULT_CLI_VERSION` is requested
    // and `SAMPLE_DEFAULT_CLI_VERSION-` is in the toolcache.
    testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION.cliVersion,
    `${testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION.cliVersion}-20230101`,
]) {
    (0, ava_1.default)(`uses tools from toolcache when ${testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION.cliVersion} is requested and ` +
        `${toolcacheVersion} is installed`, async (t) => {
        await util.withTmpDir(async (tmpDir) => {
            (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
            sinon
                .stub(toolcache, "find")
                .withArgs("CodeQL", toolcacheVersion)
                .returns("path/to/cached/codeql");
            sinon.stub(toolcache, "findAllVersions").returns([toolcacheVersion]);
            const result = await codeql.setupCodeQL(undefined, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, tmpDir, util.GitHubVariant.DOTCOM, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), NO_FEATURES, false);
            t.is(result.toolsVersion, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION.cliVersion);
            t.is(result.toolsSource, setup_codeql_1.ToolsSource.Toolcache);
            t.is(result.toolsDownloadStatusReport?.combinedDurationMs, undefined);
            t.is(result.toolsDownloadStatusReport?.downloadDurationMs, undefined);
            t.is(result.toolsDownloadStatusReport?.extractionDurationMs, undefined);
        });
    });
}
(0, ava_1.default)(`uses a cached bundle when no tools input is given on GHES`, async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        await installIntoToolcache({
            tagName: "codeql-bundle-20200601",
            isPinned: true,
            tmpDir,
        });
        const result = await codeql.setupCodeQL(undefined, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, tmpDir, util.GitHubVariant.GHES, {
            cliVersion: defaults.cliVersion,
            tagName: defaults.bundleVersion,
        }, (0, logging_1.getRunnerLogger)(true), NO_FEATURES, false);
        t.deepEqual(result.toolsVersion, "0.0.0-20200601");
        t.is(result.toolsSource, setup_codeql_1.ToolsSource.Toolcache);
        t.is(result.toolsDownloadStatusReport?.combinedDurationMs, undefined);
        t.is(result.toolsDownloadStatusReport?.downloadDurationMs, undefined);
        t.is(result.toolsDownloadStatusReport?.extractionDurationMs, undefined);
        const cachedVersions = toolcache.findAllVersions("CodeQL");
        t.is(cachedVersions.length, 1);
    });
});
(0, ava_1.default)(`downloads bundle if only an unpinned version is cached on GHES`, async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        await installIntoToolcache({
            tagName: "codeql-bundle-20200601",
            isPinned: false,
            tmpDir,
        });
        (0, testing_utils_1.mockBundleDownloadApi)({
            tagName: defaults.bundleVersion,
        });
        const result = await codeql.setupCodeQL(undefined, testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, tmpDir, util.GitHubVariant.GHES, {
            cliVersion: defaults.cliVersion,
            tagName: defaults.bundleVersion,
        }, (0, logging_1.getRunnerLogger)(true), NO_FEATURES, false);
        t.deepEqual(result.toolsVersion, defaults.cliVersion);
        t.is(result.toolsSource, setup_codeql_1.ToolsSource.Download);
        if (result.toolsDownloadStatusReport) {
            assertDurationsInteger(t, result.toolsDownloadStatusReport);
        }
        const cachedVersions = toolcache.findAllVersions("CodeQL");
        t.is(cachedVersions.length, 2);
    });
});
(0, ava_1.default)('downloads bundle if "latest" tools specified but not cached', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        await installIntoToolcache({
            tagName: "codeql-bundle-20200601",
            isPinned: true,
            tmpDir,
        });
        (0, testing_utils_1.mockBundleDownloadApi)({
            tagName: defaults.bundleVersion,
        });
        const result = await codeql.setupCodeQL("latest", testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, tmpDir, util.GitHubVariant.DOTCOM, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), NO_FEATURES, false);
        t.deepEqual(result.toolsVersion, defaults.cliVersion);
        t.is(result.toolsSource, setup_codeql_1.ToolsSource.Download);
        if (result.toolsDownloadStatusReport) {
            assertDurationsInteger(t, result.toolsDownloadStatusReport);
        }
        const cachedVersions = toolcache.findAllVersions("CodeQL");
        t.is(cachedVersions.length, 2);
    });
});
(0, ava_1.default)("bundle URL from another repo is cached as 0.0.0-bundleVersion", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        mockApiDetails(testing_utils_1.SAMPLE_DOTCOM_API_DETAILS);
        sinon.stub(actionsUtil, "isRunningLocalAction").returns(true);
        const releasesApiMock = mockReleaseApi({
            assetNames: ["cli-version-2.14.6.txt"],
            tagName: "codeql-bundle-20230203",
        });
        (0, testing_utils_1.mockBundleDownloadApi)({
            repo: "codeql-testing/codeql-cli-nightlies",
            platformSpecific: false,
            tagName: "codeql-bundle-20230203",
        });
        const result = await codeql.setupCodeQL("https://github.com/codeql-testing/codeql-cli-nightlies/releases/download/codeql-bundle-20230203/codeql-bundle.tar.gz", testing_utils_1.SAMPLE_DOTCOM_API_DETAILS, tmpDir, util.GitHubVariant.DOTCOM, testing_utils_1.SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), NO_FEATURES, false);
        t.is(result.toolsVersion, "0.0.0-20230203");
        t.is(result.toolsSource, setup_codeql_1.ToolsSource.Download);
        if (result.toolsDownloadStatusReport) {
            assertDurationsInteger(t, result.toolsDownloadStatusReport);
        }
        const cachedVersions = toolcache.findAllVersions("CodeQL");
        t.is(cachedVersions.length, 1);
        t.is(cachedVersions[0], "0.0.0-20230203");
        t.false(releasesApiMock.isDone());
    });
});
function assertDurationsInteger(t, statusReport) {
    t.assert(Number.isInteger(statusReport?.combinedDurationMs));
    if (statusReport.downloadDurationMs !== undefined) {
        t.assert(Number.isInteger(statusReport?.downloadDurationMs));
        t.assert(Number.isInteger(statusReport?.extractionDurationMs));
    }
}
(0, ava_1.default)("getExtraOptions works for explicit paths", (t) => {
    t.deepEqual(codeql.getExtraOptions({}, ["foo"], []), []);
    t.deepEqual(codeql.getExtraOptions({ foo: [42] }, ["foo"], []), ["42"]);
    t.deepEqual(codeql.getExtraOptions({ foo: { bar: [42] } }, ["foo", "bar"], []), ["42"]);
});
(0, ava_1.default)("getExtraOptions works for wildcards", (t) => {
    t.deepEqual(codeql.getExtraOptions({ "*": [42] }, ["foo"], []), ["42"]);
});
(0, ava_1.default)("getExtraOptions works for wildcards and explicit paths", (t) => {
    const o1 = { "*": [42], foo: [87] };
    t.deepEqual(codeql.getExtraOptions(o1, ["foo"], []), ["42", "87"]);
    const o2 = { "*": [42], foo: [87] };
    t.deepEqual(codeql.getExtraOptions(o2, ["foo", "bar"], []), ["42"]);
    const o3 = { "*": [42], foo: { "*": [87], bar: [99] } };
    const p = ["foo", "bar"];
    t.deepEqual(codeql.getExtraOptions(o3, p, []), ["42", "87", "99"]);
});
(0, ava_1.default)("getExtraOptions throws for bad content", (t) => {
    t.throws(() => codeql.getExtraOptions({ "*": 42 }, ["foo"], []));
    t.throws(() => codeql.getExtraOptions({ foo: 87 }, ["foo"], []));
    t.throws(() => codeql.getExtraOptions({ "*": [42], foo: { "*": 87, bar: [99] } }, ["foo", "bar"], []));
});
// Test macro for ensuring different variants of injected augmented configurations
const injectedConfigMacro = ava_1.default.macro({
    exec: async (t, augmentationProperties, configOverride, expectedConfig) => {
        await util.withTmpDir(async (tempDir) => {
            const runnerConstructorStub = stubToolRunnerConstructor();
            const codeqlObject = await codeql.getCodeQLForTesting();
            sinon.stub(codeqlObject, "getVersion").resolves((0, testing_utils_1.makeVersionInfo)("1.0.0"));
            const thisStubConfig = {
                ...stubConfig,
                ...configOverride,
                tempDir,
                augmentationProperties,
            };
            await codeqlObject.databaseInitCluster(thisStubConfig, "", undefined, undefined, (0, logging_1.getRunnerLogger)(true));
            const args = runnerConstructorStub.firstCall.args[1];
            // should have used an config file
            const configArg = args.find((arg) => arg.startsWith("--codescanning-config="));
            t.truthy(configArg, "Should have injected a codescanning config");
            const configFile = configArg.split("=")[1];
            const augmentedConfig = yaml.load(fs.readFileSync(configFile, "utf8"));
            t.deepEqual(augmentedConfig, expectedConfig);
            await (0, del_1.default)(configFile, { force: true });
        });
    },
    title: (providedTitle = "") => `databaseInitCluster() injected config: ${providedTitle}`,
});
(0, ava_1.default)("basic", injectedConfigMacro, {
    queriesInputCombines: false,
    packsInputCombines: false,
}, {}, {});
(0, ava_1.default)("injected packs from input", injectedConfigMacro, {
    queriesInputCombines: false,
    packsInputCombines: false,
    packsInput: ["xxx", "yyy"],
}, {}, {
    packs: ["xxx", "yyy"],
});
(0, ava_1.default)("injected packs from input with existing packs combines", injectedConfigMacro, {
    queriesInputCombines: false,
    packsInputCombines: true,
    packsInput: ["xxx", "yyy"],
}, {
    originalUserInput: {
        packs: {
            cpp: ["codeql/something-else"],
        },
    },
}, {
    packs: {
        cpp: ["codeql/something-else", "xxx", "yyy"],
    },
});
(0, ava_1.default)("injected packs from input with existing packs overrides", injectedConfigMacro, {
    queriesInputCombines: false,
    packsInputCombines: false,
    packsInput: ["xxx", "yyy"],
}, {
    originalUserInput: {
        packs: {
            cpp: ["codeql/something-else"],
        },
    },
}, {
    packs: ["xxx", "yyy"],
});
// similar, but with queries
(0, ava_1.default)("injected queries from input", injectedConfigMacro, {
    queriesInputCombines: false,
    packsInputCombines: false,
    queriesInput: [{ uses: "xxx" }, { uses: "yyy" }],
}, {}, {
    queries: [
        {
            uses: "xxx",
        },
        {
            uses: "yyy",
        },
    ],
});
(0, ava_1.default)("injected queries from input overrides", injectedConfigMacro, {
    queriesInputCombines: false,
    packsInputCombines: false,
    queriesInput: [{ uses: "xxx" }, { uses: "yyy" }],
}, {
    originalUserInput: {
        queries: [{ uses: "zzz" }],
    },
}, {
    queries: [
        {
            uses: "xxx",
        },
        {
            uses: "yyy",
        },
    ],
});
(0, ava_1.default)("injected queries from input combines", injectedConfigMacro, {
    queriesInputCombines: true,
    packsInputCombines: false,
    queriesInput: [{ uses: "xxx" }, { uses: "yyy" }],
}, {
    originalUserInput: {
        queries: [{ uses: "zzz" }],
    },
}, {
    queries: [
        {
            uses: "zzz",
        },
        {
            uses: "xxx",
        },
        {
            uses: "yyy",
        },
    ],
});
(0, ava_1.default)("injected queries from input combines 2", injectedConfigMacro, {
    queriesInputCombines: true,
    packsInputCombines: true,
    queriesInput: [{ uses: "xxx" }, { uses: "yyy" }],
}, {}, {
    queries: [
        {
            uses: "xxx",
        },
        {
            uses: "yyy",
        },
    ],
});
(0, ava_1.default)("injected queries and packs, but empty", injectedConfigMacro, {
    queriesInputCombines: true,
    packsInputCombines: true,
    queriesInput: [],
    packsInput: [],
}, {
    originalUserInput: {
        packs: [],
        queries: [],
    },
}, {});
(0, ava_1.default)("passes a code scanning config AND qlconfig to the CLI", async (t) => {
    await util.withTmpDir(async (tempDir) => {
        const runnerConstructorStub = stubToolRunnerConstructor();
        const codeqlObject = await codeql.getCodeQLForTesting();
        sinon.stub(codeqlObject, "getVersion").resolves((0, testing_utils_1.makeVersionInfo)("2.17.6"));
        await codeqlObject.databaseInitCluster({ ...stubConfig, tempDir }, "", undefined, "/path/to/qlconfig.yml", (0, logging_1.getRunnerLogger)(true));
        const args = runnerConstructorStub.firstCall.args[1];
        // should have used a config file
        const hasCodeScanningConfigArg = args.some((arg) => arg.startsWith("--codescanning-config="));
        t.true(hasCodeScanningConfigArg, "Should have injected a qlconfig");
        // should have passed a qlconfig file
        const hasQlconfigArg = args.some((arg) => arg.startsWith("--qlconfig-file="));
        t.truthy(hasQlconfigArg, "Should have injected a codescanning config");
    });
});
(0, ava_1.default)("does not pass a qlconfig to the CLI when it is undefined", async (t) => {
    await util.withTmpDir(async (tempDir) => {
        const runnerConstructorStub = stubToolRunnerConstructor();
        const codeqlObject = await codeql.getCodeQLForTesting();
        sinon.stub(codeqlObject, "getVersion").resolves((0, testing_utils_1.makeVersionInfo)("2.17.6"));
        await codeqlObject.databaseInitCluster({ ...stubConfig, tempDir }, "", undefined, undefined, // undefined qlconfigFile
        (0, logging_1.getRunnerLogger)(true));
        const args = runnerConstructorStub.firstCall.args[1];
        const hasQlconfigArg = args.some((arg) => arg.startsWith("--qlconfig-file="));
        t.false(hasQlconfigArg, "should NOT have injected a qlconfig");
    });
});
const NEW_ANALYSIS_SUMMARY_TEST_CASES = [
    {
        codeqlVersion: (0, testing_utils_1.makeVersionInfo)("2.15.0", {
            [tools_features_1.ToolsFeature.AnalysisSummaryV2IsDefault]: true,
        }),
        githubVersion: {
            type: util.GitHubVariant.DOTCOM,
        },
        flagPassed: false,
        negativeFlagPassed: false,
    },
    {
        codeqlVersion: (0, testing_utils_1.makeVersionInfo)("2.15.0"),
        githubVersion: {
            type: util.GitHubVariant.DOTCOM,
        },
        flagPassed: true,
        negativeFlagPassed: false,
    },
    {
        codeqlVersion: (0, testing_utils_1.makeVersionInfo)("2.15.0"),
        githubVersion: {
            type: util.GitHubVariant.GHES,
            version: "3.10.0",
        },
        flagPassed: true,
        negativeFlagPassed: false,
    },
];
for (const { codeqlVersion, flagPassed, githubVersion, negativeFlagPassed, } of NEW_ANALYSIS_SUMMARY_TEST_CASES) {
    (0, ava_1.default)(`database interpret-results passes ${flagPassed
        ? "--new-analysis-summary"
        : negativeFlagPassed
            ? "--no-new-analysis-summary"
            : "nothing"} for CodeQL version ${JSON.stringify(codeqlVersion)} and ${util.GitHubVariant[githubVersion.type]} ${githubVersion.version ? ` ${githubVersion.version}` : ""}`, async (t) => {
        const runnerConstructorStub = stubToolRunnerConstructor();
        const codeqlObject = await codeql.getCodeQLForTesting();
        sinon.stub(codeqlObject, "getVersion").resolves(codeqlVersion);
        // io throws because of the test CodeQL object.
        sinon.stub(io, "which").resolves("");
        await codeqlObject.databaseInterpretResults("", [], "", "", "", "-v", undefined, "", Object.assign({}, stubConfig, { gitHubVersion: githubVersion }), (0, testing_utils_1.createFeatures)([]));
        const actualArgs = runnerConstructorStub.firstCall.args[1];
        t.is(actualArgs.includes("--new-analysis-summary"), flagPassed, `--new-analysis-summary should${flagPassed ? "" : "n't"} be passed`);
        t.is(actualArgs.includes("--no-new-analysis-summary"), negativeFlagPassed, `--no-new-analysis-summary should${negativeFlagPassed ? "" : "n't"} be passed`);
    });
}
(0, ava_1.default)("runTool summarizes several fatal errors", async (t) => {
    const heapError = "A fatal error occurred: Evaluator heap must be at least 384.00 MiB";
    const datasetImportError = "A fatal error occurred: Dataset import for /home/runner/work/_temp/codeql_databases/javascript/db-javascript failed with code 2";
    const cliStderr = `Running TRAP import for CodeQL database at /home/runner/work/_temp/codeql_databases/javascript...\n` +
        `${heapError}\n${datasetImportError}.`;
    stubToolRunnerConstructor(32, cliStderr);
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves((0, testing_utils_1.makeVersionInfo)("2.17.6"));
    // io throws because of the test CodeQL object.
    sinon.stub(io, "which").resolves("");
    await t.throwsAsync(async () => await codeqlObject.finalizeDatabase("db", "--threads=2", "--ram=2048", false), {
        instanceOf: util.ConfigurationError,
        message: new RegExp('Encountered a fatal error while running \\"codeql-for-testing database finalize --finalize-dataset --threads=2 --ram=2048 db\\"\\. ' +
            `Exit code was 32 and error was: ${datasetImportError.replaceAll(".", "\\.")}\\. Context: ${heapError.replaceAll(".", "\\.")}\\. See the logs for more details\\.`),
    });
});
(0, ava_1.default)("runTool summarizes autobuilder errors", async (t) => {
    const stderr = `
    [2019-09-18 12:00:00] [autobuild] A non-error message
    [2019-09-18 12:00:00] Untagged message
    [2019-09-18 12:00:00] [autobuild] [ERROR] Start of the error message
    [2019-09-18 12:00:00] [autobuild] An interspersed non-error message
    [2019-09-18 12:00:01] [autobuild] [ERROR]   Some more context about the error message
    [2019-09-18 12:00:01] [autobuild] [ERROR]   continued
    [2019-09-18 12:00:01] [autobuild] [ERROR]   and finished here.
    [2019-09-18 12:00:01] [autobuild] A non-error message
  `;
    stubToolRunnerConstructor(1, stderr);
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves((0, testing_utils_1.makeVersionInfo)("2.17.6"));
    sinon.stub(codeqlObject, "resolveExtractor").resolves("/path/to/extractor");
    // io throws because of the test CodeQL object.
    sinon.stub(io, "which").resolves("");
    await t.throwsAsync(async () => await codeqlObject.runAutobuild(stubConfig, languages_1.Language.java), {
        instanceOf: util.ConfigurationError,
        message: "We were unable to automatically build your code. Please provide manual build steps. " +
            `See ${doc_url_1.DocUrl.AUTOMATIC_BUILD_FAILED} for more information. ` +
            "Encountered the following error: Start of the error message\n" +
            "  Some more context about the error message\n" +
            "  continued\n" +
            "  and finished here.",
    });
});
(0, ava_1.default)("runTool truncates long autobuilder errors", async (t) => {
    const stderr = Array.from({ length: 20 }, (_, i) => `[2019-09-18 12:00:00] [autobuild] [ERROR] line${i + 1}`).join("\n");
    stubToolRunnerConstructor(1, stderr);
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves((0, testing_utils_1.makeVersionInfo)("2.17.6"));
    sinon.stub(codeqlObject, "resolveExtractor").resolves("/path/to/extractor");
    // io throws because of the test CodeQL object.
    sinon.stub(io, "which").resolves("");
    await t.throwsAsync(async () => await codeqlObject.runAutobuild(stubConfig, languages_1.Language.java), {
        instanceOf: util.ConfigurationError,
        message: "We were unable to automatically build your code. Please provide manual build steps. " +
            `See ${doc_url_1.DocUrl.AUTOMATIC_BUILD_FAILED} for more information. ` +
            "Encountered the following error: " +
            `${Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join("\n")}\n(truncated)`,
    });
});
(0, ava_1.default)("runTool recognizes fatal internal errors", async (t) => {
    const stderr = `
    [11/31 eval 8m19s] Evaluation done; writing results to codeql/go-queries/Security/CWE-020/MissingRegexpAnchor.bqrs.
    Oops! A fatal internal error occurred. Details:
    com.semmle.util.exception.CatastrophicError: An error occurred while evaluating ControlFlowGraph::ControlFlow::Root.isRootOf/1#dispred#f610e6ed/2@86282cc8
    Severe disk cache trouble (corruption or out of space) at /home/runner/work/_temp/codeql_databases/go/db-go/default/cache/pages/28/33.pack: Failed to write item to disk`;
    stubToolRunnerConstructor(1, stderr);
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves((0, testing_utils_1.makeVersionInfo)("2.17.6"));
    sinon.stub(codeqlObject, "resolveExtractor").resolves("/path/to/extractor");
    // io throws because of the test CodeQL object.
    sinon.stub(io, "which").resolves("");
    await t.throwsAsync(async () => await codeqlObject.databaseRunQueries(stubConfig.dbLocation, []), {
        instanceOf: cli_errors_1.CliError,
        message: `Encountered a fatal error while running "codeql-for-testing database run-queries  --expect-discarded-cache --intra-layer-parallelism --min-disk-free=1024 -v". Exit code was 1 and error was: Oops! A fatal internal error occurred. Details:
    com.semmle.util.exception.CatastrophicError: An error occurred while evaluating ControlFlowGraph::ControlFlow::Root.isRootOf/1#dispred#f610e6ed/2@86282cc8
    Severe disk cache trouble (corruption or out of space) at /home/runner/work/_temp/codeql_databases/go/db-go/default/cache/pages/28/33.pack: Failed to write item to disk. See the logs for more details.`,
    });
});
(0, ava_1.default)("runTool outputs last line of stderr if fatal error could not be found", async (t) => {
    const cliStderr = "line1\nline2\nline3\nline4\nline5";
    stubToolRunnerConstructor(32, cliStderr);
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves((0, testing_utils_1.makeVersionInfo)("2.17.6"));
    // io throws because of the test CodeQL object.
    sinon.stub(io, "which").resolves("");
    await t.throwsAsync(async () => await codeqlObject.finalizeDatabase("db", "--threads=2", "--ram=2048", false), {
        instanceOf: util.ConfigurationError,
        message: new RegExp('Encountered a fatal error while running \\"codeql-for-testing database finalize --finalize-dataset --threads=2 --ram=2048 db\\"\\. ' +
            "Exit code was 32 and last log line was: line5\\. See the logs for more details\\."),
    });
});
(0, ava_1.default)("Avoids duplicating --overwrite flag if specified in CODEQL_ACTION_EXTRA_OPTIONS", async (t) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves((0, testing_utils_1.makeVersionInfo)("2.17.6"));
    // io throws because of the test CodeQL object.
    sinon.stub(io, "which").resolves("");
    process.env["CODEQL_ACTION_EXTRA_OPTIONS"] =
        '{ "database": { "init": ["--overwrite"] } }';
    await codeqlObject.databaseInitCluster(stubConfig, "sourceRoot", undefined, undefined, (0, logging_1.getRunnerLogger)(false));
    t.true(runnerConstructorStub.calledOnce);
    const args = runnerConstructorStub.firstCall.args[1];
    t.is(args.filter((option) => option === "--overwrite").length, 1, "--overwrite should only be passed once");
    // Clean up
    const configArg = args.find((arg) => arg.startsWith("--codescanning-config="));
    t.truthy(configArg, "Should have injected a codescanning config");
    const configFile = configArg.split("=")[1];
    await (0, del_1.default)(configFile, { force: true });
});
function stubToolRunnerConstructor(exitCode = 0, stderr) {
    const runnerObjectStub = sinon.createStubInstance(toolrunner.ToolRunner);
    const runnerConstructorStub = sinon.stub(toolrunner, "ToolRunner");
    let stderrListener = undefined;
    runnerConstructorStub.callsFake((_cmd, _args, options) => {
        stderrListener = options.listeners?.stderr;
        return runnerObjectStub;
    });
    runnerObjectStub.exec.callsFake(async () => {
        if (stderrListener !== undefined && stderr !== undefined) {
            stderrListener(Buffer.from(stderr));
        }
        return exitCode;
    });
    return runnerConstructorStub;
}
//# sourceMappingURL=codeql.test.js.map