import * as fs from "fs";
import * as path from "path";

import test from "ava";

import * as configUtils from "./config-utils";
import { Language } from "./languages";
import { setupTests } from "./testing-utils";
import { getCombinedTracerConfig } from "./tracer-config";
import * as util from "./util";

setupTests(test);

function getTestConfig(tmpDir: string): configUtils.Config {
  return {
    languages: [Language.java],
    queries: {},
    pathsIgnore: [],
    paths: [],
    originalUserInput: {},
    tempDir: tmpDir,
    codeQLCmd: "",
    gitHubVersion: { type: util.GitHubVariant.DOTCOM } as util.GitHubVersion,
    dbLocation: path.resolve(tmpDir, "codeql_databases"),
    packs: {},
    debugMode: false,
    debugArtifactName: util.DEFAULT_DEBUG_ARTIFACT_NAME,
    debugDatabaseName: util.DEFAULT_DEBUG_DATABASE_NAME,
    augmentationProperties: configUtils.defaultAugmentationProperties,
    trapCaches: {},
    trapCacheDownloadTime: 0,
  };
}

test("getCombinedTracerConfig - return undefined when no languages are traced languages", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);
    // No traced languages
    config.languages = [Language.javascript, Language.python];
    t.deepEqual(await getCombinedTracerConfig(config), undefined);
  });
});

test("getCombinedTracerConfig - with start-tracing.json environment file", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);

    const bundlePath = path.join(tmpDir, "bundle");
    const codeqlPlatform =
      process.platform === "win32"
        ? "win64"
        : process.platform === "darwin"
        ? "osx64"
        : "linux64";
    const startTracingEnv = {
      foo: "bar",
      CODEQL_DIST: bundlePath,
      CODEQL_PLATFORM: codeqlPlatform,
    };

    const tracingEnvironmentDir = path.join(
      config.dbLocation,
      "temp",
      "tracingEnvironment"
    );
    fs.mkdirSync(tracingEnvironmentDir, { recursive: true });
    const startTracingJson = path.join(
      tracingEnvironmentDir,
      "start-tracing.json"
    );
    fs.writeFileSync(startTracingJson, JSON.stringify(startTracingEnv));

    const result = await getCombinedTracerConfig(config);
    t.notDeepEqual(result, undefined);

    const expectedEnv = startTracingEnv;

    if (process.platform === "win32") {
      expectedEnv["CODEQL_RUNNER"] = path.join(
        bundlePath,
        "tools/win64/runner.exe"
      );
    } else if (process.platform === "darwin") {
      expectedEnv["CODEQL_RUNNER"] = path.join(
        bundlePath,
        "tools/osx64/runner"
      );
    } else {
      expectedEnv["CODEQL_RUNNER"] = path.join(
        bundlePath,
        "tools/linux64/runner"
      );
    }

    t.deepEqual(result, {
      env: expectedEnv,
    });
  });
});
