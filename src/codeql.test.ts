import * as fs from "fs";
import path from "path";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as toolcache from "@actions/tool-cache";
import * as safeWhich from "@chrisgavin/safe-which";
import test, { ExecutionContext } from "ava";
import del from "del";
import * as yaml from "js-yaml";
import nock from "nock";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as api from "./api-client";
import { GitHubApiDetails } from "./api-client";
import * as codeql from "./codeql";
import { AugmentationProperties, Config } from "./config-utils";
import * as defaults from "./defaults.json";
import {
  CodeQLDefaultVersionInfo,
  Feature,
  featureConfig,
} from "./feature-flags";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import { setupTests, createFeatures, setupActionsVars } from "./testing-utils";
import * as util from "./util";
import { initializeEnvironment } from "./util";

setupTests(test);

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

const SAMPLE_DEFAULT_CLI_VERSION: CodeQLDefaultVersionInfo = {
  cliVersion: "2.0.0",
  variant: util.GitHubVariant.DOTCOM,
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
function mockDownloadApi({
  apiDetails = sampleApiDetails,
  isPinned,
  tagName,
}: {
  apiDetails?: GitHubApiDetails;
  isPinned?: boolean;
  tagName: string;
}): string {
  const platform =
    process.platform === "win32"
      ? "win64"
      : process.platform === "linux"
      ? "linux64"
      : "osx64";

  const baseUrl = apiDetails?.url ?? "https://example.com";
  const relativeUrl = apiDetails
    ? `/github/codeql-action/releases/download/${tagName}/codeql-bundle-${platform}.tar.gz`
    : `/download/${tagName}/codeql-bundle.tar.gz`;

  nock(baseUrl)
    .get(relativeUrl)
    .replyWithFile(
      200,
      path.join(
        __dirname,
        `/../src/testdata/codeql-bundle${isPinned ? "-pinned" : ""}.tar.gz`
      )
    );

  return `${baseUrl}${relativeUrl}`;
}

async function installIntoToolcache({
  apiDetails = sampleApiDetails,
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
  const url = mockDownloadApi({ apiDetails, isPinned, tagName });
  await codeql.setupCodeQL(
    cliVersion !== undefined ? undefined : url,
    apiDetails,
    tmpDir,
    util.GitHubVariant.GHES,
    false,
    cliVersion !== undefined
      ? { cliVersion, tagName, variant: util.GitHubVariant.GHES }
      : SAMPLE_DEFAULT_CLI_VERSION,
    getRunnerLogger(true),
    false
  );
}

function mockReleaseApi({
  apiDetails = sampleApiDetails,
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

      const url = mockDownloadApi({
        tagName: `codeql-bundle-${version}`,
        isPinned: false,
      });
      const result = await codeql.setupCodeQL(
        url,
        sampleApiDetails,
        tmpDir,
        util.GitHubVariant.DOTCOM,
        false,
        SAMPLE_DEFAULT_CLI_VERSION,
        getRunnerLogger(true),
        false
      );
      t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
      t.is(result.toolsVersion, `0.0.0-${version}`);
    }

    t.is(toolcache.findAllVersions("CodeQL").length, 2);
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

    const url = mockDownloadApi({
      tagName: "codeql-bundle-20200610",
    });
    const result = await codeql.setupCodeQL(
      url,
      sampleApiDetails,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      false,
      SAMPLE_DEFAULT_CLI_VERSION,
      getRunnerLogger(true),
      false
    );
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

for (const {
  cliVersion,
  expectedToolcacheVersion,
} of EXPLICITLY_REQUESTED_BUNDLE_TEST_CASES) {
  test(`caches an explicitly requested bundle containing CLI ${cliVersion} as ${expectedToolcacheVersion}`, async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      mockApiDetails(sampleApiDetails);
      sinon.stub(actionsUtil, "isRunningLocalAction").returns(true);

      const releaseApiMock = mockReleaseApi({
        assetNames: [`cli-version-${cliVersion}.txt`],
        tagName: "codeql-bundle-20200610",
      });
      const url = mockDownloadApi({
        tagName: "codeql-bundle-20200610",
      });

      const result = await codeql.setupCodeQL(
        url,
        sampleApiDetails,
        tmpDir,
        util.GitHubVariant.DOTCOM,
        false,
        SAMPLE_DEFAULT_CLI_VERSION,
        getRunnerLogger(true),
        false
      );
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
  test(`uses default version on Dotcom when default version bundle ${tagName} is ${
    isCached ? "" : "not "
  }cached`, async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      if (isCached) {
        await installIntoToolcache({
          cliVersion: toolcacheCliVersion,
          tagName,
          isPinned: true,
          tmpDir,
        });
      } else {
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

      const result = await codeql.setupCodeQL(
        undefined,
        sampleApiDetails,
        tmpDir,
        util.GitHubVariant.DOTCOM,
        false,
        SAMPLE_DEFAULT_CLI_VERSION,
        getRunnerLogger(true),
        false
      );
      t.is(result.toolsVersion, SAMPLE_DEFAULT_CLI_VERSION.cliVersion);
    });
  });
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
        sampleApiDetails,
        tmpDir,
        variant,
        false,
        {
          cliVersion: defaults.cliVersion,
          tagName: defaults.bundleVersion,
          variant,
        },
        getRunnerLogger(true),
        false
      );
      t.deepEqual(result.toolsVersion, "0.0.0-20200601");

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

      mockDownloadApi({
        tagName: defaults.bundleVersion,
      });
      const result = await codeql.setupCodeQL(
        undefined,
        sampleApiDetails,
        tmpDir,
        variant,
        false,
        {
          cliVersion: defaults.cliVersion,
          tagName: defaults.bundleVersion,
          variant,
        },
        getRunnerLogger(true),
        false
      );
      t.deepEqual(result.toolsVersion, defaults.cliVersion);

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

    mockDownloadApi({
      tagName: defaults.bundleVersion,
    });
    const result = await codeql.setupCodeQL(
      "latest",
      sampleApiDetails,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      false,
      SAMPLE_DEFAULT_CLI_VERSION,
      getRunnerLogger(true),
      false
    );
    t.deepEqual(result.toolsVersion, defaults.cliVersion);

    const cachedVersions = toolcache.findAllVersions("CodeQL");
    t.is(cachedVersions.length, 2);
  });
});

