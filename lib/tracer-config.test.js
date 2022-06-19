"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
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
(0, testing_utils_1.setupTests)(ava_1.default);
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
(0, ava_1.default)("getTracerConfigForLanguage - minimal setup", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const codeQL = (0, codeql_1.setCodeQL)({
            async getTracerEnv() {
                return {
                    ODASA_TRACER_CONFIGURATION: "abc",
                    foo: "bar",
                };
            },
        });
        const result = await (0, tracer_config_1.getTracerConfigForLanguage)(codeQL, config, languages_1.Language.javascript);
        t.deepEqual(result, { spec: "abc", env: { foo: "bar" } });
    });
});
// Existing vars should not be overwritten, unless they are critical or prefixed with CODEQL_
(0, ava_1.default)("getTracerConfigForLanguage - existing / critical vars", async (t) => {
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
        const codeQL = (0, codeql_1.setCodeQL)({
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
        const result = await (0, tracer_config_1.getTracerConfigForLanguage)(codeQL, config, languages_1.Language.javascript);
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
(0, ava_1.default)("concatTracerConfigs - minimal configs correctly combined", async (t) => {
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
        const result = (0, tracer_config_1.concatTracerConfigs)({ javascript: tc1, python: tc2 }, config);
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
(0, ava_1.default)("concatTracerConfigs - conflicting env vars", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const spec = path.join(tmpDir, "spec");
        fs.writeFileSync(spec, "foo.log\n0");
        // Ok if env vars have the same name and the same value
        t.deepEqual((0, tracer_config_1.concatTracerConfigs)({
            javascript: { spec, env: { a: "a", b: "b" } },
            python: { spec, env: { b: "b", c: "c" } },
        }, config).env, {
            a: "a",
            b: "b",
            c: "c",
        });
        // Throws if env vars have same name but different values
        const e = t.throws(() => (0, tracer_config_1.concatTracerConfigs)({
            javascript: { spec, env: { a: "a", b: "b" } },
            python: { spec, env: { b: "c" } },
        }, config));
        // If e is undefined, then the previous assertion will fail.
        if (e !== undefined) {
            t.deepEqual(e.message, "Incompatible values in environment parameter b: b and c");
        }
    });
});
(0, ava_1.default)("concatTracerConfigs - cpp spec lines come last if present", async (t) => {
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
        const result = (0, tracer_config_1.concatTracerConfigs)({ cpp: tc1, python: tc2 }, config);
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
(0, ava_1.default)("concatTracerConfigs - SEMMLE_COPY_EXECUTABLES_ROOT is updated to point to compound spec", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const spec = path.join(tmpDir, "spec");
        fs.writeFileSync(spec, "foo.log\n0");
        const result = (0, tracer_config_1.concatTracerConfigs)({
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
(0, ava_1.default)("concatTracerConfigs - compound environment file is created correctly", async (t) => {
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
        const result = (0, tracer_config_1.concatTracerConfigs)({ javascript: tc1, python: tc2 }, config, true);
        // Check binary contents for the Unix file
        const envPath = `${result.spec}.environment`;
        t.true(fs.existsSync(envPath));
        const buffer = fs.readFileSync(envPath);
        t.deepEqual(buffer.length, 28);
        t.deepEqual(buffer.readInt32LE(0), 2); // number of env vars
        t.deepEqual(buffer.readInt32LE(4), 4); // length of env var definition
        t.deepEqual(buffer.toString("utf8", 8, 12), "a=a\0"); // [key]=[value]\0
        t.deepEqual(buffer.readInt32LE(12), 12); // length of env var definition
        t.deepEqual(buffer.toString("utf8", 16, 28), "foo=bar_baz\0"); // [key]=[value]\0
        // Check binary contents for the Windows file
        const envPathWindows = `${result.spec}.win32env`;
        t.true(fs.existsSync(envPathWindows));
        const bufferWindows = fs.readFileSync(envPathWindows);
        t.deepEqual(bufferWindows.length, 38);
        t.deepEqual(bufferWindows.readInt32LE(0), 4 + 12 + 1); // number of tchars to represent the environment
        t.deepEqual(bufferWindows.toString("utf16le", 4, 12), "a=a\0"); // [key]=[value]\0
        t.deepEqual(bufferWindows.toString("utf16le", 12, 36), "foo=bar_baz\0"); // [key]=[value]\0
        t.deepEqual(bufferWindows.toString("utf16le", 36, 38), "\0"); // trailing null character
    });
});
(0, ava_1.default)("getCombinedTracerConfig - return undefined when no languages are traced languages", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        // No traced languages
        config.languages = [languages_1.Language.javascript, languages_1.Language.python];
        const codeQL = (0, codeql_1.setCodeQL)({
            async getTracerEnv() {
                return {
                    ODASA_TRACER_CONFIGURATION: "abc",
                    CODEQL_DIST: "/",
                    foo: "bar",
                };
            },
        });
        t.deepEqual(await (0, tracer_config_1.getCombinedTracerConfig)(config, codeQL), undefined);
    });
});
(0, ava_1.default)("getCombinedTracerConfig - valid spec file", async (t) => {
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
        const codeQL = (0, codeql_1.setCodeQL)({
            async getTracerEnv() {
                return {
                    ODASA_TRACER_CONFIGURATION: spec,
                    CODEQL_DIST: bundlePath,
                    CODEQL_PLATFORM: codeqlPlatform,
                    foo: "bar",
                };
            },
        });
        const result = await (0, tracer_config_1.getCombinedTracerConfig)(config, codeQL);
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