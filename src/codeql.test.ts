import * as fs from "fs";

import { ExecOptions } from "@actions/exec";
import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as io from "@actions/io";
import * as toolcache from "@actions/tool-cache";
import test, { ExecutionContext } from "ava";
import del from "del";
import * as yaml from "js-yaml";
import nock from "nock";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { GitHubApiDetails } from "./api-client";
import { CliError } from "./cli-errors";
import * as codeql from "./codeql";
import { AugmentationProperties, Config } from "./config-utils";
import * as defaults from "./defaults.json";
import { DocUrl } from "./doc-url";
import { FeatureEnablement } from "./feature-flags";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import { ToolsSource } from "./setup-codeql";
import {
  setupTests,
  createFeatures,
  setupActionsVars,
  SAMPLE_DOTCOM_API_DETAILS,
  SAMPLE_DEFAULT_CLI_VERSION,
  mockBundleDownloadApi,
  makeVersionInfo,
  createTestConfig,
} from "./testing-utils";
import { ToolsDownloadStatusReport } from "./tools-download";
import { ToolsFeature } from "./tools-features";
import * as util from "./util";
import { initializeEnvironment } from "./util";

setupTests(test);

let stubConfig: Config;

const NO_FEATURES: FeatureEnablement = createFeatures([]);

test.beforeEach(() => {
  initializeEnvironment("1.2.3");

  stubConfig = createTestConfig({
    languages: [Language.cpp],
  });
});

async function installIntoToolcache({
  apiDetails = SAMPLE_DOTCOM_API_DETAILS,
  cliVersion,
  isPinned,
  tagName,
  tmpDir,
}: {
  apiDetails?: GitHubApiDetails;
  cliVersion?: string;
  isPinned: boolean;
  tagName: string;
  tmpDir: string;
}) {
  const url = mockBundleDownloadApi({ apiDetails, isPinned, tagName });
  await codeql.setupCodeQL(
    cliVersion !== undefined ? undefined : url,
    apiDetails,
    tmpDir,
    util.GitHubVariant.GHES,
    cliVersion !== undefined
      ? { cliVersion, tagName }
      : SAMPLE_DEFAULT_CLI_VERSION,
    getRunnerLogger(true),
    NO_FEATURES,
    false,
  );
}

function mockReleaseApi({
  apiDetails = SAMPLE_DOTCOM_API_DETAILS,
  assetNames,
  tagName,
}: {
  apiDetails?: GitHubApiDetails;
  assetNames: string[];
  tagName: string;
}): nock.Scope {
  return nock(apiDetails.apiURL!)
    .get(`/repos/github/codeql-action/releases/tags/${tagName}`)
    .reply(200, {
      assets: assetNames.map((name) => ({
        name,
      })),
      tag_name: tagName,
    });
}

function mockApiDetails(apiDetails: GitHubApiDetails) {
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

test("downloads and caches explicitly requested bundles that aren't in the toolcache", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const versions = ["20200601", "20200610"];

    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];

      const url = mockBundleDownloadApi({
        tagName: `codeql-bundle-${version}`,
        isPinned: false,
      });
      const result = await codeql.setupCodeQL(
        url,
        SAMPLE_DOTCOM_API_DETAILS,
        tmpDir,
        util.GitHubVariant.DOTCOM,
        SAMPLE_DEFAULT_CLI_VERSION,
        getRunnerLogger(true),
        NO_FEATURES,
        false,
      );

      t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
      t.is(result.toolsVersion, `0.0.0-${version}`);
      t.is(result.toolsSource, ToolsSource.Download);
    }

    t.is(toolcache.findAllVersions("CodeQL").length, 2);
  });
});

test("caches semantically versioned bundles using their semantic version number", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const url = mockBundleDownloadApi({
      tagName: `codeql-bundle-v2.15.0`,
      isPinned: false,
    });
    const result = await codeql.setupCodeQL(
      url,
      SAMPLE_DOTCOM_API_DETAILS,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      SAMPLE_DEFAULT_CLI_VERSION,
      getRunnerLogger(true),
      NO_FEATURES,
      false,
    );

    t.is(toolcache.findAllVersions("CodeQL").length, 1);
    t.assert(toolcache.find("CodeQL", `2.15.0`));
    t.is(result.toolsVersion, `2.15.0`);
    t.is(result.toolsSource, ToolsSource.Download);
    if (result.toolsDownloadStatusReport) {
      assertDurationsInteger(t, result.toolsDownloadStatusReport);
    }
  });
});

