import * as fs from "fs";
import * as path from "path";

import test from "ava";

import { setCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { Language } from "./languages";
import { setupTests } from "./testing-utils";
import {
  concatTracerConfigs,
  getCombinedTracerConfig,
  getTracerConfigForLanguage,
} from "./tracer-config";
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
    toolCacheDir: tmpDir,
    codeQLCmd: "",
    gitHubVersion: { type: util.GitHubVariant.DOTCOM } as util.GitHubVersion,
    dbLocation: path.resolve(tmpDir, "codeql_databases"),
    packs: {},
    debugMode: false,
    debugArtifactName: util.DEFAULT_DEBUG_ARTIFACT_NAME,
    debugDatabaseName: util.DEFAULT_DEBUG_DATABASE_NAME,
    augmentationProperties: {
      injectedMlQueries: false,
      packsInputCombines: false,
      queriesInputCombines: false,
    },
  };
}

// A very minimal setup
test("getTracerConfigForLanguage - minimal setup", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);

    const codeQL = setCodeQL({
      async getTracerEnv() {
        return {
          ODASA_TRACER_CONFIGURATION: "abc",
          foo: "bar",
        };
      },
    });

    const result = await getTracerConfigForLanguage(
      codeQL,
      config,
      Language.javascript
    );
    t.deepEqual(result, { spec: "abc", env: { foo: "bar" } });
  });
});

// Existing vars should not be overwritten, unless they are critical or prefixed with CODEQL_
test("getTracerConfigForLanguage - existing / critical vars", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);

    // Set up some variables in the environment
    process.env["foo"] = "abc";
    process.env["SEMMLE_PRELOAD_libtrace"] = "abc";
    process.env["SEMMLE_RUNNER"] = "abc";
    process.env["SEMMLE_COPY_EXECUTABLES_ROOT"] = "abc";
    process.env["SEMMLE_DEPTRACE_SOCKET"] = "abc";
    process.env["SEMMLE_JAVA_TOOL_OPTIONS"] = "abc";
    process.env["CODEQL_VAR"] = "abc";

    // Now CodeQL returns all these variables, and one more, with different values
    const codeQL = setCodeQL({
      async getTracerEnv() {
        return {
          ODASA_TRACER_CONFIGURATION: "abc",
          foo: "bar",
          baz: "qux",
          SEMMLE_PRELOAD_libtrace: "SEMMLE_PRELOAD_libtrace",
          SEMMLE_RUNNER: "SEMMLE_RUNNER",
          SEMMLE_COPY_EXECUTABLES_ROOT: "SEMMLE_COPY_EXECUTABLES_ROOT",
          SEMMLE_DEPTRACE_SOCKET: "SEMMLE_DEPTRACE_SOCKET",
          SEMMLE_JAVA_TOOL_OPTIONS: "SEMMLE_JAVA_TOOL_OPTIONS",
          CODEQL_VAR: "CODEQL_VAR",
        };
      },
    });

    const result = await getTracerConfigForLanguage(
      codeQL,
      config,
      Language.javascript
    );
    t.deepEqual(result, {
      spec: "abc",
      env: {
        // Should contain all variables except 'foo', because that already existed in the
        // environment with a different value, and is not deemed a "critical" variable.
        baz: "qux",
        SEMMLE_PRELOAD_libtrace: "SEMMLE_PRELOAD_libtrace",
        SEMMLE_RUNNER: "SEMMLE_RUNNER",
        SEMMLE_COPY_EXECUTABLES_ROOT: "SEMMLE_COPY_EXECUTABLES_ROOT",
        SEMMLE_DEPTRACE_SOCKET: "SEMMLE_DEPTRACE_SOCKET",
        SEMMLE_JAVA_TOOL_OPTIONS: "SEMMLE_JAVA_TOOL_OPTIONS",
        CODEQL_VAR: "CODEQL_VAR",
      },
    });
  });
});