test("download codeql bundle from github ae endpoint", async (t) => {
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

    nock("https://example.githubenterprise.com")
      .get(
        `/api/v3/enterprise/code-scanning/codeql-bundle/find/${defaults.bundleVersion}`
      )
      .reply(200, {
        assets: { [codeQLBundleName]: bundleAssetID },
      });

    nock("https://example.githubenterprise.com")
      .get(
        `/api/v3/enterprise/code-scanning/codeql-bundle/download/${bundleAssetID}`
      )
      .reply(200, {
        url: `https://example.githubenterprise.com/github/codeql-action/releases/download/${defaults.bundleVersion}/${codeQLBundleName}`,
      });

    nock("https://example.githubenterprise.com")
      .get(
        `/github/codeql-action/releases/download/${defaults.bundleVersion}/${codeQLBundleName}`
      )
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle-pinned.tar.gz`)
      );

    mockApiDetails(sampleGHAEApiDetails);
    sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
    process.env["GITHUB_ACTION_REPOSITORY"] = "github/codeql-action";

    await codeql.setupCodeQL(
      undefined,
      sampleGHAEApiDetails,
      tmpDir,
      util.GitHubVariant.GHAE,
      false,
      {
        cliVersion: defaults.cliVersion,
        tagName: defaults.bundleVersion,
        variant: util.GitHubVariant.GHAE,
      },
      getRunnerLogger(true),
      false
    );

    const cachedVersions = toolcache.findAllVersions("CodeQL");
    t.is(cachedVersions.length, 1);
  });
});

test("getExtraOptions works for explicit paths", (t) => {
  t.deepEqual(codeql.getExtraOptions({}, ["foo"], []), []);

  t.deepEqual(codeql.getExtraOptions({ foo: [42] }, ["foo"], []), ["42"]);

  t.deepEqual(
    codeql.getExtraOptions({ foo: { bar: [42] } }, ["foo", "bar"], []),
    ["42"]
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
      []
    )
  );
});

test("databaseInterpretResults() does not set --sarif-add-query-help for 2.7.0", async (t) => {
  const runnerConstructorStub = stubToolRunnerConstructor();
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves("2.7.0");
  // safeWhich throws because of the test CodeQL object.
  sinon.stub(safeWhich, "safeWhich").resolves("");
  await codeqlObject.databaseInterpretResults("", [], "", "", "", "-v", "");
  t.false(
    runnerConstructorStub.firstCall.args[1].includes("--sarif-add-query-help"),
    "--sarif-add-query-help should be absent, but it is present"
  );
});

test("databaseInterpretResults() sets --sarif-add-query-help for 2.7.1", async (t) => {
  const runnerConstructorStub = stubToolRunnerConstructor();
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves("2.7.1");
  // safeWhich throws because of the test CodeQL object.
  sinon.stub(safeWhich, "safeWhich").resolves("");
  await codeqlObject.databaseInterpretResults("", [], "", "", "", "-v", "");
  t.true(
    runnerConstructorStub.firstCall.args[1].includes("--sarif-add-query-help"),
    "--sarif-add-query-help should be present, but it is absent"
  );
});

test("databaseInitCluster() without injected codescanning config", async (t) => {
  await util.withTmpDir(async (tempDir) => {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon.stub(codeqlObject, "getVersion").resolves("2.8.1");
    // safeWhich throws because of the test CodeQL object.
    sinon.stub(safeWhich, "safeWhich").resolves("");

    const thisStubConfig: Config = {
      ...stubConfig,
      tempDir,
      augmentationProperties: {
        injectedMlQueries: false,
        queriesInputCombines: false,
        packsInputCombines: false,
      },
    };

    await codeqlObject.databaseInitCluster(
      thisStubConfig,
      "",
      undefined,
      createFeatures([]),
      getRunnerLogger(true)
    );

    const args = runnerConstructorStub.firstCall.args[1];
    // should NOT have used an config file
    const configArg = args.find((arg: string) =>
      arg.startsWith("--codescanning-config=")
    );
    t.falsy(configArg, "Should have injected a codescanning config");
  });
});

// Test macro for ensuring different variants of injected augmented configurations
const injectedConfigMacro = test.macro({
  exec: async (
    t: ExecutionContext<unknown>,
    augmentationProperties: AugmentationProperties,
    configOverride: Partial<Config>,
    expectedConfig: any
  ) => {
    await util.withTmpDir(async (tempDir) => {
      const runnerConstructorStub = stubToolRunnerConstructor();
      const codeqlObject = await codeql.getCodeQLForTesting();
      sinon
        .stub(codeqlObject, "getVersion")
        .resolves(featureConfig[Feature.CliConfigFileEnabled].minimumVersion);

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
        createFeatures([Feature.CliConfigFileEnabled]),
        getRunnerLogger(true)
      );

      const args = runnerConstructorStub.firstCall.args[1];
      // should have used an config file
      const configArg = args.find((arg: string) =>
        arg.startsWith("--codescanning-config=")
      );
      t.truthy(configArg, "Should have injected a codescanning config");
      const configFile = configArg.split("=")[1];
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
    injectedMlQueries: false,
    queriesInputCombines: false,
    packsInputCombines: false,
  },
  {},
  {}
);

test(
  "injected ML queries",
  injectedConfigMacro,
  {
    injectedMlQueries: true,
    queriesInputCombines: false,
    packsInputCombines: false,
  },
  {},
  {
    packs: ["codeql/javascript-experimental-atm-queries@~0.4.0"],
  }
);

test(
  "injected ML queries with existing packs",
  injectedConfigMacro,
  {
    injectedMlQueries: true,
    queriesInputCombines: false,
    packsInputCombines: false,
  },
  {
    originalUserInput: {
      packs: { javascript: ["codeql/something-else"] },
    },
  },
  {
    packs: {
      javascript: [
        "codeql/something-else",
        "codeql/javascript-experimental-atm-queries@~0.4.0",
      ],
    },
  }
);

test(
  "injected ML queries with existing packs of different language",
  injectedConfigMacro,
  {
    injectedMlQueries: true,
    queriesInputCombines: false,
    packsInputCombines: false,
  },
  {
    originalUserInput: {
      packs: { cpp: ["codeql/something-else"] },
    },
  },
  {
    packs: {
      cpp: ["codeql/something-else"],
      javascript: ["codeql/javascript-experimental-atm-queries@~0.4.0"],
    },
  }
);

test(
  "injected packs from input",
  injectedConfigMacro,
  {
    injectedMlQueries: false,
    queriesInputCombines: false,
    packsInputCombines: false,
    packsInput: ["xxx", "yyy"],
  },
  {},
  {
    packs: ["xxx", "yyy"],
  }
);

test(
  "injected packs from input with existing packs combines",
  injectedConfigMacro,
  {
    injectedMlQueries: false,
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
  }
);

test(
  "injected packs from input with existing packs overrides",
  injectedConfigMacro,
  {
    injectedMlQueries: false,
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
  }
);

test(
  "injected packs from input with existing packs overrides and ML model inject",
  injectedConfigMacro,
  {
    injectedMlQueries: true,
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
    packs: ["xxx", "yyy", "codeql/javascript-experimental-atm-queries@~0.4.0"],
  }
);

// similar, but with queries
test(
  "injected queries from input",
  injectedConfigMacro,
  {
    injectedMlQueries: false,
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
  }
);

test(
  "injected queries from input overrides",
  injectedConfigMacro,
  {
    injectedMlQueries: false,
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
  }
);

test(
  "injected queries from input combines",
  injectedConfigMacro,
  {
    injectedMlQueries: false,
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
  }
);

test(
  "injected queries from input combines 2",
  injectedConfigMacro,
  {
    injectedMlQueries: false,
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
  }
);

test(
  "injected queries and packs, but empty",
  injectedConfigMacro,
  {
    injectedMlQueries: false,
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
  {}
);

test("does not use injected config", async (t: ExecutionContext<unknown>) => {
  const origCODEQL_PASS_CONFIG_TO_CLI = process.env.CODEQL_PASS_CONFIG_TO_CLI;
  process.env["CODEQL_PASS_CONFIG_TO_CLI"] = "false";

  try {
    const runnerConstructorStub = stubToolRunnerConstructor();
    const codeqlObject = await codeql.getCodeQLForTesting();
    sinon
      .stub(codeqlObject, "getVersion")
      .resolves(featureConfig[Feature.CliConfigFileEnabled].minimumVersion);

    await codeqlObject.databaseInitCluster(
      stubConfig,
      "",
      undefined,
      createFeatures([]),
      getRunnerLogger(true)
    );

    const args = runnerConstructorStub.firstCall.args[1];
    // should have used an config file
    const configArg = args.find((arg: string) =>
      arg.startsWith("--codescanning-config=")
    );
    t.falsy(configArg, "Should NOT have injected a codescanning config");
  } finally {
    process.env["CODEQL_PASS_CONFIG_TO_CLI"] = origCODEQL_PASS_CONFIG_TO_CLI;
  }
});

test("databaseInterpretResults() sets --sarif-add-baseline-file-info for 2.11.3", async (t) => {
  const runnerConstructorStub = stubToolRunnerConstructor();
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves("2.11.3");
  // safeWhich throws because of the test CodeQL object.
  sinon.stub(safeWhich, "safeWhich").resolves("");
  await codeqlObject.databaseInterpretResults("", [], "", "", "", "-v", "");
  t.true(
    runnerConstructorStub.firstCall.args[1].includes(
      "--sarif-add-baseline-file-info"
    ),
    "--sarif-add-baseline-file-info should be present, but it is absent"
  );
});

test("databaseInterpretResults() does not set --sarif-add-baseline-file-info for 2.11.2", async (t) => {
  const runnerConstructorStub = stubToolRunnerConstructor();
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves("2.11.2");
  // safeWhich throws because of the test CodeQL object.
  sinon.stub(safeWhich, "safeWhich").resolves("");
  await codeqlObject.databaseInterpretResults("", [], "", "", "", "-v", "");
  t.false(
    runnerConstructorStub.firstCall.args[1].includes(
      "--sarif-add-baseline-file-info"
    ),
    "--sarif-add-baseline-file-info must be absent, but it is present"
  );
});

export function stubToolRunnerConstructor(): sinon.SinonStub<
  any[],
  toolrunner.ToolRunner
> {
  const runnerObjectStub = sinon.createStubInstance(toolrunner.ToolRunner);
  runnerObjectStub.exec.resolves(0);
  const runnerConstructorStub = sinon.stub(toolrunner, "ToolRunner");
  runnerConstructorStub.returns(runnerObjectStub);
  return runnerConstructorStub;
}