test("downloads an explicitly requested bundle even if a different version is cached", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    await installIntoToolcache({
      tagName: "codeql-bundle-20200601",
      isPinned: true,
      tmpDir,
    });

    const url = mockBundleDownloadApi({
      tagName: "codeql-bundle-20200610",
    });
    const result = await codeql.setupCodeQL(
      url,
      SAMPLE_DOTCOM_API_DETAILS,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      SAMPLE_DEFAULT_CLI_VERSION,
      getRunnerLogger(true),
      NO_FEATURES,
      false,
    );
    t.assert(toolcache.find("CodeQL", "0.0.0-20200610"));
    t.deepEqual(result.toolsVersion, "0.0.0-20200610");
    t.is(result.toolsSource, ToolsSource.Download);
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

for (const {
  tagName,
  expectedToolcacheVersion,
} of EXPLICITLY_REQUESTED_BUNDLE_TEST_CASES) {
  test(`caches explicitly requested bundle ${tagName} as ${expectedToolcacheVersion}`, async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      mockApiDetails(SAMPLE_DOTCOM_API_DETAILS);
      sinon.stub(actionsUtil, "isRunningLocalAction").returns(true);

      const url = mockBundleDownloadApi({
        tagName,
      });

      const result = await codeql.setupCodeQL(
        url,
        SAMPLE_DOTCOM_API_DETAILS,
        tmpDir,
        util.GitHubVariant.DOTCOM,
        SAMPLE_DEFAULT_CLI_VERSION,
        getRunnerLogger(true),
        NO_FEATURES,
        false,
      );
      t.assert(toolcache.find("CodeQL", expectedToolcacheVersion));
      t.deepEqual(result.toolsVersion, expectedToolcacheVersion);
      t.is(result.toolsSource, ToolsSource.Download);
      t.assert(
        Number.isInteger(result.toolsDownloadStatusReport?.downloadDurationMs),
      );
    });
  });
}

for (const toolcacheVersion of [
  // Test that we use the tools from the toolcache when `SAMPLE_DEFAULT_CLI_VERSION` is requested
  // and `SAMPLE_DEFAULT_CLI_VERSION-` is in the toolcache.
  SAMPLE_DEFAULT_CLI_VERSION.cliVersion,
  `${SAMPLE_DEFAULT_CLI_VERSION.cliVersion}-20230101`,
]) {
  test(
    `uses tools from toolcache when ${SAMPLE_DEFAULT_CLI_VERSION.cliVersion} is requested and ` +
      `${toolcacheVersion} is installed`,
    async (t) => {
      await util.withTmpDir(async (tmpDir) => {
        setupActionsVars(tmpDir, tmpDir);

        sinon
          .stub(toolcache, "find")
          .withArgs("CodeQL", toolcacheVersion)
          .returns("path/to/cached/codeql");
        sinon.stub(toolcache, "findAllVersions").returns([toolcacheVersion]);

        const result = await codeql.setupCodeQL(
          undefined,
          SAMPLE_DOTCOM_API_DETAILS,
          tmpDir,
          util.GitHubVariant.DOTCOM,
          SAMPLE_DEFAULT_CLI_VERSION,
          getRunnerLogger(true),
          NO_FEATURES,
          false,
        );
        t.is(result.toolsVersion, SAMPLE_DEFAULT_CLI_VERSION.cliVersion);
        t.is(result.toolsSource, ToolsSource.Toolcache);
        t.is(result.toolsDownloadStatusReport?.combinedDurationMs, undefined);
        t.is(result.toolsDownloadStatusReport?.downloadDurationMs, undefined);
        t.is(result.toolsDownloadStatusReport?.extractionDurationMs, undefined);
      });
    },
  );
}

