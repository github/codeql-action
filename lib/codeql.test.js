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
exports.stubToolRunnerConstructor = void 0;
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const toolcache = __importStar(require("@actions/tool-cache"));
const safeWhich = __importStar(require("@chrisgavin/safe-which"));
const ava_1 = __importDefault(require("ava"));
const del_1 = __importDefault(require("del"));
const yaml = __importStar(require("js-yaml"));
const nock_1 = __importDefault(require("nock"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const api = __importStar(require("./api-client"));
const codeql = __importStar(require("./codeql"));
const defaults = __importStar(require("./defaults.json"));
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
const sampleApiDetails = {
    auth: "token",
    url: "https://github.com",
    apiURL: "https://api.github.com",
};
const sampleGHAEApiDetails = {
    auth: "token",
    url: "https://example.githubenterprise.com",
    apiURL: "https://example.githubenterprise.com/api/v3",
};
const SAMPLE_DEFAULT_CLI_VERSION = {
    cliVersion: "2.0.0",
    variant: util.GitHubVariant.DOTCOM,
};
let stubConfig;
ava_1.default.beforeEach(() => {
    (0, util_1.initializeEnvironment)("1.2.3");
    stubConfig = {
        languages: [languages_1.Language.cpp],
        queries: {},
        pathsIgnore: [],
        paths: [],
        originalUserInput: {},
        tempDir: "",
        codeQLCmd: "",
        gitHubVersion: {
            type: util.GitHubVariant.DOTCOM,
        },
        dbLocation: "",
        packs: {},
        debugMode: false,
        debugArtifactName: util.DEFAULT_DEBUG_ARTIFACT_NAME,
        debugDatabaseName: util.DEFAULT_DEBUG_DATABASE_NAME,
        augmentationProperties: {
            injectedMlQueries: false,
            packsInputCombines: false,
            queriesInputCombines: false,
        },
        trapCaches: {},
        trapCacheDownloadTime: 0,
    };
});
/**
 * Mocks the API for downloading the bundle tagged `tagName`.
 *
 * @returns the download URL for the bundle. This can be passed to the tools parameter of
 * `codeql.setupCodeQL`.
 */
function mockDownloadApi({ apiDetails = sampleApiDetails, isPinned, tagName, }) {
    var _a;
    const platform = process.platform === "win32"
        ? "win64"
        : process.platform === "linux"
            ? "linux64"
            : "osx64";
    const baseUrl = (_a = apiDetails === null || apiDetails === void 0 ? void 0 : apiDetails.url) !== null && _a !== void 0 ? _a : "https://example.com";
    const relativeUrl = apiDetails
        ? `/github/codeql-action/releases/download/${tagName}/codeql-bundle-${platform}.tar.gz`
        : `/download/${tagName}/codeql-bundle.tar.gz`;
    (0, nock_1.default)(baseUrl)
        .get(relativeUrl)
        .replyWithFile(200, path_1.default.join(__dirname, `/../src/testdata/codeql-bundle${isPinned ? "-pinned" : ""}.tar.gz`));
    return `${baseUrl}${relativeUrl}`;
}
async function installIntoToolcache({ apiDetails = sampleApiDetails, cliVersion, isPinned, tagName, tmpDir, }) {
    const url = mockDownloadApi({ apiDetails, isPinned, tagName });
    await codeql.setupCodeQL(cliVersion !== undefined ? undefined : url, apiDetails, tmpDir, util.GitHubVariant.GHES, false, cliVersion !== undefined
        ? { cliVersion, tagName, variant: util.GitHubVariant.GHES }
        : SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), false);
}
function mockReleaseApi({ apiDetails = sampleApiDetails, assetNames, tagName, }) {
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
    const requiredEnvParamStub = sinon.stub(util, "getRequiredEnvParam");
    requiredEnvParamStub.withArgs("GITHUB_SERVER_URL").returns(apiDetails.url);
    requiredEnvParamStub
        .withArgs("GITHUB_API_URL")
        .returns(apiDetails.apiURL || "");
}
(0, ava_1.default)("downloads and caches explicitly requested bundles that aren't in the toolcache", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const versions = ["20200601", "20200610"];
        for (let i = 0; i < versions.length; i++) {
            const version = versions[i];
            const url = mockDownloadApi({
                tagName: `codeql-bundle-${version}`,
                isPinned: false,
            });
            const result = await codeql.setupCodeQL(url, sampleApiDetails, tmpDir, util.GitHubVariant.DOTCOM, false, SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), false);
            t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
            t.is(result.toolsVersion, `0.0.0-${version}`);
        }
        t.is(toolcache.findAllVersions("CodeQL").length, 2);
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
        const url = mockDownloadApi({
            tagName: "codeql-bundle-20200610",
        });
        const result = await codeql.setupCodeQL(url, sampleApiDetails, tmpDir, util.GitHubVariant.DOTCOM, false, SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), false);
        t.assert(toolcache.find("CodeQL", "0.0.0-20200610"));
        t.deepEqual(result.toolsVersion, "0.0.0-20200610");
    });
});
const EXPLICITLY_REQUESTED_BUNDLE_TEST_CASES = [
    {
        cliVersion: "2.10.0",
        expectedToolcacheVersion: "2.10.0-20200610",
    },
    {
        cliVersion: "2.10.0-pre",
        expectedToolcacheVersion: "0.0.0-20200610",
    },
];
for (const { cliVersion, expectedToolcacheVersion, } of EXPLICITLY_REQUESTED_BUNDLE_TEST_CASES) {
    (0, ava_1.default)(`caches an explicitly requested bundle containing CLI ${cliVersion} as ${expectedToolcacheVersion}`, async (t) => {
        await util.withTmpDir(async (tmpDir) => {
            (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
            mockApiDetails(sampleApiDetails);
            sinon.stub(actionsUtil, "isRunningLocalAction").returns(true);
            const releaseApiMock = mockReleaseApi({
                assetNames: [`cli-version-${cliVersion}.txt`],
                tagName: "codeql-bundle-20200610",
            });
            const url = mockDownloadApi({
                tagName: "codeql-bundle-20200610",
            });
            const result = await codeql.setupCodeQL(url, sampleApiDetails, tmpDir, util.GitHubVariant.DOTCOM, false, SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), false);
            t.assert(releaseApiMock.isDone(), "Releases API should have been called");
            t.assert(toolcache.find("CodeQL", expectedToolcacheVersion));
            t.deepEqual(result.toolsVersion, cliVersion);
        });
    });
}
for (const { isCached, tagName, toolcacheCliVersion } of [
    {
        isCached: true,
        tagName: "codeql-bundle-20230101",
        toolcacheCliVersion: SAMPLE_DEFAULT_CLI_VERSION.cliVersion,
    },
    {
        isCached: true,
        // By leaving toolcacheCliVersion undefined, the bundle will be installed
        // into the toolcache as `${SAMPLE_DEFAULT_CLI_VERSION.cliVersion}-20230101`.
        // This lets us test that `x.y.z-yyyymmdd` toolcache versions are used if an
        // `x.y.z` version isn't in the toolcache.
        tagName: `codeql-bundle-${SAMPLE_DEFAULT_CLI_VERSION.cliVersion}-20230101`,
    },
    {
        isCached: false,
        tagName: "codeql-bundle-20230101",
    },
]) {
    (0, ava_1.default)(`uses default version on Dotcom when default version bundle ${tagName} is ${isCached ? "" : "not "}cached`, async (t) => {
        await util.withTmpDir(async (tmpDir) => {
            (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
            if (isCached) {
                await installIntoToolcache({
                    cliVersion: toolcacheCliVersion,
                    tagName,
                    isPinned: true,
                    tmpDir,
                });
            }
            else {
                mockDownloadApi({
                    tagName,
                });
                sinon.stub(api, "getApiClient").value(() => ({
                    repos: {
                        listReleases: sinon.stub().resolves(undefined),
                    },
                    paginate: sinon.stub().resolves([
                        {
                            assets: [
                                {
                                    name: "cli-version-2.0.0.txt",
                                },
                            ],
                            tag_name: tagName,
                        },
                    ]),
                }));
            }
            const result = await codeql.setupCodeQL(undefined, sampleApiDetails, tmpDir, util.GitHubVariant.DOTCOM, false, SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), false);
            t.is(result.toolsVersion, SAMPLE_DEFAULT_CLI_VERSION.cliVersion);
        });
    });
}
for (const variant of [util.GitHubVariant.GHAE, util.GitHubVariant.GHES]) {
    (0, ava_1.default)(`uses a cached bundle when no tools input is given on ${util.GitHubVariant[variant]}`, async (t) => {
        await util.withTmpDir(async (tmpDir) => {
            (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
            await installIntoToolcache({
                tagName: "codeql-bundle-20200601",
                isPinned: true,
                tmpDir,
            });
            const result = await codeql.setupCodeQL(undefined, sampleApiDetails, tmpDir, variant, false, {
                cliVersion: defaults.cliVersion,
                tagName: defaults.bundleVersion,
                variant,
            }, (0, logging_1.getRunnerLogger)(true), false);
            t.deepEqual(result.toolsVersion, "0.0.0-20200601");
            const cachedVersions = toolcache.findAllVersions("CodeQL");
            t.is(cachedVersions.length, 1);
        });
    });
    (0, ava_1.default)(`downloads bundle if only an unpinned version is cached on ${util.GitHubVariant[variant]}`, async (t) => {
        await util.withTmpDir(async (tmpDir) => {
            (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
            await installIntoToolcache({
                tagName: "codeql-bundle-20200601",
                isPinned: false,
                tmpDir,
            });
            mockDownloadApi({
                tagName: defaults.bundleVersion,
            });
            const result = await codeql.setupCodeQL(undefined, sampleApiDetails, tmpDir, variant, false, {
                cliVersion: defaults.cliVersion,
                tagName: defaults.bundleVersion,
                variant,
            }, (0, logging_1.getRunnerLogger)(true), false);
            t.deepEqual(result.toolsVersion, defaults.cliVersion);
            const cachedVersions = toolcache.findAllVersions("CodeQL");
            t.is(cachedVersions.length, 2);
        });
    });
}
(0, ava_1.default)('downloads bundle if "latest" tools specified but not cached', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        await installIntoToolcache({
            tagName: "codeql-bundle-20200601",
            isPinned: true,
            tmpDir,
        });
        mockDownloadApi({
            tagName: defaults.bundleVersion,
        });
        const result = await codeql.setupCodeQL("latest", sampleApiDetails, tmpDir, util.GitHubVariant.DOTCOM, false, SAMPLE_DEFAULT_CLI_VERSION, (0, logging_1.getRunnerLogger)(true), false);
        t.deepEqual(result.toolsVersion, defaults.cliVersion);
        const cachedVersions = toolcache.findAllVersions("CodeQL");
        t.is(cachedVersions.length, 2);
    });
});
(0, ava_1.default)("download codeql bundle from github ae endpoint", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        (0, testing_utils_1.setupActionsVars)(tmpDir, tmpDir);
        const bundleAssetID = 10;
        const platform = process.platform === "win32"
            ? "win64"
            : process.platform === "linux"
                ? "linux64"
                : "osx64";
        const codeQLBundleName = `codeql-bundle-${platform}.tar.gz`;
        (0, nock_1.default)("https://example.githubenterprise.com")
            .get(`/api/v3/enterprise/code-scanning/codeql-bundle/find/${defaults.bundleVersion}`)
            .reply(200, {
            assets: { [codeQLBundleName]: bundleAssetID },
        });
        (0, nock_1.default)("https://example.githubenterprise.com")
            .get(`/api/v3/enterprise/code-scanning/codeql-bundle/download/${bundleAssetID}`)
            .reply(200, {
            url: `https://example.githubenterprise.com/github/codeql-action/releases/download/${defaults.bundleVersion}/${codeQLBundleName}`,
        });
        (0, nock_1.default)("https://example.githubenterprise.com")
            .get(`/github/codeql-action/releases/download/${defaults.bundleVersion}/${codeQLBundleName}`)
            .replyWithFile(200, path_1.default.join(__dirname, `/../src/testdata/codeql-bundle-pinned.tar.gz`));
        mockApiDetails(sampleGHAEApiDetails);
        sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
        process.env["GITHUB_ACTION_REPOSITORY"] = "github/codeql-action";
        await codeql.setupCodeQL(undefined, sampleGHAEApiDetails, tmpDir, util.GitHubVariant.GHAE, false, {
            cliVersion: defaults.cliVersion,
            tagName: defaults.bundleVersion,
            variant: util.GitHubVariant.GHAE,
        }, (0, logging_1.getRunnerLogger)(true), false);
        const cachedVersions = toolcache.findAllVersions("CodeQL");
        t.is(cachedVersions.length, 1);
    });
});
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
(0, ava_1.default)("databaseInterpretResults() does not set --sarif-add-query-help for 2.7.0", async (t) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves("2.7.0");
    // safeWhich throws because of the test CodeQL object.
    sinon.stub(safeWhich, "safeWhich").resolves("");
    await codeqlObject.databaseInterpretResults("", [], "", "", "", "-v", "");
    t.false(runnerConstructorStub.firstCall.args[1].includes("--sarif-add-query-help"), "--sarif-add-query-help should be absent, but it is present");
});
(0, ava_1.default)("databaseInterpretResults() sets --sarif-add-query-help for 2.7.1", async (t) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves("2.7.1");
    // safeWhich throws because of the test CodeQL object.
    sinon.stub(safeWhich, "safeWhich").resolves("");
    await codeqlObject.databaseInterpretResults("", [], "", "", "", "-v", "");
    t.true(runnerConstructorStub.firstCall.args[1].includes("--sarif-add-query-help"), "--sarif-add-query-help should be present, but it is absent");
});
(0, ava_1.default)("databaseInitCluster() without injected codescanning config", async (t) => {
    await util.withTmpDir(async (tempDir) => {
        const runnerConstructorStub = stubToolRunnerConstructor();
        const codeqlObject = await codeql.getCodeQLForTesting();
        sinon.stub(codeqlObject, "getVersion").resolves("2.8.1");
        // safeWhich throws because of the test CodeQL object.
        sinon.stub(safeWhich, "safeWhich").resolves("");
        const thisStubConfig = {
            ...stubConfig,
            tempDir,
            augmentationProperties: {
                injectedMlQueries: false,
                queriesInputCombines: false,
                packsInputCombines: false,
            },
        };
        await codeqlObject.databaseInitCluster(thisStubConfig, "", undefined, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        const args = runnerConstructorStub.firstCall.args[1];
        // should NOT have used an config file
        const configArg = args.find((arg) => arg.startsWith("--codescanning-config="));
        t.falsy(configArg, "Should have injected a codescanning config");
    });
});
// Test macro for ensuring different variants of injected augmented configurations
const injectedConfigMacro = ava_1.default.macro({
    exec: async (t, augmentationProperties, configOverride, expectedConfig) => {
        await util.withTmpDir(async (tempDir) => {
            const runnerConstructorStub = stubToolRunnerConstructor();
            const codeqlObject = await codeql.getCodeQLForTesting();
            sinon
                .stub(codeqlObject, "getVersion")
                .resolves(feature_flags_1.featureConfig[feature_flags_1.Feature.CliConfigFileEnabled].minimumVersion);
            const thisStubConfig = {
                ...stubConfig,
                ...configOverride,
                tempDir,
                augmentationProperties,
            };
            await codeqlObject.databaseInitCluster(thisStubConfig, "", undefined, (0, testing_utils_1.createFeatures)([feature_flags_1.Feature.CliConfigFileEnabled]), (0, logging_1.getRunnerLogger)(true));
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
    injectedMlQueries: false,
    queriesInputCombines: false,
    packsInputCombines: false,
}, {}, {});
(0, ava_1.default)("injected ML queries", injectedConfigMacro, {
    injectedMlQueries: true,
    queriesInputCombines: false,
    packsInputCombines: false,
}, {}, {
    packs: ["codeql/javascript-experimental-atm-queries@~0.4.0"],
});
(0, ava_1.default)("injected ML queries with existing packs", injectedConfigMacro, {
    injectedMlQueries: true,
    queriesInputCombines: false,
    packsInputCombines: false,
}, {
    originalUserInput: {
        packs: { javascript: ["codeql/something-else"] },
    },
}, {
    packs: {
        javascript: [
            "codeql/something-else",
            "codeql/javascript-experimental-atm-queries@~0.4.0",
        ],
    },
});
(0, ava_1.default)("injected ML queries with existing packs of different language", injectedConfigMacro, {
    injectedMlQueries: true,
    queriesInputCombines: false,
    packsInputCombines: false,
}, {
    originalUserInput: {
        packs: { cpp: ["codeql/something-else"] },
    },
}, {
    packs: {
        cpp: ["codeql/something-else"],
        javascript: ["codeql/javascript-experimental-atm-queries@~0.4.0"],
    },
});
(0, ava_1.default)("injected packs from input", injectedConfigMacro, {
    injectedMlQueries: false,
    queriesInputCombines: false,
    packsInputCombines: false,
    packsInput: ["xxx", "yyy"],
}, {}, {
    packs: ["xxx", "yyy"],
});
(0, ava_1.default)("injected packs from input with existing packs combines", injectedConfigMacro, {
    injectedMlQueries: false,
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
    injectedMlQueries: false,
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
(0, ava_1.default)("injected packs from input with existing packs overrides and ML model inject", injectedConfigMacro, {
    injectedMlQueries: true,
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
    packs: ["xxx", "yyy", "codeql/javascript-experimental-atm-queries@~0.4.0"],
});
// similar, but with queries
(0, ava_1.default)("injected queries from input", injectedConfigMacro, {
    injectedMlQueries: false,
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
    injectedMlQueries: false,
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
    injectedMlQueries: false,
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
    injectedMlQueries: false,
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
    injectedMlQueries: false,
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
(0, ava_1.default)("does not use injected config", async (t) => {
    const origCODEQL_PASS_CONFIG_TO_CLI = process.env.CODEQL_PASS_CONFIG_TO_CLI;
    process.env["CODEQL_PASS_CONFIG_TO_CLI"] = "false";
    try {
        const runnerConstructorStub = stubToolRunnerConstructor();
        const codeqlObject = await codeql.getCodeQLForTesting();
        sinon
            .stub(codeqlObject, "getVersion")
            .resolves(feature_flags_1.featureConfig[feature_flags_1.Feature.CliConfigFileEnabled].minimumVersion);
        await codeqlObject.databaseInitCluster(stubConfig, "", undefined, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        const args = runnerConstructorStub.firstCall.args[1];
        // should have used an config file
        const configArg = args.find((arg) => arg.startsWith("--codescanning-config="));
        t.falsy(configArg, "Should NOT have injected a codescanning config");
    }
    finally {
        process.env["CODEQL_PASS_CONFIG_TO_CLI"] = origCODEQL_PASS_CONFIG_TO_CLI;
    }
});
(0, ava_1.default)("databaseInterpretResults() sets --sarif-add-baseline-file-info for 2.11.3", async (t) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves("2.11.3");
    // safeWhich throws because of the test CodeQL object.
    sinon.stub(safeWhich, "safeWhich").resolves("");
    await codeqlObject.databaseInterpretResults("", [], "", "", "", "-v", "");
    t.true(runnerConstructorStub.firstCall.args[1].includes("--sarif-add-baseline-file-info"), "--sarif-add-baseline-file-info should be present, but it is absent");
});
(0, ava_1.default)("databaseInterpretResults() does not set --sarif-add-baseline-file-info for 2.11.2", async (t) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves("2.11.2");
    // safeWhich throws because of the test CodeQL object.
    sinon.stub(safeWhich, "safeWhich").resolves("");
    await codeqlObject.databaseInterpretResults("", [], "", "", "", "-v", "");
    t.false(runnerConstructorStub.firstCall.args[1].includes("--sarif-add-baseline-file-info"), "--sarif-add-baseline-file-info must be absent, but it is present");
});
function stubToolRunnerConstructor() {
    const runnerObjectStub = sinon.createStubInstance(toolrunner.ToolRunner);
    runnerObjectStub.exec.resolves(0);
    const runnerConstructorStub = sinon.stub(toolrunner, "ToolRunner");
    runnerConstructorStub.returns(runnerObjectStub);
    return runnerConstructorStub;
}
exports.stubToolRunnerConstructor = stubToolRunnerConstructor;
//# sourceMappingURL=codeql.test.js.map