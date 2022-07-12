import * as path from "path";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as toolcache from "@actions/tool-cache";
import test from "ava";
import nock from "nock";
import * as sinon from "sinon";

import * as codeql from "./codeql";
import { Config } from "./config-utils";
import * as defaults from "./defaults.json";
import { createFeatureFlags, FeatureFlag } from "./feature-flags";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import { setupTests, setupActionsVars } from "./testing-utils";
import * as util from "./util";
import { Mode, initializeEnvironment } from "./util";

setupTests(test);

const sampleApiDetails = {
  auth: "token",
  url: "https://github.com",
};

const sampleGHAEApiDetails = {
  auth: "token",
  url: "https://example.githubenterprise.com",
};

test.beforeEach(() => {
  initializeEnvironment(Mode.actions, "1.2.3");
});

test("download codeql bundle cache", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    const versions = ["20200601", "20200610"];

    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];

      nock("https://example.com")
        .get(`/download/codeql-bundle-${version}/codeql-bundle.tar.gz`)
        .replyWithFile(
          200,
          path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
        );

      await codeql.setupCodeQL(
        `https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`,
        sampleApiDetails,
        tmpDir,
        tmpDir,
        util.GitHubVariant.DOTCOM,
        getRunnerLogger(true),
        false
      );

      t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
    }

    const cachedVersions = toolcache.findAllVersions("CodeQL");

    t.is(cachedVersions.length, 2);
  });
});

test("download codeql bundle cache explicitly requested with pinned different version cached", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    nock("https://example.com")
      .get(`/download/codeql-bundle-20200601/codeql-bundle.tar.gz`)
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle-pinned.tar.gz`)
      );

    await codeql.setupCodeQL(
      "https://example.com/download/codeql-bundle-20200601/codeql-bundle.tar.gz",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      getRunnerLogger(true),
      false
    );

    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));

    nock("https://example.com")
      .get(`/download/codeql-bundle-20200610/codeql-bundle.tar.gz`)
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
      );

    await codeql.setupCodeQL(
      "https://example.com/download/codeql-bundle-20200610/codeql-bundle.tar.gz",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      getRunnerLogger(true),
      false
    );

    t.assert(toolcache.find("CodeQL", "0.0.0-20200610"));
  });
});

test("don't download codeql bundle cache with pinned different version cached", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    nock("https://example.com")
      .get(`/download/codeql-bundle-20200601/codeql-bundle.tar.gz`)
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle-pinned.tar.gz`)
      );

    await codeql.setupCodeQL(
      "https://example.com/download/codeql-bundle-20200601/codeql-bundle.tar.gz",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      getRunnerLogger(true),
      false
    );

    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));

    await codeql.setupCodeQL(
      undefined,
      sampleApiDetails,
      tmpDir,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      getRunnerLogger(true),
      false
    );

    const cachedVersions = toolcache.findAllVersions("CodeQL");

    t.is(cachedVersions.length, 1);
  });
});

test("download codeql bundle cache with different version cached (not pinned)", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    nock("https://example.com")
      .get(`/download/codeql-bundle-20200601/codeql-bundle.tar.gz`)
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
      );

    await codeql.setupCodeQL(
      "https://example.com/download/codeql-bundle-20200601/codeql-bundle.tar.gz",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      getRunnerLogger(true),
      false
    );

    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));
    const platform =
      process.platform === "win32"
        ? "win64"
        : process.platform === "linux"
        ? "linux64"
        : "osx64";

    nock("https://github.com")
      .get(
        `/github/codeql-action/releases/download/${defaults.bundleVersion}/codeql-bundle-${platform}.tar.gz`
      )
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
      );

    await codeql.setupCodeQL(
      undefined,
      sampleApiDetails,
      tmpDir,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      getRunnerLogger(true),
      false
    );

    const cachedVersions = toolcache.findAllVersions("CodeQL");

    t.is(cachedVersions.length, 2);
  });
});

