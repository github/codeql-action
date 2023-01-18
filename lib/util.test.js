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
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path_1 = __importDefault(require("path"));
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const api = __importStar(require("./api-client"));
const feature_flags_1 = require("./feature-flags");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("getToolNames", (t) => {
    const input = fs.readFileSync(`${__dirname}/../src/testdata/tool-names.sarif`, "utf8");
    const toolNames = util.getToolNames(JSON.parse(input));
    t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});
(0, ava_1.default)("getMemoryFlag() should return the correct --ram flag", (t) => {
    const totalMem = Math.floor(os.totalmem() / (1024 * 1024));
    const expectedThreshold = process.platform === "win32" ? 1536 : 1024;
    const tests = [
        [undefined, `--ram=${totalMem - expectedThreshold}`],
        ["", `--ram=${totalMem - expectedThreshold}`],
        ["512", "--ram=512"],
    ];
    for (const [input, expectedFlag] of tests) {
        const flag = util.getMemoryFlag(input);
        t.deepEqual(flag, expectedFlag);
    }
});
(0, ava_1.default)("getMemoryFlag() throws if the ram input is < 0 or NaN", (t) => {
    for (const input of ["-1", "hello!"]) {
        t.throws(() => util.getMemoryFlag(input));
    }
});
(0, ava_1.default)("getAddSnippetsFlag() should return the correct flag", (t) => {
    t.deepEqual(util.getAddSnippetsFlag(true), "--sarif-add-snippets");
    t.deepEqual(util.getAddSnippetsFlag("true"), "--sarif-add-snippets");
    t.deepEqual(util.getAddSnippetsFlag(false), "--no-sarif-add-snippets");
    t.deepEqual(util.getAddSnippetsFlag(undefined), "--no-sarif-add-snippets");
    t.deepEqual(util.getAddSnippetsFlag("false"), "--no-sarif-add-snippets");
    t.deepEqual(util.getAddSnippetsFlag("foo bar"), "--no-sarif-add-snippets");
});
(0, ava_1.default)("getThreadsFlag() should return the correct --threads flag", (t) => {
    const numCpus = os.cpus().length;
    const tests = [
        ["0", "--threads=0"],
        ["1", "--threads=1"],
        [undefined, `--threads=${numCpus}`],
        ["", `--threads=${numCpus}`],
        [`${numCpus + 1}`, `--threads=${numCpus}`],
        [`${-numCpus - 1}`, `--threads=${-numCpus}`],
    ];
    for (const [input, expectedFlag] of tests) {
        const flag = util.getThreadsFlag(input, (0, logging_1.getRunnerLogger)(true));
        t.deepEqual(flag, expectedFlag);
    }
});
(0, ava_1.default)("getThreadsFlag() throws if the threads input is not an integer", (t) => {
    t.throws(() => util.getThreadsFlag("hello!", (0, logging_1.getRunnerLogger)(true)));
});
(0, ava_1.default)("getExtraOptionsEnvParam() succeeds on valid JSON with invalid options (for now)", (t) => {
    const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;
    const options = { foo: 42 };
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = JSON.stringify(options);
    t.deepEqual(util.getExtraOptionsEnvParam(), options);
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});
(0, ava_1.default)("getExtraOptionsEnvParam() succeeds on valid options", (t) => {
    const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;
    const options = { database: { init: ["--debug"] } };
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = JSON.stringify(options);
    t.deepEqual(util.getExtraOptionsEnvParam(), options);
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});
(0, ava_1.default)("getExtraOptionsEnvParam() fails on invalid JSON", (t) => {
    const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = "{{invalid-json}}";
    t.throws(util.getExtraOptionsEnvParam);
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});
(0, ava_1.default)("parseGitHubUrl", (t) => {
    t.deepEqual(util.parseGitHubUrl("github.com"), "https://github.com");
    t.deepEqual(util.parseGitHubUrl("https://github.com"), "https://github.com");
    t.deepEqual(util.parseGitHubUrl("https://api.github.com"), "https://github.com");
    t.deepEqual(util.parseGitHubUrl("https://github.com/foo/bar"), "https://github.com");
    t.deepEqual(util.parseGitHubUrl("github.example.com"), "https://github.example.com/");
    t.deepEqual(util.parseGitHubUrl("https://github.example.com"), "https://github.example.com/");
    t.deepEqual(util.parseGitHubUrl("https://api.github.example.com"), "https://github.example.com/");
    t.deepEqual(util.parseGitHubUrl("https://github.example.com/api/v3"), "https://github.example.com/");
    t.deepEqual(util.parseGitHubUrl("https://github.example.com:1234"), "https://github.example.com:1234/");
    t.deepEqual(util.parseGitHubUrl("https://api.github.example.com:1234"), "https://github.example.com:1234/");
    t.deepEqual(util.parseGitHubUrl("https://github.example.com:1234/api/v3"), "https://github.example.com:1234/");
    t.deepEqual(util.parseGitHubUrl("https://github.example.com/base/path"), "https://github.example.com/base/path/");
    t.deepEqual(util.parseGitHubUrl("https://github.example.com/base/path/api/v3"), "https://github.example.com/base/path/");
    t.throws(() => util.parseGitHubUrl(""), {
        message: '"" is not a valid URL',
    });
    t.throws(() => util.parseGitHubUrl("ssh://github.com"), {
        message: '"ssh://github.com" is not a http or https URL',
    });
    t.throws(() => util.parseGitHubUrl("http:///::::433"), {
        message: '"http:///::::433" is not a valid URL',
    });
});
(0, ava_1.default)("allowed API versions", async (t) => {
    t.is(util.apiVersionInRange("1.33.0", "1.33", "2.0"), undefined);
    t.is(util.apiVersionInRange("1.33.1", "1.33", "2.0"), undefined);
    t.is(util.apiVersionInRange("1.34.0", "1.33", "2.0"), undefined);
    t.is(util.apiVersionInRange("2.0.0", "1.33", "2.0"), undefined);
    t.is(util.apiVersionInRange("2.0.1", "1.33", "2.0"), undefined);
    t.is(util.apiVersionInRange("1.32.0", "1.33", "2.0"), util.DisallowedAPIVersionReason.ACTION_TOO_NEW);
    t.is(util.apiVersionInRange("2.1.0", "1.33", "2.0"), util.DisallowedAPIVersionReason.ACTION_TOO_OLD);
});
function mockGetMetaVersionHeader(versionHeader) {
    // Passing an auth token is required, so we just use a dummy value
    const client = github.getOctokit("123");
    const response = {
        headers: {
            "x-github-enterprise-version": versionHeader,
        },
    };
    const spyGetContents = sinon
        .stub(client.meta, "get")
        .resolves(response);
    sinon.stub(api, "getApiClient").value(() => client);
    return spyGetContents;
}
(0, ava_1.default)("getGitHubVersion", async (t) => {
    const v = await util.getGitHubVersion({
        auth: "",
        url: "https://github.com",
        apiURL: undefined,
    });
    t.deepEqual(util.GitHubVariant.DOTCOM, v.type);
    mockGetMetaVersionHeader("2.0");
    const v2 = await util.getGitHubVersion({
        auth: "",
        url: "https://ghe.example.com",
        apiURL: undefined,
    });
    t.deepEqual({ type: util.GitHubVariant.GHES, version: "2.0" }, v2);
    mockGetMetaVersionHeader("GitHub AE");
    const ghae = await util.getGitHubVersion({
        auth: "",
        url: "https://example.githubenterprise.com",
        apiURL: undefined,
    });
    t.deepEqual({ type: util.GitHubVariant.GHAE }, ghae);
    mockGetMetaVersionHeader(undefined);
    const v3 = await util.getGitHubVersion({
        auth: "",
        url: "https://ghe.example.com",
        apiURL: undefined,
    });
    t.deepEqual({ type: util.GitHubVariant.DOTCOM }, v3);
});
const ML_POWERED_JS_STATUS_TESTS = [
    // If no packs are loaded, status is false.
    [[], "false"],
    // If another pack is loaded but not the ML-powered query pack, status is false.
    [["some-other/pack"], "false"],
    // If the ML-powered query pack is loaded with a specific version, status is that version.
    [[`${util.ML_POWERED_JS_QUERIES_PACK_NAME}@~0.1.0`], "~0.1.0"],
    // If the ML-powered query pack is loaded with a specific version and another pack is loaded, the
    // status is the version of the ML-powered query pack.
    [
        ["some-other/pack", `${util.ML_POWERED_JS_QUERIES_PACK_NAME}@~0.1.0`],
        "~0.1.0",
    ],
    // If the ML-powered query pack is loaded without a version, the status is "latest".
    [[util.ML_POWERED_JS_QUERIES_PACK_NAME], "latest"],
    // If the ML-powered query pack is loaded with two different versions, the status is "other".
    [
        [
            `${util.ML_POWERED_JS_QUERIES_PACK_NAME}@~0.0.1`,
            `${util.ML_POWERED_JS_QUERIES_PACK_NAME}@~0.0.2`,
        ],
        "other",
    ],
    // If the ML-powered query pack is loaded with no specific version, and another pack is loaded,
    // the status is "latest".
    [["some-other/pack", util.ML_POWERED_JS_QUERIES_PACK_NAME], "latest"],
];
for (const [packs, expectedStatus] of ML_POWERED_JS_STATUS_TESTS) {
    const packDescriptions = `[${packs
        .map((pack) => JSON.stringify(pack))
        .join(", ")}]`;
    (0, ava_1.default)(`ML-powered JS queries status report is "${expectedStatus}" for packs = ${packDescriptions}`, (t) => {
        return util.withTmpDir(async (tmpDir) => {
            const config = {
                languages: [],
                queries: {},
                paths: [],
                pathsIgnore: [],
                originalUserInput: {},
                tempDir: tmpDir,
                codeQLCmd: "",
                gitHubVersion: {
                    type: util.GitHubVariant.DOTCOM,
                },
                dbLocation: "",
                packs: {
                    javascript: packs,
                },
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
            t.is(util.getMlPoweredJsQueriesStatus(config), expectedStatus);
        });
    });
}
function formatGitHubVersion(version) {
    switch (version.type) {
        case util.GitHubVariant.DOTCOM:
            return "dotcom";
        case util.GitHubVariant.GHAE:
            return "GHAE";
        case util.GitHubVariant.GHES:
            return `GHES ${version.version}`;
        default:
            util.assertNever(version);
    }
}
const CHECK_ACTION_VERSION_TESTS = [
    ["1.2.1", { type: util.GitHubVariant.DOTCOM }, true],
    ["1.2.1", { type: util.GitHubVariant.GHAE }, true],
    ["1.2.1", { type: util.GitHubVariant.GHES, version: "3.3" }, true],
    ["1.2.1", { type: util.GitHubVariant.GHES, version: "3.4" }, true],
    ["1.2.1", { type: util.GitHubVariant.GHES, version: "3.5" }, true],
    ["2.2.1", { type: util.GitHubVariant.DOTCOM }, false],
    ["2.2.1", { type: util.GitHubVariant.GHAE }, false],
    ["2.2.1", { type: util.GitHubVariant.GHES, version: "3.3" }, false],
    ["2.2.1", { type: util.GitHubVariant.GHES, version: "3.4" }, false],
    ["2.2.1", { type: util.GitHubVariant.GHES, version: "3.5" }, false],
];
for (const [version, githubVersion, shouldReportError,] of CHECK_ACTION_VERSION_TESTS) {
    const reportErrorDescription = shouldReportError
        ? "reports error"
        : "doesn't report error";
    const versionsDescription = `CodeQL Action version ${version} and GitHub version ${formatGitHubVersion(githubVersion)}`;
    (0, ava_1.default)(`checkActionVersion ${reportErrorDescription} for ${versionsDescription}`, async (t) => {
        const errorSpy = sinon.spy(core, "error");
        const versionStub = sinon
            .stub(api, "getGitHubVersion")
            .resolves(githubVersion);
        await util.checkActionVersion(version);
        if (shouldReportError) {
            t.true(errorSpy.calledOnceWithExactly(sinon.match("This version of the CodeQL Action was deprecated on January 18th, 2023")));
        }
        else {
            t.false(errorSpy.called);
        }
        versionStub.restore();
    });
}
(0, ava_1.default)("doesDirectoryExist", async (t) => {
    // Returns false if no file/dir of this name exists
    t.false(util.doesDirectoryExist("non-existent-file.txt"));
    await util.withTmpDir(async (tmpDir) => {
        // Returns false if file
        const testFile = `${tmpDir}/test-file.txt`;
        fs.writeFileSync(testFile, "");
        t.false(util.doesDirectoryExist(testFile));
        // Returns true if directory
        fs.writeFileSync(`${tmpDir}/nested-test-file.txt`, "");
        t.true(util.doesDirectoryExist(tmpDir));
    });
});
(0, ava_1.default)("listFolder", async (t) => {
    // Returns empty if not a directory
    t.deepEqual(util.listFolder("not-a-directory"), []);
    // Returns empty if directory is empty
    await util.withTmpDir(async (emptyTmpDir) => {
        t.deepEqual(util.listFolder(emptyTmpDir), []);
    });
    // Returns all file names in directory
    await util.withTmpDir(async (tmpDir) => {
        const nestedDir = fs.mkdtempSync(path_1.default.join(tmpDir, "nested-"));
        fs.writeFileSync(path_1.default.resolve(nestedDir, "nested-test-file.txt"), "");
        fs.writeFileSync(path_1.default.resolve(tmpDir, "test-file-1.txt"), "");
        fs.writeFileSync(path_1.default.resolve(tmpDir, "test-file-2.txt"), "");
        fs.writeFileSync(path_1.default.resolve(tmpDir, "test-file-3.txt"), "");
        t.deepEqual(util.listFolder(tmpDir), [
            path_1.default.resolve(nestedDir, "nested-test-file.txt"),
            path_1.default.resolve(tmpDir, "test-file-1.txt"),
            path_1.default.resolve(tmpDir, "test-file-2.txt"),
            path_1.default.resolve(tmpDir, "test-file-3.txt"),
        ]);
    });
});
const longTime = 999999;
const shortTime = 10;
(0, ava_1.default)("withTimeout on long task", async (t) => {
    let longTaskTimedOut = false;
    const longTask = new Promise((resolve) => {
        setTimeout(() => {
            resolve(42);
        }, longTime);
    });
    const result = await util.withTimeout(shortTime, longTask, () => {
        longTaskTimedOut = true;
    });
    t.deepEqual(longTaskTimedOut, true);
    t.deepEqual(result, undefined);
});
(0, ava_1.default)("withTimeout on short task", async (t) => {
    let shortTaskTimedOut = false;
    const shortTask = new Promise((resolve) => {
        setTimeout(() => {
            resolve(99);
        }, shortTime);
    });
    const result = await util.withTimeout(longTime, shortTask, () => {
        shortTaskTimedOut = true;
    });
    t.deepEqual(shortTaskTimedOut, false);
    t.deepEqual(result, 99);
});
(0, ava_1.default)("withTimeout doesn't call callback if promise resolves", async (t) => {
    let shortTaskTimedOut = false;
    const shortTask = new Promise((resolve) => {
        setTimeout(() => {
            resolve(99);
        }, shortTime);
    });
    const result = await util.withTimeout(100, shortTask, () => {
        shortTaskTimedOut = true;
    });
    await new Promise((r) => setTimeout(r, 200));
    t.deepEqual(shortTaskTimedOut, false);
    t.deepEqual(result, 99);
});
const mockRepositoryNwo = (0, repository_1.parseRepositoryNwo)("owner/repo");
// eslint-disable-next-line github/array-foreach
[
    {
        name: "disabled",
        features: [],
        hasCustomCodeQL: false,
        languagesInput: undefined,
        languagesInRepository: [],
        expected: false,
        expectedApiCall: false,
    },
    {
        name: "disabled even though swift kotlin bypassed",
        features: [feature_flags_1.Feature.BypassToolcacheKotlinSwiftEnabled],
        hasCustomCodeQL: false,
        languagesInput: undefined,
        languagesInRepository: [],
        expected: false,
        expectedApiCall: true,
    },
    {
        name: "disabled even though swift kotlin analyzed",
        features: [],
        hasCustomCodeQL: false,
        languagesInput: " sWiFt , KoTlIn ",
        languagesInRepository: [],
        expected: false,
        expectedApiCall: false,
    },
    {
        name: "toolcache bypass all",
        features: [feature_flags_1.Feature.BypassToolcacheEnabled],
        hasCustomCodeQL: false,
        languagesInput: undefined,
        languagesInRepository: [],
        expected: true,
        expectedApiCall: false,
    },
    {
        name: "custom CodeQL",
        features: [],
        hasCustomCodeQL: true,
        languagesInput: undefined,
        languagesInRepository: [],
        expected: true,
        expectedApiCall: false,
    },
    {
        name: "bypass swift",
        features: [feature_flags_1.Feature.BypassToolcacheKotlinSwiftEnabled],
        hasCustomCodeQL: false,
        languagesInput: " sWiFt ,other",
        languagesInRepository: [],
        expected: true,
        expectedApiCall: false,
    },
    {
        name: "bypass kotlin",
        features: [feature_flags_1.Feature.BypassToolcacheKotlinSwiftEnabled],
        hasCustomCodeQL: false,
        languagesInput: "other, KoTlIn ",
        languagesInRepository: [],
        expected: true,
        expectedApiCall: false,
    },
    {
        name: "bypass kotlin language from repository",
        features: [feature_flags_1.Feature.BypassToolcacheKotlinSwiftEnabled],
        hasCustomCodeQL: false,
        languagesInput: "",
        languagesInRepository: ["KoTlIn", "other"],
        expected: true,
        expectedApiCall: true,
    },
    {
        name: "bypass swift language from repository",
        features: [feature_flags_1.Feature.BypassToolcacheKotlinSwiftEnabled],
        hasCustomCodeQL: false,
        languagesInput: "",
        languagesInRepository: ["SwiFt", "other"],
        expected: true,
        expectedApiCall: true,
    },
    {
        name: "bypass java from input if there is kotlin in repository",
        features: [feature_flags_1.Feature.BypassToolcacheKotlinSwiftEnabled],
        hasCustomCodeQL: false,
        languagesInput: "java",
        languagesInRepository: ["kotlin", "other"],
        expected: true,
        expectedApiCall: true,
    },
    {
        name: "don't bypass java from input if there is no kotlin in repository",
        features: [feature_flags_1.Feature.BypassToolcacheKotlinSwiftEnabled],
        hasCustomCodeQL: false,
        languagesInput: "java",
        languagesInRepository: ["java", "other"],
        expected: false,
        expectedApiCall: true,
    },
].forEach((args) => {
    (0, ava_1.default)(`shouldBypassToolcache: ${args.name}`, async (t) => {
        const mockRequest = (0, testing_utils_1.mockLanguagesInRepo)(args.languagesInRepository);
        const mockLogger = (0, logging_1.getRunnerLogger)(true);
        const featureEnablement = (0, testing_utils_1.createFeatures)(args.features);
        const codeqlUrl = args.hasCustomCodeQL ? "custom-codeql-url" : undefined;
        const actual = await util.shouldBypassToolcache(featureEnablement, codeqlUrl, args.languagesInput, mockRepositoryNwo, mockLogger);
        t.deepEqual(actual, args.expected);
        t.deepEqual(mockRequest.called, args.expectedApiCall);
    });
});
//# sourceMappingURL=util.test.js.map