test("concatTracerConfigs - minimal configs correctly combined", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);

    const spec1 = path.join(tmpDir, "spec1");
    fs.writeFileSync(spec1, "foo.log\n2\nabc\ndef");
    const tc1 = {
      spec: spec1,
      env: {
        a: "a",
        b: "b",
      },
    };

    const spec2 = path.join(tmpDir, "spec2");
    fs.writeFileSync(spec2, "foo.log\n1\nghi");
    const tc2 = {
      spec: spec2,
      env: {
        c: "c",
      },
    };

    const result = concatTracerConfigs(
      { javascript: tc1, python: tc2 },
      config
    );
    t.deepEqual(result, {
      spec: path.join(tmpDir, "compound-spec"),
      env: {
        a: "a",
        b: "b",
        c: "c",
      },
    });
    t.true(fs.existsSync(result.spec));
    t.deepEqual(
      fs.readFileSync(result.spec, "utf8"),
      `${path.join(tmpDir, "compound-build-tracer.log")}\n3\nabc\ndef\nghi`
    );
  });
});

test("concatTracerConfigs - conflicting env vars", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);

    const spec = path.join(tmpDir, "spec");
    fs.writeFileSync(spec, "foo.log\n0");

    // Ok if env vars have the same name and the same value
    t.deepEqual(
      concatTracerConfigs(
        {
          javascript: { spec, env: { a: "a", b: "b" } },
          python: { spec, env: { b: "b", c: "c" } },
        },
        config
      ).env,
      {
        a: "a",
        b: "b",
        c: "c",
      }
    );

    // Throws if env vars have same name but different values
    const e = t.throws(() =>
      concatTracerConfigs(
        {
          javascript: { spec, env: { a: "a", b: "b" } },
          python: { spec, env: { b: "c" } },
        },
        config
      )
    );
    // If e is undefined, then the previous assertion will fail.
    if (e !== undefined) {
      t.deepEqual(
        e.message,
        "Incompatible values in environment parameter b: b and c"
      );
    }
  });
});

test("concatTracerConfigs - cpp spec lines come last if present", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);

    const spec1 = path.join(tmpDir, "spec1");
    fs.writeFileSync(spec1, "foo.log\n2\nabc\ndef");
    const tc1 = {
      spec: spec1,
      env: {
        a: "a",
        b: "b",
      },
    };

    const spec2 = path.join(tmpDir, "spec2");
    fs.writeFileSync(spec2, "foo.log\n1\nghi");
    const tc2 = {
      spec: spec2,
      env: {
        c: "c",
      },
    };

    const result = concatTracerConfigs({ cpp: tc1, python: tc2 }, config);
    t.deepEqual(result, {
      spec: path.join(tmpDir, "compound-spec"),
      env: {
        a: "a",
        b: "b",
        c: "c",
      },
    });
    t.true(fs.existsSync(result.spec));
    t.deepEqual(
      fs.readFileSync(result.spec, "utf8"),
      `${path.join(tmpDir, "compound-build-tracer.log")}\n3\nghi\nabc\ndef`
    );
  });
});

test("concatTracerConfigs - SEMMLE_COPY_EXECUTABLES_ROOT is updated to point to compound spec", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);

    const spec = path.join(tmpDir, "spec");
    fs.writeFileSync(spec, "foo.log\n0");

    const result = concatTracerConfigs(
      {
        javascript: { spec, env: { a: "a", b: "b" } },
        python: { spec, env: { SEMMLE_COPY_EXECUTABLES_ROOT: "foo" } },
      },
      config
    );

    t.deepEqual(result.env, {
      a: "a",
      b: "b",
      SEMMLE_COPY_EXECUTABLES_ROOT: path.join(tmpDir, "compound-temp"),
    });
  });
});