test(`uses a cached bundle when no tools input is given on GHES`, async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    await installIntoToolcache({
      tagName: "codeql-bundle-20200601",
      isPinned: true,
      tmpDir,
    });

    const result = await codeql.setupCodeQL(
      undefined,
      SAMPLE_DOTCOM_API_DETAILS,
      tmpDir,
      util.GitHubVariant.GHES,
      {
        cliVersion: defaults.cliVersion,
        tagName: defaults.bundleVersion,
      },
      getRunnerLogger(true),
      NO_FEATURES,
      false,
    );
    t.deepEqual(result.toolsVersion, "0.0.0-20200601");
    t.is(result.toolsSource, ToolsSource.Toolcache);
    t.is(result.toolsDownloadStatusReport?.combinedDurationMs, undefined);
    t.is(result.toolsDownloadStatusReport?.downloadDurationMs, undefined);
    t.is(result.toolsDownloadStatusReport?.extractionDurationMs, undefined);

    const cachedVersions = toolcache.findAllVersions("CodeQL");
    t.is(cachedVersions.length, 1);
  });
});

test(`downloads bundle if only an unpinned version is cached on GHES`, async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    await installIntoToolcache({
      tagName: "codeql-bundle-20200601",
      isPinned: false,
      tmpDir,
    });

    mockBundleDownloadApi({
      tagName: defaults.bundleVersion,
    });
    const result = await codeql.setupCodeQL(
      undefined,
      SAMPLE_DOTCOM_API_DETAILS,
      tmpDir,
      util.GitHubVariant.GHES,
      {
        cliVersion: defaults.cliVersion,
        tagName: defaults.bundleVersion,
      },
      getRunnerLogger(true),
      NO_FEATURES,
      false,
    );
    t.deepEqual(result.toolsVersion, defaults.cliVersion);
    t.is(result.toolsSource, ToolsSource.Download);
    if (result.toolsDownloadStatusReport) {
      assertDurationsInteger(t, result.toolsDownloadStatusReport);
    }

    const cachedVersions = toolcache.findAllVersions("CodeQL");
    t.is(cachedVersions.length, 2);
  });
});

test('downloads bundle if "latest" tools specified but not cached', async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    await installIntoToolcache({
      tagName: "codeql-bundle-20200601",
      isPinned: true,
      tmpDir,
    });

    mockBundleDownloadApi({
      tagName: defaults.bundleVersion,
    });
    const result = await codeql.setupCodeQL(
      "latest",
      SAMPLE_DOTCOM_API_DETAILS,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      SAMPLE_DEFAULT_CLI_VERSION,
      getRunnerLogger(true),
      NO_FEATURES,
      false,
    );
    t.deepEqual(result.toolsVersion, defaults.cliVersion);
    t.is(result.toolsSource, ToolsSource.Download);
    if (result.toolsDownloadStatusReport) {
      assertDurationsInteger(t, result.toolsDownloadStatusReport);
    }

    const cachedVersions = toolcache.findAllVersions("CodeQL");
    t.is(cachedVersions.length, 2);
  });
});

test("bundle URL from another repo is cached as 0.0.0-bundleVersion", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    mockApiDetails(SAMPLE_DOTCOM_API_DETAILS);
    sinon.stub(actionsUtil, "isRunningLocalAction").returns(true);
    const releasesApiMock = mockReleaseApi({
      assetNames: ["cli-version-2.14.6.txt"],
      tagName: "codeql-bundle-20230203",
    });
    mockBundleDownloadApi({
      repo: "codeql-testing/codeql-cli-nightlies",
      platformSpecific: false,
      tagName: "codeql-bundle-20230203",
    });
    const result = await codeql.setupCodeQL(
      "https://github.com/codeql-testing/codeql-cli-nightlies/releases/download/codeql-bundle-20230203/codeql-bundle.tar.gz",
      SAMPLE_DOTCOM_API_DETAILS,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      SAMPLE_DEFAULT_CLI_VERSION,
      getRunnerLogger(true),
      NO_FEATURES,
      false,
    );

    t.is(result.toolsVersion, "0.0.0-20230203");
    t.is(result.toolsSource, ToolsSource.Download);
    if (result.toolsDownloadStatusReport) {
      assertDurationsInteger(t, result.toolsDownloadStatusReport);
    }

    const cachedVersions = toolcache.findAllVersions("CodeQL");
    t.is(cachedVersions.length, 1);
    t.is(cachedVersions[0], "0.0.0-20230203");

    t.false(releasesApiMock.isDone());
  });
});

function assertDurationsInteger(
  t: ExecutionContext<unknown>,
  statusReport: ToolsDownloadStatusReport,
) {
  t.assert(Number.isInteger(statusReport?.combinedDurationMs));
  if (statusReport.downloadDurationMs !== undefined) {
    t.assert(Number.isInteger(statusReport?.downloadDurationMs));
    t.assert(Number.isInteger(statusReport?.extractionDurationMs));
  }
}

