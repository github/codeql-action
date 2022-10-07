import * as fs from "fs";
import * as path from "path";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as toolcache from "@actions/tool-cache";
import test, { ExecutionContext } from "ava";
import del from "del";
import * as yaml from "js-yaml";
import nock from "nock";
import * as sinon from "sinon";

import { GitHubApiDetails } from "./api-client";
import * as codeql from "./codeql";
import { AugmentationProperties, Config } from "./config-utils";
import * as defaults from "./defaults.json";
import { Feature, FeatureEnablement } from "./feature-flags";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import {
  setupTests,
  setupActionsVars,
  createFeatureFlags,
} from "./testing-utils";
import * as util from "./util";
import { Mode, initializeEnvironment } from "./util";

setupTests(test);

const sampleApiDetails = {
  auth: "token",
  url: "https://github.com",
  apiURL: undefined,
  registriesAuthTokens: undefined,
};

const sampleGHAEApiDetails = {
  auth: "token",
  url: "https://example.githubenterprise.com",
  apiURL: undefined,
  registriesAuthTokens: undefined,
};

let stubConfig: Config;

test.beforeEach(() => {
  initializeEnvironment(Mode.actions, "1.2.3");

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

async function mockApiAndSetupCodeQL({
  apiDetails,
  featureFlags,
  isPinned,
  tmpDir,
  toolsInput,
  version,
}: {
  apiDetails?: GitHubApiDetails;
  featureFlags?: FeatureEnablement;
  isPinned?: boolean;
  tmpDir: string;
  toolsInput?: { input?: string };
  version: string;
}): Promise<{ codeql: codeql.CodeQL; toolsVersion: string }> {
  const platform =
    process.platform === "win32"
      ? "win64"
      : process.platform === "linux"
      ? "linux64"
      : "osx64";

  const baseUrl = apiDetails?.url ?? "https://example.com";
  const relativeUrl = apiDetails
    ? `/github/codeql-action/releases/download/${version}/codeql-bundle-${platform}.tar.gz`
    : `/download/codeql-bundle-${version}/codeql-bundle.tar.gz`;

  nock(baseUrl)
    .get(relativeUrl)
    .replyWithFile(
      200,
      path.join(
        __dirname,
        `/../src/testdata/codeql-bundle${isPinned ? "-pinned" : ""}.tar.gz`
      )
    );

  return await codeql.setupCodeQL(
    toolsInput ? toolsInput.input : `${baseUrl}${relativeUrl}`,
    apiDetails ?? sampleApiDetails,
    tmpDir,
    util.GitHubVariant.DOTCOM,
    featureFlags ?? createFeatureFlags([]),
    getRunnerLogger(true),
    false
  );
}

test("download codeql bundle cache", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const versions = ["20200601", "20200610"];

    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];

      const codeQLConfig = await mockApiAndSetupCodeQL({ version, tmpDir });
      t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
      t.deepEqual(codeQLConfig.toolsVersion, version);
    }

    t.is(toolcache.findAllVersions("CodeQL").length, 2);
  });
});

test("download codeql bundle cache explicitly requested with pinned different version cached", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const pinnedCodeQLConfig = await mockApiAndSetupCodeQL({
      version: "20200601",
      isPinned: true,
      tmpDir,
    });
    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));
    t.deepEqual(pinnedCodeQLConfig.toolsVersion, "20200601");

    const unpinnedCodeQLConfig = await mockApiAndSetupCodeQL({
      version: "20200610",
      tmpDir,
    });
    t.assert(toolcache.find("CodeQL", "0.0.0-20200610"));
    t.deepEqual(unpinnedCodeQLConfig.toolsVersion, "20200610");
  });
});

test("don't download codeql bundle cache with pinned different version cached", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const pinnedCodeQLConfig = await mockApiAndSetupCodeQL({
      version: "20200601",
      isPinned: true,
      tmpDir,
    });

    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));
    t.deepEqual(pinnedCodeQLConfig.toolsVersion, "20200601");

    const codeQLConfig = await codeql.setupCodeQL(
      undefined,
      sampleApiDetails,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      createFeatureFlags([]),
      getRunnerLogger(true),
      false
    );
    t.deepEqual(codeQLConfig.toolsVersion, "0.0.0-20200601");

    const cachedVersions = toolcache.findAllVersions("CodeQL");

    t.is(cachedVersions.length, 1);
  });
});

test("download codeql bundle cache with different version cached (not pinned)", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const cachedCodeQLConfig = await mockApiAndSetupCodeQL({
      version: "20200601",
      tmpDir,
    });

    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));
    t.deepEqual(cachedCodeQLConfig.toolsVersion, "20200601");

    const codeQLConfig = await mockApiAndSetupCodeQL({
      version: defaults.bundleVersion,
      tmpDir,
      apiDetails: sampleApiDetails,
      toolsInput: { input: undefined },
    });
    t.deepEqual(
      codeQLConfig.toolsVersion,
      defaults.bundleVersion.replace("codeql-bundle-", "")
    );

    const cachedVersions = toolcache.findAllVersions("CodeQL");

    t.is(cachedVersions.length, 2);
  });
});

