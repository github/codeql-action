import * as fs from "fs";
import path from "path";

import { ExecOptions } from "@actions/exec";
import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as toolcache from "@actions/tool-cache";
import * as safeWhich from "@chrisgavin/safe-which";
import test, { ExecutionContext } from "ava";
import del from "del";
import * as yaml from "js-yaml";
import nock from "nock";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { GitHubApiDetails } from "./api-client";
import * as codeql from "./codeql";
import { AugmentationProperties, Config } from "./config-utils";
import * as defaults from "./defaults.json";
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
} from "./testing-utils";
import * as util from "./util";
import { initializeEnvironment } from "./util";

setupTests(test);

const sampleGHAEApiDetails = {
  auth: "token",
  url: "https://example.githubenterprise.com",
  apiURL: "https://example.githubenterprise.com/api/v3",
};

let stubConfig: Config;

test.beforeEach(() => {
  initializeEnvironment("1.2.3");

  stubConfig = {
    languages: [Language.cpp],
    queries: {},
    pathsIgnore: [],
    paths: [],
    originalUserInput: {},
    tempDir: "",
    codeQLCmd: "",
    gitHubVersion: {
      type: util.GitHubVariant.DOTCOM,
    } as util.GitHubVersion,
    dbLocation: "",
    packs: {},
    debugMode: false,
    debugArtifactName: util.DEFAULT_DEBUG_ARTIFACT_NAME,
    debugDatabaseName: util.DEFAULT_DEBUG_DATABASE_NAME,
    augmentationProperties: {
      packsInputCombines: false,
      queriesInputCombines: false,
    },
    trapCaches: {},
    trapCacheDownloadTime: 0,
  };
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
  const requiredEnvParamStub = sinon.stub(util, "getRequiredEnvParam");
  requiredEnvParamStub.withArgs("GITHUB_SERVER_URL").returns(apiDetails.url);
  requiredEnvParamStub
    .withArgs("GITHUB_API_URL")
    .returns(apiDetails.apiURL || "");
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
        false,
      );

      t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
      t.is(result.toolsVersion, `0.0.0-${version}`);
      t.is(result.toolsSource, ToolsSource.Download);
      t.assert(Number.isInteger(result.toolsDownloadDurationMs));
    }

    t.is(toolcache.findAllVersions("CodeQL").length, 2);
  });
});

test("caches semantically versioned bundles using their semantic version number", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const url = mockBundleDownloadApi({
      tagName: `codeql-bundle-v2.14.0`,
      isPinned: false,
    });
    const result = await codeql.setupCodeQL(
      url,
      SAMPLE_DOTCOM_API_DETAILS,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      SAMPLE_DEFAULT_CLI_VERSION,
      getRunnerLogger(true),
      false,
    );

    t.is(toolcache.findAllVersions("CodeQL").length, 1);
    t.assert(toolcache.find("CodeQL", `2.14.0`));
    t.is(result.toolsVersion, `2.14.0`);
    t.is(result.toolsSource, ToolsSource.Download);
    t.assert(Number.isInteger(result.toolsDownloadDurationMs));
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
      false,
    );
    t.assert(toolcache.find("CodeQL", "0.0.0-20200610"));
    t.deepEqual(result.toolsVersion, "0.0.0-20200610");
    t.is(result.toolsSource, ToolsSource.Download);
    t.assert(Number.isInteger(result.toolsDownloadDurationMs));
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
  {
    cliVersion: "2.10.0+202006100101",
    expectedToolcacheVersion: "0.0.0-20200610",
  },
];

for (const {
  cliVersion,
  expectedToolcacheVersion,
} of EXPLICITLY_REQUESTED_BUNDLE_TEST_CASES) {
  test(`caches an explicitly requested bundle containing CLI ${cliVersion} as ${expectedToolcacheVersion}`, async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      mockApiDetails(SAMPLE_DOTCOM_API_DETAILS);
      sinon.stub(actionsUtil, "isRunningLocalAction").returns(true);

      const releaseApiMock = mockReleaseApi({
        assetNames: [`cli-version-${cliVersion}.txt`],
        tagName: "codeql-bundle-20200610",
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
        false,
      );
      t.assert(releaseApiMock.isDone(), "Releases API should have been called");
      t.assert(toolcache.find("CodeQL", expectedToolcacheVersion));
      t.deepEqual(result.toolsVersion, cliVersion);
      t.is(result.toolsSource, ToolsSource.Download);
      t.assert(Number.isInteger(result.toolsDownloadDurationMs));
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
          false,
        );
        t.is(result.toolsVersion, SAMPLE_DEFAULT_CLI_VERSION.cliVersion);
        t.is(result.toolsSource, ToolsSource.Toolcache);
        t.is(result.toolsDownloadDurationMs, undefined);
      });
    },
  );
}