test("getExtraOptions works for explicit paths", (t) => {
  t.deepEqual(codeql.getExtraOptions({}, ["foo"], []), []);

  t.deepEqual(codeql.getExtraOptions({ foo: [42] }, ["foo"], []), ["42"]);

  t.deepEqual(
    codeql.getExtraOptions({ foo: { bar: [42] } }, ["foo", "bar"], []),
    ["42"],
  );
});

test("getExtraOptions works for wildcards", (t) => {
  t.deepEqual(codeql.getExtraOptions({ "*": [42] }, ["foo"], []), ["42"]);
});

test("getExtraOptions works for wildcards and explicit paths", (t) => {
  const o1 = { "*": [42], foo: [87] };
  t.deepEqual(codeql.getExtraOptions(o1, ["foo"], []), ["42", "87"]);

  const o2 = { "*": [42], foo: [87] };
  t.deepEqual(codeql.getExtraOptions(o2, ["foo", "bar"], []), ["42"]);

  const o3 = { "*": [42], foo: { "*": [87], bar: [99] } };
  const p = ["foo", "bar"];
  t.deepEqual(codeql.getExtraOptions(o3, p, []), ["42", "87", "99"]);
});

test("getExtraOptions throws for bad content", (t) => {
  t.throws(() => codeql.getExtraOptions({ "*": 42 }, ["foo"], []));

  t.throws(() => codeql.getExtraOptions({ foo: 87 }, ["foo"], []));

  t.throws(() =>
    codeql.getExtraOptions(
      { "*": [42], foo: { "*": 87, bar: [99] } },
      ["foo", "bar"],
      [],
    ),
  );
});

// Test macro for ensuring different variants of injected augmented configurations
const injectedConfigMacro = test.macro({
  exec: async (
    t: ExecutionContext<unknown>,
    augmentationProperties: AugmentationProperties,
    configOverride: Partial<Config>,
    expectedConfig: any,
  ) => {
    await util.withTmpDir(async (tempDir) => {
      const runnerConstructorStub = stubToolRunnerConstructor();
      const codeqlObject = await codeql.getCodeQLForTesting();
      sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("1.0.0"));

      const thisStubConfig: Config = {
        ...stubConfig,
        ...configOverride,
        tempDir,
        augmentationProperties,
      };

      await codeqlObject.databaseInitCluster(
        thisStubConfig,
        "",
        undefined,
        undefined,
        getRunnerLogger(true),
      );

      const args = runnerConstructorStub.firstCall.args[1] as string[];
      // should have used an config file
      const configArg = args.find((arg: string) =>
        arg.startsWith("--codescanning-config="),
      );
      t.truthy(configArg, "Should have injected a codescanning config");
      const configFile = configArg!.split("=")[1];
      const augmentedConfig = yaml.load(fs.readFileSync(configFile, "utf8"));
      t.deepEqual(augmentedConfig, expectedConfig);

      await del(configFile, { force: true });
    });
  },

  title: (providedTitle = "") =>
    `databaseInitCluster() injected config: ${providedTitle}`,
});

test(
  "basic",
  injectedConfigMacro,
  {
    queriesInputCombines: false,
    packsInputCombines: false,
  },
  {},
  {},
);

test(
  "injected packs from input",
  injectedConfigMacro,
  {
    queriesInputCombines: false,
    packsInputCombines: false,
    packsInput: ["xxx", "yyy"],
  },
  {},
  {
    packs: ["xxx", "yyy"],
  },
);

test(
  "injected packs from input with existing packs combines",
  injectedConfigMacro,
  {
    queriesInputCombines: false,
    packsInputCombines: true,
    packsInput: ["xxx", "yyy"],
  },
  {
    originalUserInput: {
      packs: {
        cpp: ["codeql/something-else"],
      },
    },
  },
  {
    packs: {
      cpp: ["codeql/something-else", "xxx", "yyy"],
    },
  },
);

test(
  "injected packs from input with existing packs overrides",
  injectedConfigMacro,
  {
    queriesInputCombines: false,
    packsInputCombines: false,
    packsInput: ["xxx", "yyy"],
  },
  {
    originalUserInput: {
      packs: {
        cpp: ["codeql/something-else"],
      },
    },
  },
  {
    packs: ["xxx", "yyy"],
  },
);