test('download codeql bundle cache with pinned different version cached if "latest" tools specified', async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const pinnedCodeQLConfig = await mockApiAndSetupCodeQL({
      version: "20200601",
      isPinned: true,
      tmpDir,
    });

    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));
    t.deepEqual(pinnedCodeQLConfig.toolsVersion, "20200601");

    const latestCodeQLConfig = await mockApiAndSetupCodeQL({
      version: defaults.bundleVersion,
      apiDetails: sampleApiDetails,
      toolsInput: { input: "latest" },
      tmpDir,
    });
    t.deepEqual(
      latestCodeQLConfig.toolsVersion,
      defaults.bundleVersion.replace("codeql-bundle-", "")
    );

    const cachedVersions = toolcache.findAllVersions("CodeQL");

    t.is(cachedVersions.length, 2);
  });
});

const TOOLCACHE_BYPASS_TEST_CASES: Array<
  [boolean, string | undefined, boolean]
> = [
  [true, undefined, true],
  [false, undefined, false],
  [
    true,
    "https://github.com/github/codeql-action/releases/download/codeql-bundle-20200601/codeql-bundle.tar.gz",
    false,
  ],
];

for (const [
  isFeatureFlagEnabled,
  toolsInput,
  shouldToolcacheBeBypassed,
] of TOOLCACHE_BYPASS_TEST_CASES) {
  test(`download codeql bundle ${
    shouldToolcacheBeBypassed ? "bypasses" : "does not bypass"
  } toolcache when feature flag ${
    isFeatureFlagEnabled ? "enabled" : "disabled"
  } and tools: ${toolsInput} passed`, async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);

      await mockApiAndSetupCodeQL({
        version: "codeql-bundle-20200601",
        apiDetails: sampleApiDetails,
        isPinned: true,
        tmpDir,
      });

      t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));

      await mockApiAndSetupCodeQL({
        version: defaults.bundleVersion,
        apiDetails: sampleApiDetails,
        featureFlags: createFeatureFlags(
          isFeatureFlagEnabled ? [Feature.BypassToolcacheEnabled] : []
        ),
        toolsInput: { input: toolsInput },
        tmpDir,
      });

      const cachedVersions = toolcache.findAllVersions("CodeQL");

      t.is(cachedVersions.length, shouldToolcacheBeBypassed ? 2 : 1);
    });
  });
}

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

    await codeql.setupCodeQL(
      undefined,
      sampleGHAEApiDetails,
      tmpDir,
      util.GitHubVariant.GHAE,
      createFeatureFlags([]),
      getRunnerLogger(true),
      false
    );

    const cachedVersions = toolcache.findAllVersions("CodeQL");
    t.is(cachedVersions.length, 1);
  });
});

test("parse codeql bundle url version", (t) => {
  t.deepEqual(
    codeql.getCodeQLURLVersion(
      "https://github.com/.../codeql-bundle-20200601/..."
    ),
    "20200601"
  );
});

test("convert to semver", (t) => {
  const tests = {
    "20200601": "0.0.0-20200601",
    "20200601.0": "0.0.0-20200601.0",
    "20200601.0.0": "20200601.0.0",
    "1.2.3": "1.2.3",
    "1.2.3-alpha": "1.2.3-alpha",
    "1.2.3-beta.1": "1.2.3-beta.1",
  };

  for (const [version, expectedVersion] of Object.entries(tests)) {
    try {
      const parsedVersion = codeql.convertToSemVer(
        version,
        getRunnerLogger(true)
      );
      t.deepEqual(parsedVersion, expectedVersion);
    } catch (e) {
      t.fail(e instanceof Error ? e.message : String(e));
    }
  }
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

test("getCodeQLActionRepository", (t) => {
  const logger = getRunnerLogger(true);

  initializeEnvironment(Mode.runner, "1.2.3");
  const repoActions = codeql.getCodeQLActionRepository(logger);
  t.deepEqual(repoActions, "github/codeql-action");

  initializeEnvironment(Mode.actions, "1.2.3");

  // isRunningLocalAction() === true
  delete process.env["GITHUB_ACTION_REPOSITORY"];
  process.env["RUNNER_TEMP"] = path.dirname(__dirname);
  const repoLocalRunner = codeql.getCodeQLActionRepository(logger);
  t.deepEqual(repoLocalRunner, "github/codeql-action");

  process.env["GITHUB_ACTION_REPOSITORY"] = "xxx/yyy";
  const repoEnv = codeql.getCodeQLActionRepository(logger);
  t.deepEqual(repoEnv, "xxx/yyy");
});

test("databaseInterpretResults() does not set --sarif-add-query-help for 2.7.0", async (t) => {
  const runnerConstructorStub = stubToolRunnerConstructor();
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves("2.7.0");
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
      undefined,
      createFeatureFlags([]),
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
        .resolves(codeql.CODEQL_VERSION_CONFIG_FILES);

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
        createFeatureFlags([Feature.CliConfigFileEnabled]),
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
    packs: ["codeql/javascript-experimental-atm-queries@~0.3.0"],
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
        "codeql/javascript-experimental-atm-queries@~0.3.0",
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
      javascript: ["codeql/javascript-experimental-atm-queries@~0.3.0"],
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
    packs: ["xxx", "yyy", "codeql/javascript-experimental-atm-queries@~0.3.0"],
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
      .resolves(codeql.CODEQL_VERSION_CONFIG_FILES);

    await codeqlObject.databaseInitCluster(
      stubConfig,
      "",
      undefined,
      undefined,
      createFeatureFlags([]),
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