for (const variant of [util.GitHubVariant.GHAE, util.GitHubVariant.GHES]) {
  test(`uses a cached bundle when no tools input is given on ${util.GitHubVariant[variant]}`, async (t) => {
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
        variant,
        {
          cliVersion: defaults.cliVersion,
          tagName: defaults.bundleVersion,
        },
        getRunnerLogger(true),
        false,
      );
      t.deepEqual(result.toolsVersion, "0.0.0-20200601");
      t.is(result.toolsSource, ToolsSource.Toolcache);
      t.is(result.toolsDownloadDurationMs, undefined);

      const cachedVersions = toolcache.findAllVersions("CodeQL");
      t.is(cachedVersions.length, 1);
    });
  });

  test(`downloads bundle if only an unpinned version is cached on ${util.GitHubVariant[variant]}`, async (t) => {
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
        variant,
        {
          cliVersion: defaults.cliVersion,
          tagName: defaults.bundleVersion,
        },
        getRunnerLogger(true),
        false,
      );
      t.deepEqual(result.toolsVersion, defaults.cliVersion);
      t.is(result.toolsSource, ToolsSource.Download);
      t.assert(Number.isInteger(result.toolsDownloadDurationMs));

      const cachedVersions = toolcache.findAllVersions("CodeQL");
      t.is(cachedVersions.length, 2);
    });
  });
}

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
      false,
    );
    t.deepEqual(result.toolsVersion, defaults.cliVersion);
    t.is(result.toolsSource, ToolsSource.Download);
    t.assert(Number.isInteger(result.toolsDownloadDurationMs));

    const cachedVersions = toolcache.findAllVersions("CodeQL");
    t.is(cachedVersions.length, 2);
  });
});

for (const isBundleVersionInUrl of [true, false]) {
  const inclusionString = isBundleVersionInUrl
    ? "includes"
    : "does not include";
  test(`download codeql bundle from github ae endpoint (URL ${inclusionString} bundle version)`, async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      const bundleAssetID = 10;

      const platform =
        process.platform === "win32"
          ? "win64"
          : process.platform === "linux"
          ? "linux64"
          : "osx64";
      const codeQLBundleName = `codeql-bundle-${platform}.tar.gz`;

      const eventualDownloadUrl = isBundleVersionInUrl
        ? `https://example.githubenterprise.com/github/codeql-action/releases/download/${defaults.bundleVersion}/${codeQLBundleName}`
        : `https://example.githubenterprise.com/api/v3/repos/github/codeql-action/releases/assets/${bundleAssetID}`;

      nock("https://example.githubenterprise.com")
        .get(
          `/api/v3/enterprise/code-scanning/codeql-bundle/find/${defaults.bundleVersion}`,
        )
        .reply(200, {
          assets: { [codeQLBundleName]: bundleAssetID },
        });

      nock("https://example.githubenterprise.com")
        .get(
          `/api/v3/enterprise/code-scanning/codeql-bundle/download/${bundleAssetID}`,
        )
        .reply(200, {
          url: eventualDownloadUrl,
        });

      nock("https://example.githubenterprise.com")
        .get(
          eventualDownloadUrl.replace(
            "https://example.githubenterprise.com",
            "",
          ),
        )
        .replyWithFile(
          200,
          path.join(__dirname, `/../src/testdata/codeql-bundle-pinned.tar.gz`),
        );

      mockApiDetails(sampleGHAEApiDetails);
      sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
      process.env["GITHUB_ACTION_REPOSITORY"] = "github/codeql-action";

      const result = await codeql.setupCodeQL(
        undefined,
        sampleGHAEApiDetails,
        tmpDir,
        util.GitHubVariant.GHAE,
        {
          cliVersion: defaults.cliVersion,
          tagName: defaults.bundleVersion,
        },
        getRunnerLogger(true),
        false,
      );

      t.is(result.toolsSource, ToolsSource.Download);
      t.assert(Number.isInteger(result.toolsDownloadDurationMs));

      const cachedVersions = toolcache.findAllVersions("CodeQL");
      t.is(cachedVersions.length, 1);
    });
  });
}