// similar, but with queries
test(
  "injected queries from input",
  injectedConfigMacro,
  {
    queriesInputCombines: false,
    packsInputCombines: false,
    queriesInput: [{ uses: "xxx" }, { uses: "yyy" }],
  },
  {},
  {
    queries: [
      {
        uses: "xxx",
      },
      {
        uses: "yyy",
      },
    ],
  },
);

test(
  "injected queries from input overrides",
  injectedConfigMacro,
  {
    queriesInputCombines: false,
    packsInputCombines: false,
    queriesInput: [{ uses: "xxx" }, { uses: "yyy" }],
  },
  {
    originalUserInput: {
      queries: [{ uses: "zzz" }],
    },
  },
  {
    queries: [
      {
        uses: "xxx",
      },
      {
        uses: "yyy",
      },
    ],
  },
);

test(
  "injected queries from input combines",
  injectedConfigMacro,
  {
    queriesInputCombines: true,
    packsInputCombines: false,
    queriesInput: [{ uses: "xxx" }, { uses: "yyy" }],
  },
  {
    originalUserInput: {
      queries: [{ uses: "zzz" }],
    },
  },
  {
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
  },
);

test(
  "injected queries from input combines 2",
  injectedConfigMacro,
  {
    queriesInputCombines: true,
    packsInputCombines: true,
    queriesInput: [{ uses: "xxx" }, { uses: "yyy" }],
  },
  {},
  {
    queries: [
      {
        uses: "xxx",
      },
      {
        uses: "yyy",
      },
    ],
  },
);

test(
  "injected queries and packs, but empty",
  injectedConfigMacro,
  {
    queriesInputCombines: true,
    packsInputCombines: true,
    queriesInput: [],
    packsInput: [],
  },
  {
    originalUserInput: {
      packs: [],
      queries: [],
    },
  },
  {},
);

test("passes a code scanning config AND qlconfig to the CLI", async (t: ExecutionContext<unknown>) => {
  await util.withTmpDir(async (tempDir) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.17.6"));

    await codeqlObject.databaseInitCluster(
      { ...stubConfig, tempDir },
      "",
      undefined,
      "/path/to/qlconfig.yml",
      getRunnerLogger(true),
    );

    const args = runnerConstructorStub.firstCall.args[1] as string[];
    // should have used a config file
    const hasCodeScanningConfigArg = args.some((arg: string) =>
      arg.startsWith("--codescanning-config="),
    );
    t.true(hasCodeScanningConfigArg, "Should have injected a qlconfig");

    // should have passed a qlconfig file
    const hasQlconfigArg = args.some((arg: string) =>
      arg.startsWith("--qlconfig-file="),
    );
    t.truthy(hasQlconfigArg, "Should have injected a codescanning config");
  });
});

test("does not pass a qlconfig to the CLI when it is undefined", async (t: ExecutionContext<unknown>) => {
  await util.withTmpDir(async (tempDir) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.17.6"));

    await codeqlObject.databaseInitCluster(
      { ...stubConfig, tempDir },
      "",
      undefined,
      undefined, // undefined qlconfigFile
      getRunnerLogger(true),
    );

    const args = runnerConstructorStub.firstCall.args[1] as any[];
    const hasQlconfigArg = args.some((arg: string) =>
      arg.startsWith("--qlconfig-file="),
    );
    t.false(hasQlconfigArg, "should NOT have injected a qlconfig");
  });
});

const NEW_ANALYSIS_SUMMARY_TEST_CASES = [
  {
    codeqlVersion: makeVersionInfo("2.15.0", {
      [ToolsFeature.AnalysisSummaryV2IsDefault]: true,
    }),
    githubVersion: {
      type: util.GitHubVariant.DOTCOM,
    },
    flagPassed: false,
    negativeFlagPassed: false,
  },
  {
    codeqlVersion: makeVersionInfo("2.15.0"),
    githubVersion: {
      type: util.GitHubVariant.DOTCOM,
    },
    flagPassed: true,
    negativeFlagPassed: false,
  },
  {
    codeqlVersion: makeVersionInfo("2.15.0"),
    githubVersion: {
      type: util.GitHubVariant.GHES,
      version: "3.10.0",
    },
    flagPassed: true,
    negativeFlagPassed: false,
  },
];

