"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const codeql_1 = require("./codeql");
const languages_1 = require("./languages");
const testing_utils_1 = require("./testing-utils");
const tracer_config_1 = require("./tracer-config");
const util = __importStar(require("./util"));
testing_utils_1.setupTests(ava_1.default);
function getTestConfig(tmpDir) {
    return {
        languages: [languages_1.Language.java],
        queries: {},
        pathsIgnore: [],
        paths: [],
        originalUserInput: {},
        tempDir: tmpDir,
        toolCacheDir: tmpDir,
        codeQLCmd: "",
        gitHubVersion: { type: util.GitHubVariant.DOTCOM },
    };
}
// A very minimal setup
ava_1.default("getTracerConfigForLanguage - minimal setup", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const codeQL = codeql_1.setCodeQL({
            async getTracerEnv() {
                return {
                    ODASA_TRACER_CONFIGURATION: "abc",
                    foo: "bar",
                };
            },
        });
        const result = await tracer_config_1.getTracerConfigForLanguage(codeQL, config, languages_1.Language.javascript);
        t.deepEqual(result, { spec: "abc", env: { foo: "bar" } });
    });
});
// Existing vars should not be overwritten, unless they are critical or prefixed with CODEQL_
ava_1.default("getTracerConfigForLanguage - existing / critical vars", async (t) => {
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
        const codeQL = codeql_1.setCodeQL({
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
        const result = await tracer_config_1.getTracerConfigForLanguage(codeQL, config, languages_1.Language.javascript);
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
ava_1.default("concatTracerConfigs - minimal configs correctly combined", async (t) => {
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
        const result = tracer_config_1.concatTracerConfigs({ javascript: tc1, python: tc2 }, config);
        t.deepEqual(result, {
            spec: path.join(tmpDir, "compound-spec"),
            env: {
                a: "a",
                b: "b",
                c: "c",
            },
        });
        t.true(fs.existsSync(result.spec));
        t.deepEqual(fs.readFileSync(result.spec, "utf8"), `${path.join(tmpDir, "compound-build-tracer.log")}\n3\nabc\ndef\nghi`);
    });
});
ava_1.default("concatTracerConfigs - conflicting env vars", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const spec = path.join(tmpDir, "spec");
        fs.writeFileSync(spec, "foo.log\n0");
        // Ok if env vars have the same name and the same value
        t.deepEqual(tracer_config_1.concatTracerConfigs({
            javascript: { spec, env: { a: "a", b: "b" } },
            python: { spec, env: { b: "b", c: "c" } },
        }, config).env, {
            a: "a",
            b: "b",
            c: "c",
        });
        // Throws if env vars have same name but different values
        const e = t.throws(() => tracer_config_1.concatTracerConfigs({
            javascript: { spec, env: { a: "a", b: "b" } },
            python: { spec, env: { b: "c" } },
        }, config));
        t.deepEqual(e.message, "Incompatible values in environment parameter b: b and c");
    });
});
ava_1.default("concatTracerConfigs - cpp spec lines come last if present", async (t) => {
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
        const result = tracer_config_1.concatTracerConfigs({ cpp: tc1, python: tc2 }, config);
        t.deepEqual(result, {
            spec: path.join(tmpDir, "compound-spec"),
            env: {
                a: "a",
                b: "b",
                c: "c",
            },
        });
        t.true(fs.existsSync(result.spec));
        t.deepEqual(fs.readFileSync(result.spec, "utf8"), `${path.join(tmpDir, "compound-build-tracer.log")}\n3\nghi\nabc\ndef`);
    });
});
ava_1.default("concatTracerConfigs - SEMMLE_COPY_EXECUTABLES_ROOT is updated to point to compound spec", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const spec = path.join(tmpDir, "spec");
        fs.writeFileSync(spec, "foo.log\n0");
        const result = tracer_config_1.concatTracerConfigs({
            javascript: { spec, env: { a: "a", b: "b" } },
            python: { spec, env: { SEMMLE_COPY_EXECUTABLES_ROOT: "foo" } },
        }, config);
        t.deepEqual(result.env, {
            a: "a",
            b: "b",
            SEMMLE_COPY_EXECUTABLES_ROOT: path.join(tmpDir, "compound-temp"),
        });
    });
});
ava_1.default("concatTracerConfigs - compound environment file is created correctly", async (t) => {
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
        const result = tracer_config_1.concatTracerConfigs({ javascript: tc1, python: tc2 }, config);
        const envPath = `${result.spec}.environment`;
        t.true(fs.existsSync(envPath));
        const buffer = fs.readFileSync(envPath);
        // Contents is binary data
        t.deepEqual(buffer.length, 28);
        t.deepEqual(buffer.readInt32LE(0), 2); // number of env vars
        t.deepEqual(buffer.readInt32LE(4), 4); // length of env var definition
        t.deepEqual(buffer.toString("utf8", 8, 12), "a=a\0"); // [key]=[value]\0
        t.deepEqual(buffer.readInt32LE(12), 12); // length of env var definition
        t.deepEqual(buffer.toString("utf8", 16, 28), "foo=bar_baz\0"); // [key]=[value]\0
    });
});
ava_1.default("getCombinedTracerConfig - return undefined when no languages are traced languages", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        // No traced languages
        config.languages = [languages_1.Language.javascript, languages_1.Language.python];
        const codeQL = codeql_1.setCodeQL({
            async getTracerEnv() {
                return {
                    ODASA_TRACER_CONFIGURATION: "abc",
                    CODEQL_DIST: "/",
                    foo: "bar",
                };
            },
        });
        t.deepEqual(await tracer_config_1.getCombinedTracerConfig(config, codeQL), undefined);
    });
});
ava_1.default("getCombinedTracerConfig - valid spec file", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const spec = path.join(tmpDir, "spec");
        fs.writeFileSync(spec, "foo.log\n2\nabc\ndef");
        const bundlePath = path.join(tmpDir, "bundle");
        const codeqlPlatform = process.platform === "win32"
            ? "win64"
            : process.platform === "darwin"
                ? "osx64"
                : "linux64";
        const codeQL = codeql_1.setCodeQL({
            async getTracerEnv() {
                return {
                    ODASA_TRACER_CONFIGURATION: spec,
                    CODEQL_DIST: bundlePath,
                    CODEQL_PLATFORM: codeqlPlatform,
                    foo: "bar",
                };
            },
        });
        const result = await tracer_config_1.getCombinedTracerConfig(config, codeQL);
        t.notDeepEqual(result, undefined);
        const expectedEnv = {
            foo: "bar",
            CODEQL_DIST: bundlePath,
            CODEQL_PLATFORM: codeqlPlatform,
            ODASA_TRACER_CONFIGURATION: result.spec,
        };
        if (process.platform === "darwin") {
            expectedEnv["DYLD_INSERT_LIBRARIES"] = path.join(path.dirname(codeQL.getPath()), "tools", "osx64", "libtrace.dylib");
        }
        else if (process.platform !== "win32") {
            expectedEnv["LD_PRELOAD"] = path.join(path.dirname(codeQL.getPath()), "tools", "linux64", "${LIB}trace.so");
        }
        if (process.platform === "win32") {
            expectedEnv["CODEQL_RUNNER"] = path.join(bundlePath, "tools/win64/runner.exe");
        }
        else if (process.platform === "darwin") {
            expectedEnv["CODEQL_RUNNER"] = path.join(bundlePath, "tools/osx64/runner");
        }
        else {
            expectedEnv["CODEQL_RUNNER"] = path.join(bundlePath, "tools/linux64/runner");
        }
        t.deepEqual(result, {
            spec: path.join(tmpDir, "compound-spec"),
            env: expectedEnv,
        });
    });
});
//# sourceMappingURL=tracer-config.test.js.map