test("bundle URL from another repo is cached as 0.0.0-bundleVersion", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    mockApiDetails(SAMPLE_DOTCOM_API_DETAILS);
    sinon.stub(actionsUtil, "isRunningLocalAction").returns(true);
    const releasesApiMock = mockReleaseApi({
      assetNames: ["cli-version-2.12.2.txt"],
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
      false,
    );

    t.is(result.toolsVersion, "0.0.0-20230203");
    t.is(result.toolsSource, ToolsSource.Download);
    t.true(Number.isInteger(result.toolsDownloadDurationMs));

    const cachedVersions = toolcache.findAllVersions("CodeQL");
    t.is(cachedVersions.length, 1);
    t.is(cachedVersions[0], "0.0.0-20230203");

    t.false(releasesApiMock.isDone());
  });
});

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
    sinon
      .stub(codeqlObject, "getVersion")
      .resolves(makeVersionInfo(codeql.CODEQL_VERSION_INIT_WITH_QLCONFIG));

    await codeqlObject.databaseInitCluster(
      { ...stubConfig, tempDir },
      "",
      undefined,
      "/path/to/qlconfig.yml",
      getRunnerLogger(true),
    );

    const args = runnerConstructorStub.firstCall.args[1];
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

test("passes a code scanning config BUT NOT a qlconfig to the CLI for CodeQL v2.12.2", async (t: ExecutionContext<unknown>) => {
  await util.withTmpDir(async (tempDir) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.12.2"));

    await codeqlObject.databaseInitCluster(
      { ...stubConfig, tempDir },
      "",
      undefined,
      "/path/to/qlconfig.yml",
      getRunnerLogger(true),
    );

    const args = runnerConstructorStub.firstCall.args[1] as any[];
    // should have used a config file
    const hasCodeScanningConfigArg = args.some((arg: string) =>
      arg.startsWith("--codescanning-config="),
    );
    t.true(
      hasCodeScanningConfigArg,
      "Should have injected a codescanning config",
    );

    // should not have passed a qlconfig file
    const hasQlconfigArg = args.some((arg: string) =>
      arg.startsWith("--qlconfig-file="),
    );
    t.false(hasQlconfigArg, "should NOT have injected a qlconfig");
  });
});

