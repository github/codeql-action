import * as fs from "fs";
import * as os from "os";
import * as stream from "stream";

import * as core from "@actions/core";
import * as github from "@actions/github";
import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import * as api from "./api-client";
import { Config } from "./config-utils";
import { getRunnerLogger, Logger } from "./logging";
import { setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

test("getToolNames", (t) => {
  const input = fs.readFileSync(
    `${__dirname}/../src/testdata/tool-names.sarif`,
    "utf8"
  );
  const toolNames = util.getToolNames(JSON.parse(input));
  t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});

test("getMemoryFlag() should return the correct --ram flag", (t) => {
  const totalMem = Math.floor(os.totalmem() / (1024 * 1024));
  const expectedThreshold = process.platform === "win32" ? 1536 : 1024;

  const tests: Array<[string | undefined, string]> = [
    [undefined, `--ram=${totalMem - expectedThreshold}`],
    ["", `--ram=${totalMem - expectedThreshold}`],
    ["512", "--ram=512"],
  ];

  for (const [input, expectedFlag] of tests) {
    const flag = util.getMemoryFlag(input);
    t.deepEqual(flag, expectedFlag);
  }
});

test("getMemoryFlag() throws if the ram input is < 0 or NaN", (t) => {
  for (const input of ["-1", "hello!"]) {
    t.throws(() => util.getMemoryFlag(input));
  }
});

test("getAddSnippetsFlag() should return the correct flag", (t) => {
  t.deepEqual(util.getAddSnippetsFlag(true), "--sarif-add-snippets");
  t.deepEqual(util.getAddSnippetsFlag("true"), "--sarif-add-snippets");

  t.deepEqual(util.getAddSnippetsFlag(false), "--no-sarif-add-snippets");
  t.deepEqual(util.getAddSnippetsFlag(undefined), "--no-sarif-add-snippets");
  t.deepEqual(util.getAddSnippetsFlag("false"), "--no-sarif-add-snippets");
  t.deepEqual(util.getAddSnippetsFlag("foo bar"), "--no-sarif-add-snippets");
});

test("getThreadsFlag() should return the correct --threads flag", (t) => {
  const numCpus = os.cpus().length;

  const tests: Array<[string | undefined, string]> = [
    ["0", "--threads=0"],
    ["1", "--threads=1"],
    [undefined, `--threads=${numCpus}`],
    ["", `--threads=${numCpus}`],
    [`${numCpus + 1}`, `--threads=${numCpus}`],
    [`${-numCpus - 1}`, `--threads=${-numCpus}`],
  ];

  for (const [input, expectedFlag] of tests) {
    const flag = util.getThreadsFlag(input, getRunnerLogger(true));
    t.deepEqual(flag, expectedFlag);
  }
});

test("getThreadsFlag() throws if the threads input is not an integer", (t) => {
  t.throws(() => util.getThreadsFlag("hello!", getRunnerLogger(true)));
});

test("getExtraOptionsEnvParam() succeeds on valid JSON with invalid options (for now)", (t) => {
  const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;

  const options = { foo: 42 };

  process.env.CODEQL_ACTION_EXTRA_OPTIONS = JSON.stringify(options);

  t.deepEqual(util.getExtraOptionsEnvParam(), <any>options);

  process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});

test("getExtraOptionsEnvParam() succeeds on valid options", (t) => {
  const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;

  const options = { database: { init: ["--debug"] } };
  process.env.CODEQL_ACTION_EXTRA_OPTIONS = JSON.stringify(options);

  t.deepEqual(util.getExtraOptionsEnvParam(), options);

  process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});

test("getExtraOptionsEnvParam() fails on invalid JSON", (t) => {
  const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;

  process.env.CODEQL_ACTION_EXTRA_OPTIONS = "{{invalid-json}}";
  t.throws(util.getExtraOptionsEnvParam);

  process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});

test("parseGitHubUrl", (t) => {
  t.deepEqual(util.parseGitHubUrl("github.com"), "https://github.com");
  t.deepEqual(util.parseGitHubUrl("https://github.com"), "https://github.com");
  t.deepEqual(
    util.parseGitHubUrl("https://api.github.com"),
    "https://github.com"
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.com/foo/bar"),
    "https://github.com"
  );

  t.deepEqual(
    util.parseGitHubUrl("github.example.com"),
    "https://github.example.com/"
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com"),
    "https://github.example.com/"
  );
  t.deepEqual(
    util.parseGitHubUrl("https://api.github.example.com"),
    "https://github.example.com/"
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com/api/v3"),
    "https://github.example.com/"
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com:1234"),
    "https://github.example.com:1234/"
  );
  t.deepEqual(
    util.parseGitHubUrl("https://api.github.example.com:1234"),
    "https://github.example.com:1234/"
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com:1234/api/v3"),
    "https://github.example.com:1234/"
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com/base/path"),
    "https://github.example.com/base/path/"
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com/base/path/api/v3"),
    "https://github.example.com/base/path/"
  );

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

test("allowed API versions", async (t) => {
  t.is(util.apiVersionInRange("1.33.0", "1.33", "2.0"), undefined);
  t.is(util.apiVersionInRange("1.33.1", "1.33", "2.0"), undefined);
  t.is(util.apiVersionInRange("1.34.0", "1.33", "2.0"), undefined);
  t.is(util.apiVersionInRange("2.0.0", "1.33", "2.0"), undefined);
  t.is(util.apiVersionInRange("2.0.1", "1.33", "2.0"), undefined);
  t.is(
    util.apiVersionInRange("1.32.0", "1.33", "2.0"),
    util.DisallowedAPIVersionReason.ACTION_TOO_NEW
  );
  t.is(
    util.apiVersionInRange("2.1.0", "1.33", "2.0"),
    util.DisallowedAPIVersionReason.ACTION_TOO_OLD
  );
});

function mockGetMetaVersionHeader(
  versionHeader: string | undefined
): sinon.SinonStub<any, any> {
  // Passing an auth token is required, so we just use a dummy value
  const client = github.getOctokit("123");
  const response = {
    headers: {
      "x-github-enterprise-version": versionHeader,
    },
  };
  const spyGetContents = sinon
    .stub(client.meta, "get")
    .resolves(response as any);
  sinon.stub(api, "getApiClient").value(() => client);
  return spyGetContents;
}

test("getGitHubVersion", async (t) => {
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
  t.deepEqual(
    { type: util.GitHubVariant.GHES, version: "2.0" } as util.GitHubVersion,
    v2
  );

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

test("getGitHubAuth", async (t) => {
  const msgs: string[] = [];
  const mockLogger = {
    warning: (msg: string) => msgs.push(msg),
  } as unknown as Logger;

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
  await mockStdInForAuth(
    t,
    mockLogger,
    "def",
    "def\n some extra garbage",
    "ghi"
  );
  await mockStdInForAuth(t, mockLogger, "defghi", "def", "ghi\n123");

  await mockStdInForAuthExpectError(t, mockLogger, "");
  await mockStdInForAuthExpectError(t, mockLogger, "", " ", "abc");
  await mockStdInForAuthExpectError(
    t,
    mockLogger,
    "  def\n some extra garbage",
    "ghi"
  );
  t.is(msgs.length, 0);
});

async function mockStdInForAuth(
  t: ExecutionContext<any>,
  mockLogger: Logger,
  expected: string,
  ...text: string[]
) {
  const stdin = stream.Readable.from(text) as any;
  t.is(expected, await util.getGitHubAuth(mockLogger, undefined, true, stdin));
}

async function mockStdInForAuthExpectError(
  t: ExecutionContext<unknown>,
  mockLogger: Logger,
  ...text: string[]
) {
  const stdin = stream.Readable.from(text) as any;
  await t.throwsAsync(async () =>
    util.getGitHubAuth(mockLogger, undefined, true, stdin)
  );
}

const ML_POWERED_JS_STATUS_TESTS: Array<[string[], string]> = [
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
  test(`ML-powered JS queries status report is "${expectedStatus}" for packs = ${packDescriptions}`, (t) => {
    return util.withTmpDir(async (tmpDir) => {
      const config: Config = {
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
        } as util.GitHubVersion,
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

test("isGitHubGhesVersionBelow", async (t) => {
  t.falsy(
    util.isGitHubGhesVersionBelow({ type: util.GitHubVariant.DOTCOM }, "3.2.0")
  );
  t.falsy(
    util.isGitHubGhesVersionBelow({ type: util.GitHubVariant.GHAE }, "3.2.0")
  );
  t.falsy(
    util.isGitHubGhesVersionBelow(
      { type: util.GitHubVariant.GHES, version: "3.3.0" },
      "3.2.0"
    )
  );
  t.falsy(
    util.isGitHubGhesVersionBelow(
      { type: util.GitHubVariant.GHES, version: "3.2.0" },
      "3.2.0"
    )
  );
  t.true(
    util.isGitHubGhesVersionBelow(
      { type: util.GitHubVariant.GHES, version: "3.1.2" },
      "3.2.0"
    )
  );
});

function formatGitHubVersion(version: util.GitHubVersion): string {
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

const CHECK_ACTION_VERSION_TESTS: Array<[string, util.GitHubVersion, boolean]> =
  [
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

for (const [
  version,
  githubVersion,
  shouldReportWarning,
] of CHECK_ACTION_VERSION_TESTS) {
  const reportWarningDescription = shouldReportWarning
    ? "reports warning"
    : "doesn't report warning";
  const versionsDescription = `CodeQL Action version ${version} and GitHub version ${formatGitHubVersion(
    githubVersion
  )}`;
  test(`checkActionVersion ${reportWarningDescription} for ${versionsDescription}`, async (t) => {
    const warningSpy = sinon.spy(core, "warning");
    const versionStub = sinon
      .stub(api, "getGitHubVersionActionsOnly")
      .resolves(githubVersion);
    const isActionsStub = sinon.stub(util, "isActions").returns(true);
    await util.checkActionVersion(version);
    if (shouldReportWarning) {
      t.true(
        warningSpy.calledOnceWithExactly(
          sinon.match("CodeQL Action v1 will be deprecated")
        )
      );
    } else {
      t.false(warningSpy.called);
    }
    versionStub.restore();
    isActionsStub.restore();
  });
}