test("concatTracerConfigs - compound environment file is created correctly", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);

    const spec1 = path.join(tmpDir, "spec1");
    fs.writeFileSync(spec1, "foo.log\n2\nabc\ndef");
    const tc1 = {
      spec: spec1,
      env: {
        a: "a",
      },
    };

    const spec2 = path.join(tmpDir, "spec2");
    fs.writeFileSync(spec2, "foo.log\n1\nghi");
    const tc2 = {
      spec: spec2,
      env: {
        foo: "bar_baz",
      },
    };

    const result = concatTracerConfigs(
      { javascript: tc1, python: tc2 },
      config,
      true
    );

    // Check binary contents for the Unix file
    const envPath = `${result.spec}.environment`;
    t.true(fs.existsSync(envPath));
    const buffer: Buffer = fs.readFileSync(envPath);
    t.deepEqual(buffer.length, 28);
    t.deepEqual(buffer.readInt32LE(0), 2); // number of env vars
    t.deepEqual(buffer.readInt32LE(4), 4); // length of env var definition
    t.deepEqual(buffer.toString("utf8", 8, 12), "a=a\0"); // [key]=[value]\0
    t.deepEqual(buffer.readInt32LE(12), 12); // length of env var definition
    t.deepEqual(buffer.toString("utf8", 16, 28), "foo=bar_baz\0"); // [key]=[value]\0

    // Check binary contents for the Windows file
    const envPathWindows = `${result.spec}.win32env`;
    t.true(fs.existsSync(envPathWindows));
    const bufferWindows: Buffer = fs.readFileSync(envPathWindows);
    t.deepEqual(bufferWindows.length, 38);
    t.deepEqual(bufferWindows.readInt32LE(0), 4 + 12 + 1); // number of tchars to represent the environment
    t.deepEqual(bufferWindows.toString("utf16le", 4, 12), "a=a\0"); // [key]=[value]\0
    t.deepEqual(bufferWindows.toString("utf16le", 12, 36), "foo=bar_baz\0"); // [key]=[value]\0
    t.deepEqual(bufferWindows.toString("utf16le", 36, 38), "\0"); // trailing null character
  });
});

test("getCombinedTracerConfig - return undefined when no languages are traced languages", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);
    // No traced languages
    config.languages = [Language.javascript, Language.python];

    const codeQL = setCodeQL({
      async getTracerEnv() {
        return {
          ODASA_TRACER_CONFIGURATION: "abc",
          CODEQL_DIST: "/",
          foo: "bar",
        };
      },
    });

    t.deepEqual(await getCombinedTracerConfig(config, codeQL), undefined);
  });
});

test("getCombinedTracerConfig - valid spec file", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfig(tmpDir);

    const spec = path.join(tmpDir, "spec");
    fs.writeFileSync(spec, "foo.log\n2\nabc\ndef");

    const bundlePath = path.join(tmpDir, "bundle");
    const codeqlPlatform =
      process.platform === "win32"
        ? "win64"
        : process.platform === "darwin"
        ? "osx64"
        : "linux64";

    const codeQL = setCodeQL({
      async getTracerEnv() {
        return {
          ODASA_TRACER_CONFIGURATION: spec,
          CODEQL_DIST: bundlePath,
          CODEQL_PLATFORM: codeqlPlatform,
          foo: "bar",
        };
      },
    });

    const result = await getCombinedTracerConfig(config, codeQL);
    t.notDeepEqual(result, undefined);

    const expectedEnv = {
      foo: "bar",
      CODEQL_DIST: bundlePath,
      CODEQL_PLATFORM: codeqlPlatform,
      ODASA_TRACER_CONFIGURATION: result!.spec,
    };

    if (process.platform === "darwin") {
      expectedEnv["DYLD_INSERT_LIBRARIES"] = path.join(
        path.dirname(codeQL.getPath()),
        "tools",
        "osx64",
        "libtrace.dylib"
      );
    } else if (process.platform !== "win32") {
      expectedEnv["LD_PRELOAD"] = path.join(
        path.dirname(codeQL.getPath()),
        "tools",
        "linux64",
        "${LIB}trace.so"
      );
    }

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
      spec: path.join(tmpDir, "compound-spec"),
      env: expectedEnv,
    });
  });
});