test("does not pass a qlconfig to the CLI when it is undefined", async (t: ExecutionContext<unknown>) => {
  await util.withTmpDir(async (tempDir) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon
      .stub(codeqlObject, "getVersion")
      .resolves(makeVersionInfo(codeql.CODEQL_VERSION_INIT_WITH_QLCONFIG));

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
    codeqlVersion: "2.15.0",
    githubVersion: {
      type: util.GitHubVariant.DOTCOM,
    },
    flagPassed: true,
    negativeFlagPassed: false,
  },
  {
    codeqlVersion: "2.15.0",
    githubVersion: {
      type: util.GitHubVariant.GHES,
      version: "3.9.0",
    },
    flagPassed: true,
    negativeFlagPassed: false,
  },
  {
    codeqlVersion: "2.15.0",
    githubVersion: {
      type: util.GitHubVariant.GHES,
      version: "3.8.6",
    },
    flagPassed: false,
    negativeFlagPassed: true,
  },
  {
    codeqlVersion: "2.14.6",
    githubVersion: {
      type: util.GitHubVariant.DOTCOM,
    },
    flagPassed: false,
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
  } for CodeQL CLI v${codeqlVersion} and ${
    util.GitHubVariant[githubVersion.type]
  } ${githubVersion.version ? ` ${githubVersion.version}` : ""}`, async (t) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon
      .stub(codeqlObject, "getVersion")
      .resolves(makeVersionInfo(codeqlVersion));
    // safeWhich throws because of the test CodeQL object.
    sinon.stub(safeWhich, "safeWhich").resolves("");
    await codeqlObject.databaseInterpretResults(
      "",
      [],
      "",
      "",
      "",
      "-v",
      "",
      Object.assign({}, stubConfig, { gitHubVersion: githubVersion }),
      createFeatures([]),
      getRunnerLogger(true),
    );
    t.is(
      runnerConstructorStub.firstCall.args[1].includes(
        "--new-analysis-summary",
      ),
      flagPassed,
      `--new-analysis-summary should${flagPassed ? "" : "n't"} be passed`,
    );
    t.is(
      runnerConstructorStub.firstCall.args[1].includes(
        "--no-new-analysis-summary",
      ),
      negativeFlagPassed,
      `--no-new-analysis-summary should${
        negativeFlagPassed ? "" : "n't"
      } be passed`,
    );
  });
}

test("database finalize recognises JavaScript no code found error on CodeQL 2.11.6", async (t) => {
  stubToolRunnerConstructor(
    1,
    `2020-09-07T17:39:53.9050522Z [2020-09-07 17:39:53] [build] Done extracting /opt/hostedtoolcache/CodeQL/0.0.0-20200630/x64/codeql/javascript/tools/data/externs/web/ie_vml.js (3 ms)
    2020-09-07T17:39:53.9051849Z [2020-09-07 17:39:53] [build-err] No JavaScript or TypeScript code found.
    2020-09-07T17:39:53.9052444Z [2020-09-07 17:39:53] [build-err] No JavaScript or TypeScript code found.
    2020-09-07T17:39:53.9251124Z [2020-09-07 17:39:53] [ERROR] Spawned process exited abnormally (code 255; tried to run: [/opt/hostedtoolcache/CodeQL/0.0.0-20200630/x64/codeql/javascript/tools/autobuild.sh])`,
  );
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.11.6"));
  // safeWhich throws because of the test CodeQL object.
  sinon.stub(safeWhich, "safeWhich").resolves("");

  await t.throwsAsync(
    async () => await codeqlObject.finalizeDatabase("", "", ""),
    {
      message:
        "No code found during the build. Please see: " +
        "https://gh.io/troubleshooting-code-scanning/no-source-code-seen-during-build",
    },
  );
});

test("database finalize overrides no code found error on CodeQL 2.11.6", async (t) => {
  stubToolRunnerConstructor(32);
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.11.6"));
  // safeWhich throws because of the test CodeQL object.
  sinon.stub(safeWhich, "safeWhich").resolves("");

  await t.throwsAsync(
    async () => await codeqlObject.finalizeDatabase("", "", ""),
    {
      message:
        "No code found during the build. Please see: " +
        "https://gh.io/troubleshooting-code-scanning/no-source-code-seen-during-build",
    },
  );
});

test("database finalize does not override no code found error on CodeQL 2.12.4", async (t) => {
  const cliMessage =
    "CodeQL did not detect any code written in languages supported by CodeQL. Review our troubleshooting guide at " +
    "https://gh.io/troubleshooting-code-scanning/no-source-code-seen-during-build.";
  stubToolRunnerConstructor(32, cliMessage);
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.12.4"));
  // safeWhich throws because of the test CodeQL object.
  sinon.stub(safeWhich, "safeWhich").resolves("");

  await t.throwsAsync(
    async () =>
      await codeqlObject.finalizeDatabase("db", "--threads=2", "--ram=2048"),
    {
      message:
        'Encountered a fatal error while running "codeql-for-testing database finalize --finalize-dataset --threads=2 --ram=2048 db". ' +
        `Exit code was 32 and last log line was: ${cliMessage} See the logs for more details.`,
    },
  );
});

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
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.12.4"));
  // safeWhich throws because of the test CodeQL object.
  sinon.stub(safeWhich, "safeWhich").resolves("");

  await t.throwsAsync(
    async () =>
      await codeqlObject.finalizeDatabase("db", "--threads=2", "--ram=2048"),
    {
      message:
        'Encountered a fatal error while running "codeql-for-testing database finalize --finalize-dataset --threads=2 --ram=2048 db". ' +
        `Exit code was 32 and error was: ${datasetImportError}. Context: ${heapError}. See the logs for more details.`,
    },
  );
});

test("runTool outputs last line of stderr if fatal error could not be found", async (t) => {
  const cliStderr = "line1\nline2\nline3\nline4\nline5";
  stubToolRunnerConstructor(32, cliStderr);
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.12.4"));
  // safeWhich throws because of the test CodeQL object.
  sinon.stub(safeWhich, "safeWhich").resolves("");

  await t.throwsAsync(
    async () =>
      await codeqlObject.finalizeDatabase("db", "--threads=2", "--ram=2048"),
    {
      message:
        'Encountered a fatal error while running "codeql-for-testing database finalize --finalize-dataset --threads=2 --ram=2048 db". ' +
        "Exit code was 32 and last log line was: line5. See the logs for more details.",
    },
  );
});

export function stubToolRunnerConstructor(
  exitCode: number = 0,
  stderr?: string,
): sinon.SinonStub<any[], toolrunner.ToolRunner> {
  const runnerObjectStub = sinon.createStubInstance(toolrunner.ToolRunner);
  const runnerConstructorStub = sinon.stub(toolrunner, "ToolRunner");
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
