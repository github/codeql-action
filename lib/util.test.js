"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const github = __importStar(require("@actions/github"));
const ava_1 = __importDefault(require("ava"));
const sinon_1 = __importDefault(require("sinon"));
const api = __importStar(require("./api-client"));
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
testing_utils_1.setupTests(ava_1.default);
ava_1.default("getToolNames", (t) => {
    const input = fs.readFileSync(`${__dirname}/../src/testdata/tool-names.sarif`, "utf8");
    const toolNames = util.getToolNames(input);
    t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});
ava_1.default("getMemoryFlag() should return the correct --ram flag", (t) => {
    const totalMem = Math.floor(os.totalmem() / (1024 * 1024));
    const tests = [
        [undefined, `--ram=${totalMem - 256}`],
        ["", `--ram=${totalMem - 256}`],
        ["512", "--ram=512"],
    ];
    for (const [input, expectedFlag] of tests) {
        const flag = util.getMemoryFlag(input);
        t.deepEqual(flag, expectedFlag);
    }
});
ava_1.default("getMemoryFlag() throws if the ram input is < 0 or NaN", (t) => {
    for (const input of ["-1", "hello!"]) {
        t.throws(() => util.getMemoryFlag(input));
    }
});
ava_1.default("getAddSnippetsFlag() should return the correct flag", (t) => {
    t.deepEqual(util.getAddSnippetsFlag(true), "--sarif-add-snippets");
    t.deepEqual(util.getAddSnippetsFlag("true"), "--sarif-add-snippets");
    t.deepEqual(util.getAddSnippetsFlag(false), "--no-sarif-add-snippets");
    t.deepEqual(util.getAddSnippetsFlag(undefined), "--no-sarif-add-snippets");
    t.deepEqual(util.getAddSnippetsFlag("false"), "--no-sarif-add-snippets");
    t.deepEqual(util.getAddSnippetsFlag("foo bar"), "--no-sarif-add-snippets");
});
ava_1.default("getThreadsFlag() should return the correct --threads flag", (t) => {
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
        const flag = util.getThreadsFlag(input, logging_1.getRunnerLogger(true));
        t.deepEqual(flag, expectedFlag);
    }
});
ava_1.default("getThreadsFlag() throws if the threads input is not an integer", (t) => {
    t.throws(() => util.getThreadsFlag("hello!", logging_1.getRunnerLogger(true)));
});
ava_1.default("isLocalRun() runs correctly", (t) => {
    process.env.CODEQL_LOCAL_RUN = "";
    t.assert(!util.isLocalRun());
    process.env.CODEQL_LOCAL_RUN = "false";
    t.assert(!util.isLocalRun());
    process.env.CODEQL_LOCAL_RUN = "0";
    t.assert(!util.isLocalRun());
    process.env.CODEQL_LOCAL_RUN = "true";
    t.assert(util.isLocalRun());
    process.env.CODEQL_LOCAL_RUN = "hucairz";
    t.assert(util.isLocalRun());
});
ava_1.default("getExtraOptionsEnvParam() succeeds on valid JSON with invalid options (for now)", (t) => {
    const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;
    const options = { foo: 42 };
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = JSON.stringify(options);
    t.deepEqual(util.getExtraOptionsEnvParam(), options);
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});
ava_1.default("getExtraOptionsEnvParam() succeeds on valid options", (t) => {
    const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;
    const options = { database: { init: ["--debug"] } };
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = JSON.stringify(options);
    t.deepEqual(util.getExtraOptionsEnvParam(), options);
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});
ava_1.default("getExtraOptionsEnvParam() fails on invalid JSON", (t) => {
    const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = "{{invalid-json}}";
    t.throws(util.getExtraOptionsEnvParam);
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});
ava_1.default("parseGithubUrl", (t) => {
    t.deepEqual(util.parseGithubUrl("github.com"), "https://github.com");
    t.deepEqual(util.parseGithubUrl("https://github.com"), "https://github.com");
    t.deepEqual(util.parseGithubUrl("https://api.github.com"), "https://github.com");
    t.deepEqual(util.parseGithubUrl("https://github.com/foo/bar"), "https://github.com");
    t.deepEqual(util.parseGithubUrl("github.example.com"), "https://github.example.com/");
    t.deepEqual(util.parseGithubUrl("https://github.example.com"), "https://github.example.com/");
    t.deepEqual(util.parseGithubUrl("https://api.github.example.com"), "https://github.example.com/");
    t.deepEqual(util.parseGithubUrl("https://github.example.com/api/v3"), "https://github.example.com/");
    t.deepEqual(util.parseGithubUrl("https://github.example.com:1234"), "https://github.example.com:1234/");
    t.deepEqual(util.parseGithubUrl("https://api.github.example.com:1234"), "https://github.example.com:1234/");
    t.deepEqual(util.parseGithubUrl("https://github.example.com:1234/api/v3"), "https://github.example.com:1234/");
    t.deepEqual(util.parseGithubUrl("https://github.example.com/base/path"), "https://github.example.com/base/path/");
    t.deepEqual(util.parseGithubUrl("https://github.example.com/base/path/api/v3"), "https://github.example.com/base/path/");
    t.throws(() => util.parseGithubUrl(""), {
        message: '"" is not a valid URL',
    });
    t.throws(() => util.parseGithubUrl("ssh://github.com"), {
        message: '"ssh://github.com" is not a http or https URL',
    });
    t.throws(() => util.parseGithubUrl("http:///::::433"), {
        message: '"http:///::::433" is not a valid URL',
    });
});
ava_1.default("allowed API versions", async (t) => {
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
    const spyGetContents = sinon_1.default
        .stub(client.meta, "get")
        .resolves(response);
    sinon_1.default.stub(api, "getApiClient").value(() => client);
    return spyGetContents;
}
ava_1.default("getGitHubVersion", async (t) => {
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
//# sourceMappingURL=util.test.js.map