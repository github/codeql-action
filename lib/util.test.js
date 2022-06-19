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
const stream = __importStar(require("stream"));
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const api = __importStar(require("./api-client"));
const logging_1 = require("./logging");
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
    });
    t.deepEqual(util.GitHubVariant.DOTCOM, v.type);
    mockGetMetaVersionHeader("2.0");
    const v2 = await util.getGitHubVersion({
        auth: "",
        url: "https://ghe.example.com",
    });
    t.deepEqual({ type: util.GitHubVariant.GHES, version: "2.0" }, v2);
    mockGetMetaVersionHeader("GitHub AE");
    const ghae = await util.getGitHubVersion({
        auth: "",
        url: "https://example.githubenterprise.com",
    });
    t.deepEqual({ type: util.GitHubVariant.GHAE }, ghae);
    mockGetMetaVersionHeader(undefined);
    const v3 = await util.getGitHubVersion({
        auth: "",
        url: "https://ghe.example.com",
    });
    t.deepEqual({ type: util.GitHubVariant.DOTCOM }, v3);
});
(0, ava_1.default)("getGitHubAuth", async (t) => {
    const msgs = [];
    const mockLogger = {
        warning: (msg) => msgs.push(msg),
    };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    t.throwsAsync(async () => util.getGitHubAuth(mockLogger, "abc", true));
    process.env.GITHUB_TOKEN = "123";
    t.is("123", await util.getGitHubAuth(mockLogger, undefined, undefined));
    t.is(msgs.length, 0);
    t.is("abc", await util.getGitHubAuth(mockLogger, "abc", undefined));
    t.is(msgs.length, 1); // warning expected
    msgs.length = 0;
    await mockStdInForAuth(t, mockLogger, "def", "def");
    await mockStdInForAuth(t, mockLogger, "def", "", "def");
    await mockStdInForAuth(t, mockLogger, "def", "def\n some extra garbage", "ghi");
    await mockStdInForAuth(t, mockLogger, "defghi", "def", "ghi\n123");
    await mockStdInForAuthExpectError(t, mockLogger, "");
    await mockStdInForAuthExpectError(t, mockLogger, "", " ", "abc");
    await mockStdInForAuthExpectError(t, mockLogger, "  def\n some extra garbage", "ghi");
    t.is(msgs.length, 0);
});
async function mockStdInForAuth(t, mockLogger, expected, ...text) {
    const stdin = stream.Readable.from(text);
    t.is(expected, await util.getGitHubAuth(mockLogger, undefined, true, stdin));
}
async function mockStdInForAuthExpectError(t, mockLogger, ...text) {
    const stdin = stream.Readable.from(text);
    await t.throwsAsync(async () => util.getGitHubAuth(mockLogger, undefined, true, stdin));
}
const ML_POWERED_JS_STATUS_TESTS = [
    // If no packs are loaded, status is false.
    [[], "false"],
    // If another pack is loaded but not the ML-powered query pack, status is false.
    [["someOtherPack"], "false"],
    // If the ML-powered query pack is loaded with a specific version, status is that version.
    [[`${util.ML_POWERED_JS_QUERIES_PACK_NAME}@~0.1.0`], "~0.1.0"],
    // If the ML-powered query pack is loaded with a specific version and another pack is loaded, the
    // status is the version of the ML-powered query pack.
    [
        ["someOtherPack", `${util.ML_POWERED_JS_QUERIES_PACK_NAME}@~0.1.0`],
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
    [["someOtherPack", util.ML_POWERED_JS_QUERIES_PACK_NAME], "latest"],
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
                toolCacheDir: tmpDir,
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
            };
            t.is(util.getMlPoweredJsQueriesStatus(config), expectedStatus);
        });
    });
}
(0, ava_1.default)("isGitHubGhesVersionBelow", async (t) => {
    t.falsy(util.isGitHubGhesVersionBelow({ type: util.GitHubVariant.DOTCOM }, "3.2.0"));
    t.falsy(util.isGitHubGhesVersionBelow({ type: util.GitHubVariant.GHAE }, "3.2.0"));
    t.falsy(util.isGitHubGhesVersionBelow({ type: util.GitHubVariant.GHES, version: "3.3.0" }, "3.2.0"));
    t.falsy(util.isGitHubGhesVersionBelow({ type: util.GitHubVariant.GHES, version: "3.2.0" }, "3.2.0"));
    t.true(util.isGitHubGhesVersionBelow({ type: util.GitHubVariant.GHES, version: "3.1.2" }, "3.2.0"));
});
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
    ["1.2.1", { type: util.GitHubVariant.GHES, version: "3.3" }, false],
    ["1.2.1", { type: util.GitHubVariant.GHES, version: "3.4" }, true],
    ["1.2.1", { type: util.GitHubVariant.GHES, version: "3.5" }, true],
    ["2.2.1", { type: util.GitHubVariant.DOTCOM }, false],
    ["2.2.1", { type: util.GitHubVariant.GHAE }, false],
    ["2.2.1", { type: util.GitHubVariant.GHES, version: "3.3" }, false],
    ["2.2.1", { type: util.GitHubVariant.GHES, version: "3.4" }, false],
    ["2.2.1", { type: util.GitHubVariant.GHES, version: "3.5" }, false],
];
for (const [version, githubVersion, shouldReportWarning,] of CHECK_ACTION_VERSION_TESTS) {
    const reportWarningDescription = shouldReportWarning
        ? "reports warning"
        : "doesn't report warning";
    const versionsDescription = `CodeQL Action version ${version} and GitHub version ${formatGitHubVersion(githubVersion)}`;
    (0, ava_1.default)(`checkActionVersion ${reportWarningDescription} for ${versionsDescription}`, async (t) => {
        const warningSpy = sinon.spy(core, "warning");
        const versionStub = sinon
            .stub(api, "getGitHubVersionActionsOnly")
            .resolves(githubVersion);
        const isActionsStub = sinon.stub(util, "isActions").returns(true);
        await util.checkActionVersion(version);
        if (shouldReportWarning) {
            t.true(warningSpy.calledOnceWithExactly(sinon.match("CodeQL Action v1 will be deprecated")));
        }
        else {
            t.false(warningSpy.called);
        }
        versionStub.restore();
        isActionsStub.restore();
    });
}
//# sourceMappingURL=util.test.js.map