for (const {
  codeqlVersion,
  flagPassed,
  githubVersion,
  negativeFlagPassed,
} of NEW_ANALYSIS_SUMMARY_TEST_CASES) {
  test(`database interpret-results passes ${
    flagPassed
      ? "--new-analysis-summary"
      : negativeFlagPassed
        ? "--no-new-analysis-summary"
        : "nothing"
  } for CodeQL version ${JSON.stringify(codeqlVersion)} and ${
    util.GitHubVariant[githubVersion.type]
  } ${githubVersion.version ? ` ${githubVersion.version}` : ""}`, async (t) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves(codeqlVersion);
    // io throws because of the test CodeQL object.
    sinon.stub(io, "which").resolves("");
    await codeqlObject.databaseInterpretResults(
      "",
      [],
      "",
      "",
      "",
      "-v",
      undefined,
      "",
      Object.assign({}, stubConfig, { gitHubVersion: githubVersion }),
      createFeatures([]),
    );
    const actualArgs = runnerConstructorStub.firstCall.args[1] as string[];
    t.is(
      actualArgs.includes("--new-analysis-summary"),
      flagPassed,
      `--new-analysis-summary should${flagPassed ? "" : "n't"} be passed`,
    );
    t.is(
      actualArgs.includes("--no-new-analysis-summary"),
      negativeFlagPassed,
      `--no-new-analysis-summary should${
        negativeFlagPassed ? "" : "n't"
      } be passed`,
    );
  });
}

test("runTool summarizes several fatal errors", async (t) => {
  const heapError =
    "A fatal error occurred: Evaluator heap must be at least 384.00 MiB";
  const datasetImportError =
    "A fatal error occurred: Dataset import for /home/runner/work/_temp/codeql_databases/javascript/db-javascript failed with code 2";
  const cliStderr =
    `Running TRAP import for CodeQL database at /home/runner/work/_temp/codeql_databases/javascript...\n` +
    `${heapError}\n${datasetImportError}.`;
  stubToolRunnerConstructor(32, cliStderr);
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.17.6"));
  // io throws because of the test CodeQL object.
  sinon.stub(io, "which").resolves("");

  await t.throwsAsync(
    async () =>
      await codeqlObject.finalizeDatabase(
        "db",
        "--threads=2",
        "--ram=2048",
        false,
      ),
    {
      instanceOf: util.ConfigurationError,
      message: new RegExp(
        'Encountered a fatal error while running \\"codeql-for-testing database finalize --finalize-dataset --threads=2 --ram=2048 db\\"\\. ' +
          `Exit code was 32 and error was: ${datasetImportError.replaceAll(
            ".",
            "\\.",
          )}\\. Context: ${heapError.replaceAll(
            ".",
            "\\.",
          )}\\. See the logs for more details\\.`,
      ),
    },
  );
});

test("runTool summarizes autobuilder errors", async (t) => {
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
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.17.6"));
  sinon.stub(codeqlObject, "resolveExtractor").resolves("/path/to/extractor");
  // io throws because of the test CodeQL object.
  sinon.stub(io, "which").resolves("");

  await t.throwsAsync(
    async () => await codeqlObject.runAutobuild(stubConfig, Language.java),
    {
      instanceOf: util.ConfigurationError,
      message:
        "We were unable to automatically build your code. Please provide manual build steps. " +
        `See ${DocUrl.AUTOMATIC_BUILD_FAILED} for more information. ` +
        "Encountered the following error: Start of the error message\n" +
        "  Some more context about the error message\n" +
        "  continued\n" +
        "  and finished here.",
    },
  );
});

test("runTool truncates long autobuilder errors", async (t) => {
  const stderr = Array.from(
    { length: 20 },
    (_, i) => `[2019-09-18 12:00:00] [autobuild] [ERROR] line${i + 1}`,
  ).join("\n");
  stubToolRunnerConstructor(1, stderr);
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.17.6"));
  sinon.stub(codeqlObject, "resolveExtractor").resolves("/path/to/extractor");
  // io throws because of the test CodeQL object.
  sinon.stub(io, "which").resolves("");

  await t.throwsAsync(
    async () => await codeqlObject.runAutobuild(stubConfig, Language.java),
    {
      instanceOf: util.ConfigurationError,
      message:
        "We were unable to automatically build your code. Please provide manual build steps. " +
        `See ${DocUrl.AUTOMATIC_BUILD_FAILED} for more information. ` +
        "Encountered the following error: " +
        `${Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join(
          "\n",
        )}\n(truncated)`,
    },
  );
});

