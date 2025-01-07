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
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path_1 = __importDefault(require("path"));
const core = __importStar(require("@actions/core"));
const ava_1 = __importDefault(require("ava"));
const yaml = __importStar(require("js-yaml"));
const sinon = __importStar(require("sinon"));
const api = __importStar(require("./api-client"));
const environment_1 = require("./environment");
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("getToolNames", (t) => {
    const input = fs.readFileSync(`${__dirname}/../src/testdata/tool-names.sarif`, "utf8");
    const toolNames = util.getToolNames(JSON.parse(input));
    t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});
const GET_MEMORY_FLAG_TESTS = [
    {
        input: undefined,
        totalMemoryMb: 8 * 1024,
        platform: "linux",
        expectedMemoryValue: 7 * 1024,
    },
    {
        input: undefined,
        totalMemoryMb: 8 * 1024,
        platform: "win32",
        expectedMemoryValue: 6.5 * 1024,
    },
    {
        input: "",
        totalMemoryMb: 8 * 1024,
        platform: "linux",
        expectedMemoryValue: 7 * 1024,
    },
    {
        input: "512",
        totalMemoryMb: 8 * 1024,
        platform: "linux",
        expectedMemoryValue: 512,
    },
    {
        input: undefined,
        totalMemoryMb: 64 * 1024,
        platform: "linux",
        expectedMemoryValue: 61644, // Math.floor(1024 * (64 - 1 - 0.05 * (64 - 8)))
    },
    {
        input: undefined,
        totalMemoryMb: 64 * 1024,
        platform: "win32",
        expectedMemoryValue: 61132, // Math.floor(1024 * (64 - 1.5 - 0.05 * (64 - 8)))
    },
    {
        input: undefined,
        totalMemoryMb: 64 * 1024,
        platform: "linux",
        expectedMemoryValue: 58777, // Math.floor(1024 * (64 - 1 - 0.1 * (64 - 8)))
        reservedPercentageValue: "10",
    },
];
for (const { input, totalMemoryMb, platform, expectedMemoryValue, reservedPercentageValue, } of GET_MEMORY_FLAG_TESTS) {
    (0, ava_1.default)(`Memory flag value is ${expectedMemoryValue} for ${input ?? "no user input"} on ${platform} with ${totalMemoryMb} MB total system RAM${reservedPercentageValue
        ? ` and reserved percentage env var set to ${reservedPercentageValue}`
        : ""}`, async (t) => {
        process.env[environment_1.EnvVar.SCALING_RESERVED_RAM_PERCENTAGE] =
            reservedPercentageValue || undefined;
        const flag = util.getMemoryFlagValueForPlatform(input, totalMemoryMb * 1024 * 1024, platform);
        t.deepEqual(flag, expectedMemoryValue);
    });
}
(0, ava_1.default)("getMemoryFlag() throws if the ram input is < 0 or NaN", async (t) => {
    for (const input of ["-1", "hello!"]) {
        t.throws(() => util.getMemoryFlag(input, (0, logging_1.getRunnerLogger)(true)));
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
(0, ava_1.default)("getExtraOptionsEnvParam() succeeds on valid JSON options", (t) => {
    const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;
    const options = { database: { init: ["--debug"] } };
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = JSON.stringify(options);
    t.deepEqual(util.getExtraOptionsEnvParam(), options);
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});
(0, ava_1.default)("getExtraOptionsEnvParam() succeeds on valid YAML options", (t) => {
    const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;
    const options = { database: { init: ["--debug"] } };
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = yaml.dump(options);
    t.deepEqual(util.getExtraOptionsEnvParam(), { ...options });
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});
(0, ava_1.default)("getExtraOptionsEnvParam() fails on invalid JSON", (t) => {
    const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;
    process.env.CODEQL_ACTION_EXTRA_OPTIONS = "{{invalid-json}";
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
const longTime = 999_999;
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
function createMockSarifWithNotification(locations) {
    return {
        runs: [
            {
                tool: {
                    driver: {
                        name: "CodeQL",
                    },
                },
                invocations: [
                    {
                        toolExecutionNotifications: [
                            {
                                locations,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}
const stubLocation = {
    physicalLocation: {
        artifactLocation: {
            uri: "file1",
        },
    },
};
(0, ava_1.default)("fixInvalidNotifications leaves notifications with unique locations alone", (t) => {
    const messages = [];
    const result = util.fixInvalidNotifications(createMockSarifWithNotification([stubLocation]), (0, testing_utils_1.getRecordingLogger)(messages));
    t.deepEqual(result, createMockSarifWithNotification([stubLocation]));
    t.is(messages.length, 1);
    t.deepEqual(messages[0], {
        type: "debug",
        message: "No duplicate locations found in SARIF notification objects.",
    });
});
(0, ava_1.default)("fixInvalidNotifications removes duplicate locations", (t) => {
    const messages = [];
    const result = util.fixInvalidNotifications(createMockSarifWithNotification([stubLocation, stubLocation]), (0, testing_utils_1.getRecordingLogger)(messages));
    t.deepEqual(result, createMockSarifWithNotification([stubLocation]));
    t.is(messages.length, 1);
    t.deepEqual(messages[0], {
        type: "info",
        message: "Removed 1 duplicate locations from SARIF notification objects.",
    });
});
function formatGitHubVersion(version) {
    switch (version.type) {
        case util.GitHubVariant.DOTCOM:
            return "dotcom";
        case util.GitHubVariant.GHE_DOTCOM:
            return "GHE dotcom";
        case util.GitHubVariant.GHES:
            return `GHES ${version.version}`;
        default:
            util.assertNever(version);
    }
}
const CHECK_ACTION_VERSION_TESTS = [
    ["2.2.1", { type: util.GitHubVariant.DOTCOM }, true],
    ["2.2.1", { type: util.GitHubVariant.GHE_DOTCOM }, true],
    ["2.2.1", { type: util.GitHubVariant.GHES, version: "3.10" }, false],
    ["2.2.1", { type: util.GitHubVariant.GHES, version: "3.11" }, true],
    ["2.2.1", { type: util.GitHubVariant.GHES, version: "3.12" }, true],
    ["3.2.1", { type: util.GitHubVariant.DOTCOM }, false],
    ["3.2.1", { type: util.GitHubVariant.GHE_DOTCOM }, false],
    ["3.2.1", { type: util.GitHubVariant.GHES, version: "3.10" }, false],
    ["3.2.1", { type: util.GitHubVariant.GHES, version: "3.11" }, false],
    ["3.2.1", { type: util.GitHubVariant.GHES, version: "3.12" }, false],
];
for (const [version, githubVersion, shouldReportError,] of CHECK_ACTION_VERSION_TESTS) {
    const reportErrorDescription = shouldReportError
        ? "reports error"
        : "doesn't report error";
    const versionsDescription = `CodeQL Action version ${version} and GitHub version ${formatGitHubVersion(githubVersion)}`;
    (0, ava_1.default)(`checkActionVersion ${reportErrorDescription} for ${versionsDescription}`, async (t) => {
        const warningSpy = sinon.spy(core, "error");
        const versionStub = sinon
            .stub(api, "getGitHubVersion")
            .resolves(githubVersion);
        // call checkActionVersion twice and assert below that warning is reported only once
        util.checkActionVersion(version, await api.getGitHubVersion());
        util.checkActionVersion(version, await api.getGitHubVersion());
        if (shouldReportError) {
            t.true(warningSpy.calledOnceWithExactly(sinon.match("CodeQL Action major versions v1 and v2 have been deprecated.")));
        }
        else {
            t.false(warningSpy.called);
        }
        versionStub.restore();
    });
}
(0, ava_1.default)("getCgroupCpuCountFromCpus calculates the number of CPUs correctly", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const testCpuFile = `${tmpDir}/cpus-file`;
        fs.writeFileSync(testCpuFile, "1, 9-10\n", "utf-8");
        t.deepEqual(util.getCgroupCpuCountFromCpus(testCpuFile, (0, logging_1.getRunnerLogger)(true)), 3);
    });
});
(0, ava_1.default)("getCgroupCpuCountFromCpus returns undefined if the CPU file doesn't exist", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const testCpuFile = `${tmpDir}/cpus-file`;
        t.false(fs.existsSync(testCpuFile));
        t.deepEqual(util.getCgroupCpuCountFromCpus(testCpuFile, (0, logging_1.getRunnerLogger)(true)), undefined);
    });
});
(0, ava_1.default)("getCgroupCpuCountFromCpus returns undefined if the CPU file exists but is empty", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const testCpuFile = `${tmpDir}/cpus-file`;
        fs.writeFileSync(testCpuFile, "\n", "utf-8");
        t.deepEqual(util.getCgroupCpuCountFromCpus(testCpuFile, (0, logging_1.getRunnerLogger)(true)), undefined);
    });
});
//# sourceMappingURL=util.test.js.map