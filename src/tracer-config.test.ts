import * as fs from "fs";
import * as path from "path";

import test from "ava";

import * as configUtils from "./config-utils";
import { Language } from "./languages";
import {
  createTestConfig,
  mockCodeQLVersion,
  setupTests,
} from "./testing-utils";
import { getCombinedTracerConfig } from "./tracer-config";
import * as util from "./util";

setupTests(test);

function getTestConfig(tempDir: string): configUtils.Config {
  return createTestConfig({
    languages: [Language.java],
    tempDir,
    dbLocation: path.resolve(tempDir, "codeql_databases"),
  });
}

test("getCombinedTracerConfig - return undefined when no languages are traced languages", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);
    // No traced languages
    config.languages = [Language.javascript, Language.python];
    t.deepEqual(
      await getCombinedTracerConfig(mockCodeQLVersion("1.0.0"), config),
      undefined,
    );
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
      "tracingEnvironment",
    );
    fs.mkdirSync(tracingEnvironmentDir, { recursive: true });
    const startTracingJson = path.join(
      tracingEnvironmentDir,
      "start-tracing.json",
    );
    fs.writeFileSync(startTracingJson, JSON.stringify(startTracingEnv));

    const result = await getCombinedTracerConfig(
      mockCodeQLVersion("1.0.0"),
      config,
    );
    t.notDeepEqual(result, undefined);

    const expectedEnv = startTracingEnv;

    if (process.platform === "win32") {
      expectedEnv["CODEQL_RUNNER"] = path.join(
        bundlePath,
        "tools/win64/runner.exe",
      );
    } else if (process.platform === "darwin") {
      expectedEnv["CODEQL_RUNNER"] = path.join(
        bundlePath,
        "tools/osx64/runner",
      );
    } else {
      expectedEnv["CODEQL_RUNNER"] = path.join(
        bundlePath,
        "tools/linux64/runner",
      );
    }

    t.deepEqual(result, {
      env: expectedEnv,
    });
  });
});

test("getCombinedTracerConfig - with SetsCodeqlRunnerEnvVar feature enabled in CLI", async (t) => {
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
      "tracingEnvironment",
    );
    fs.mkdirSync(tracingEnvironmentDir, { recursive: true });
    const startTracingJson = path.join(
      tracingEnvironmentDir,
      "start-tracing.json",
    );
    fs.writeFileSync(startTracingJson, JSON.stringify(startTracingEnv));

    const result = await getCombinedTracerConfig(
      mockCodeQLVersion("1.0.0", { setsCodeqlRunnerEnvVar: true }),
      config,
    );
    t.notDeepEqual(result, undefined);

    t.false(Object.prototype.hasOwnProperty.call(result?.env, "CODEQL_RUNNER"));
  });
});