test("runTool recognizes fatal internal errors", async (t) => {
  const stderr = `
    [11/31 eval 8m19s] Evaluation done; writing results to codeql/go-queries/Security/CWE-020/MissingRegexpAnchor.bqrs.
    Oops! A fatal internal error occurred. Details:
    com.semmle.util.exception.CatastrophicError: An error occurred while evaluating ControlFlowGraph::ControlFlow::Root.isRootOf/1#dispred#f610e6ed/2@86282cc8
    Severe disk cache trouble (corruption or out of space) at /home/runner/work/_temp/codeql_databases/go/db-go/default/cache/pages/28/33.pack: Failed to write item to disk`;
  stubToolRunnerConstructor(1, stderr);
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.17.6"));
  sinon.stub(codeqlObject, "resolveExtractor").resolves("/path/to/extractor");
  // io throws because of the test CodeQL object.
  sinon.stub(io, "which").resolves("");

  await t.throwsAsync(
    async () =>
      await codeqlObject.databaseRunQueries(stubConfig.dbLocation, []),
    {
      instanceOf: CliError,
      message: `Encountered a fatal error while running "codeql-for-testing database run-queries  --expect-discarded-cache --intra-layer-parallelism --min-disk-free=1024 -v". Exit code was 1 and error was: Oops! A fatal internal error occurred. Details:
    com.semmle.util.exception.CatastrophicError: An error occurred while evaluating ControlFlowGraph::ControlFlow::Root.isRootOf/1#dispred#f610e6ed/2@86282cc8
    Severe disk cache trouble (corruption or out of space) at /home/runner/work/_temp/codeql_databases/go/db-go/default/cache/pages/28/33.pack: Failed to write item to disk. See the logs for more details.`,
    },
  );
});

test("runTool outputs last line of stderr if fatal error could not be found", async (t) => {
  const cliStderr = "line1\nline2\nline3\nline4\nline5";
  stubToolRunnerConstructor(32, cliStderr);
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.17.6"));
  // io throws because of the test CodeQL object.
  sinon.stub(io, "which").resolves("");

  await t.throwsAsync(
    async () =>
      await codeqlObject.finalizeDatabase(
        "db",
        "--threads=2",
        "--ram=2048",
        false,
      ),
    {
      instanceOf: util.ConfigurationError,
      message: new RegExp(
        'Encountered a fatal error while running \\"codeql-for-testing database finalize --finalize-dataset --threads=2 --ram=2048 db\\"\\. ' +
          "Exit code was 32 and last log line was: line5\\. See the logs for more details\\.",
      ),
    },
  );
});

test("Avoids duplicating --overwrite flag if specified in CODEQL_ACTION_EXTRA_OPTIONS", async (t) => {
  const runnerConstructorStub = stubToolRunnerConstructor();
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.17.6"));
  // io throws because of the test CodeQL object.
  sinon.stub(io, "which").resolves("");

  process.env["CODEQL_ACTION_EXTRA_OPTIONS"] =
    '{ "database": { "init": ["--overwrite"] } }';

  await codeqlObject.databaseInitCluster(
    stubConfig,
    "sourceRoot",
    undefined,
    undefined,
    getRunnerLogger(false),
  );

  t.true(runnerConstructorStub.calledOnce);
  const args = runnerConstructorStub.firstCall.args[1] as string[];
  t.is(
    args.filter((option: string) => option === "--overwrite").length,
    1,
    "--overwrite should only be passed once",
  );

  // Clean up
  const configArg = args.find((arg: string) =>
    arg.startsWith("--codescanning-config="),
  );
  t.truthy(configArg, "Should have injected a codescanning config");
  const configFile = configArg!.split("=")[1];
  await del(configFile, { force: true });
});

export function stubToolRunnerConstructor(
  exitCode: number = 0,
  stderr?: string,
): sinon.SinonStub<any[], toolrunner.ToolRunner> {
  const runnerObjectStub = sinon.createStubInstance(toolrunner.ToolRunner);
  const runnerConstructorStub = sinon.stub(
    toolrunner,
    "ToolRunner",
  ) as sinon.SinonStub<any[], toolrunner.ToolRunner>;
  let stderrListener: ((data: Buffer) => void) | undefined = undefined;
  runnerConstructorStub.callsFake((_cmd, _args, options: ExecOptions) => {
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