test('download codeql bundle cache with pinned different version cached if "latest" tools specified', async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);

    nock("https://example.com")
      .get(`/download/codeql-bundle-20200601/codeql-bundle.tar.gz`)
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle-pinned.tar.gz`)
      );

    await codeql.setupCodeQL(
      "https://example.com/download/codeql-bundle-20200601/codeql-bundle.tar.gz",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      getRunnerLogger(true),
      false
    );

    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));

    const platform =
      process.platform === "win32"
        ? "win64"
        : process.platform === "linux"
        ? "linux64"
        : "osx64";

    nock("https://github.com")
      .get(
        `/github/codeql-action/releases/download/${defaults.bundleVersion}/codeql-bundle-${platform}.tar.gz`
      )
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
      );

    await codeql.setupCodeQL(
      "latest",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      util.GitHubVariant.DOTCOM,
      getRunnerLogger(true),
      false
    );

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

    await codeql.setupCodeQL(
      undefined,
      sampleGHAEApiDetails,
      tmpDir,
      tmpDir,
      util.GitHubVariant.GHAE,
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

const stubConfig: Config = {
  languages: [Language.cpp],
  queries: {},
  pathsIgnore: [],
  paths: [],
  originalUserInput: {},
  tempDir: "",
  toolCacheDir: "",
  codeQLCmd: "",
  gitHubVersion: {
    type: util.GitHubVariant.DOTCOM,
  } as util.GitHubVersion,
  dbLocation: "",
  packs: {},
  debugMode: false,
  debugArtifactName: util.DEFAULT_DEBUG_ARTIFACT_NAME,
  debugDatabaseName: util.DEFAULT_DEBUG_DATABASE_NAME,
  injectedMlQueries: false,
};

test("databaseInitCluster() Lua feature flag enabled, but old CLI", async (t) => {
  const runnerConstructorStub = stubToolRunnerConstructor();
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves("2.9.0");

  await codeqlObject.databaseInitCluster(
    stubConfig,
    "",
    undefined,
    undefined,
    createFeatureFlags([FeatureFlag.LuaTracerConfigEnabled])
  );
  t.false(
    runnerConstructorStub.firstCall.args[1].includes(
      "--internal-use-lua-tracing"
    ),
    "--internal-use-lua-tracing should be absent, but it is present"
  );
  t.false(
    runnerConstructorStub.firstCall.args[1].includes(
      "--no-internal-use-lua-tracing"
    ),
    "--no-internal-use-lua-tracing should be absent, but it is present"
  );
});

test("databaseInitCluster() Lua feature flag disabled, with old CLI", async (t) => {
  const runnerConstructorStub = stubToolRunnerConstructor();
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves("2.9.0");

  await codeqlObject.databaseInitCluster(
    stubConfig,
    "",
    undefined,
    undefined,
    createFeatureFlags([])
  );
  t.false(
    runnerConstructorStub.firstCall.args[1].includes(
      "--internal-use-lua-tracing"
    ),
    "--internal-use-lua-tracing should be absent, but it is present"
  );
  t.false(
    runnerConstructorStub.firstCall.args[1].includes(
      "--no-internal-use-lua-tracing"
    ),
    "--no-internal-use-lua-tracing should be absent, but it is present"
  );
});

test("databaseInitCluster() Lua feature flag enabled, compatible CLI", async (t) => {
  const runnerConstructorStub = stubToolRunnerConstructor();
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves("2.10.0");

  await codeqlObject.databaseInitCluster(
    stubConfig,
    "",
    undefined,
    undefined,
    createFeatureFlags([FeatureFlag.LuaTracerConfigEnabled])
  );
  t.true(
    runnerConstructorStub.firstCall.args[1].includes(
      "--internal-use-lua-tracing"
    ),
    "--internal-use-lua-tracing should be present, but it is absent"
  );
});

test("databaseInitCluster() Lua feature flag disabled, compatible CLI", async (t) => {
  const runnerConstructorStub = stubToolRunnerConstructor();
  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeqlObject, "getVersion").resolves("2.10.0");

  await codeqlObject.databaseInitCluster(
    stubConfig,
    "",
    undefined,
    undefined,
    createFeatureFlags([])
  );
  t.true(
    runnerConstructorStub.firstCall.args[1].includes(
      "--no-internal-use-lua-tracing"
    ),
    "--no-internal-use-lua-tracing should be present, but it is absent"
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
