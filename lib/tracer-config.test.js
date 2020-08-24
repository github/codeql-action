"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
        codeQLCmd: '',
    };
}
// A very minimal setup
ava_1.default('tracerConfig - minimal', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const codeQL = codeql_1.setCodeQL({
            getTracerEnv: async function () {
                return {
                    'ODASA_TRACER_CONFIGURATION': 'abc',
                    'foo': 'bar'
                };
            },
        });
        const result = await tracer_config_1.tracerConfig(codeQL, config, languages_1.Language.javascript);
        t.deepEqual(result, { spec: 'abc', env: { 'foo': 'bar' } });
    });
});
// Existing vars should not be overwritten, unless they are critical or prefixed with CODEQL_
ava_1.default('tracerConfig - existing / critical vars', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const codeQL = codeql_1.setCodeQL({
            getTracerEnv: async function () {
                return {
                    'ODASA_TRACER_CONFIGURATION': 'abc',
                    'foo': 'bar',
                    'baz': 'qux',
                    'SEMMLE_PRELOAD_libtrace': 'SEMMLE_PRELOAD_libtrace',
                    'SEMMLE_RUNNER': 'SEMMLE_RUNNER',
                    'SEMMLE_COPY_EXECUTABLES_ROOT': 'SEMMLE_COPY_EXECUTABLES_ROOT',
                    'SEMMLE_DEPTRACE_SOCKET': 'SEMMLE_DEPTRACE_SOCKET',
                    'SEMMLE_JAVA_TOOL_OPTIONS': 'SEMMLE_JAVA_TOOL_OPTIONS',
                    'CODEQL_VAR': 'CODEQL_VAR',
                };
            },
        });
        process.env['foo'] = 'abc';
        process.env['SEMMLE_PRELOAD_libtrace'] = 'abc';
        process.env['SEMMLE_RUNNER'] = 'abc';
        process.env['SEMMLE_COPY_EXECUTABLES_ROOT'] = 'abc';
        process.env['SEMMLE_DEPTRACE_SOCKET'] = 'abc';
        process.env['SEMMLE_JAVA_TOOL_OPTIONS'] = 'abc';
        process.env['SEMMLE_DEPTRACE_SOCKET'] = 'abc';
        process.env['CODEQL_VAR'] = 'abc';
        const result = await tracer_config_1.tracerConfig(codeQL, config, languages_1.Language.javascript);
        t.deepEqual(result, {
            spec: 'abc',
            env: {
                'baz': 'qux',
                'SEMMLE_PRELOAD_libtrace': 'SEMMLE_PRELOAD_libtrace',
                'SEMMLE_RUNNER': 'SEMMLE_RUNNER',
                'SEMMLE_COPY_EXECUTABLES_ROOT': 'SEMMLE_COPY_EXECUTABLES_ROOT',
                'SEMMLE_DEPTRACE_SOCKET': 'SEMMLE_DEPTRACE_SOCKET',
                'SEMMLE_JAVA_TOOL_OPTIONS': 'SEMMLE_JAVA_TOOL_OPTIONS',
                'CODEQL_VAR': 'CODEQL_VAR',
            }
        });
    });
});
ava_1.default('concatTracerConfigs - minimal', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const spec1 = path.join(tmpDir, 'spec1');
        fs.writeFileSync(spec1, 'foo.log\n2\nabc\ndef');
        const tc1 = {
            spec: spec1,
            env: {
                'a': 'a',
                'b': 'b',
            }
        };
        const spec2 = path.join(tmpDir, 'spec2');
        fs.writeFileSync(spec2, 'foo.log\n1\nghi');
        const tc2 = {
            spec: spec2,
            env: {
                'c': 'c',
            }
        };
        const result = tracer_config_1.concatTracerConfigs({ 'javascript': tc1, 'python': tc2 }, config);
        t.deepEqual(result, {
            spec: path.join(tmpDir, 'compound-spec'),
            env: {
                'a': 'a',
                'b': 'b',
                'c': 'c',
            }
        });
        t.true(fs.existsSync(result.spec));
        t.deepEqual(fs.readFileSync(result.spec, 'utf8'), path.join(tmpDir, 'compound-build-tracer.log') + '\n3\nabc\ndef\nghi');
    });
});
ava_1.default('concatTracerConfigs - conflicting env vars', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const spec = path.join(tmpDir, 'spec');
        fs.writeFileSync(spec, 'foo.log\n0');
        // Ok if env vars have the same name and the same value
        t.deepEqual(tracer_config_1.concatTracerConfigs({
            'javascript': { spec: spec, env: { 'a': 'a', 'b': 'b' } },
            'python': { spec: spec, env: { 'b': 'b', 'c': 'c' } },
        }, config).env, {
            'a': 'a',
            'b': 'b',
            'c': 'c',
        });
        // Throws if env vars have same name but different values
        const e = t.throws(() => tracer_config_1.concatTracerConfigs({
            'javascript': { spec: spec, env: { 'a': 'a', 'b': 'b' } },
            'python': { spec: spec, env: { 'b': 'c' } },
        }, config));
        t.deepEqual(e.message, 'Incompatible values in environment parameter b: b and c');
    });
});
// If cpp is present then it's spec lines always come at the end
ava_1.default('concatTracerConfigs - cpp comes last', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const spec1 = path.join(tmpDir, 'spec1');
        fs.writeFileSync(spec1, 'foo.log\n2\nabc\ndef');
        const tc1 = {
            spec: spec1,
            env: {
                'a': 'a',
                'b': 'b',
            }
        };
        const spec2 = path.join(tmpDir, 'spec2');
        fs.writeFileSync(spec2, 'foo.log\n1\nghi');
        const tc2 = {
            spec: spec2,
            env: {
                'c': 'c',
            }
        };
        const result = tracer_config_1.concatTracerConfigs({ 'cpp': tc1, 'python': tc2 }, config);
        t.deepEqual(result, {
            spec: path.join(tmpDir, 'compound-spec'),
            env: {
                'a': 'a',
                'b': 'b',
                'c': 'c',
            }
        });
        t.true(fs.existsSync(result.spec));
        t.deepEqual(fs.readFileSync(result.spec, 'utf8'), path.join(tmpDir, 'compound-build-tracer.log') + '\n3\nghi\nabc\ndef');
    });
});
ava_1.default('concatTracerConfigs - SEMMLE_COPY_EXECUTABLES_ROOT', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const spec = path.join(tmpDir, 'spec');
        fs.writeFileSync(spec, 'foo.log\n0');
        const result = tracer_config_1.concatTracerConfigs({
            'javascript': { spec: spec, env: { 'a': 'a', 'b': 'b' } },
            'python': { spec: spec, env: { 'SEMMLE_COPY_EXECUTABLES_ROOT': 'foo' } },
        }, config);
        t.deepEqual(result.env, {
            'a': 'a',
            'b': 'b',
            'SEMMLE_COPY_EXECUTABLES_ROOT': path.join(tmpDir, 'compound-temp')
        });
    });
});
ava_1.default('concatTracerConfigs - compound environment file', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const spec1 = path.join(tmpDir, 'spec1');
        fs.writeFileSync(spec1, 'foo.log\n2\nabc\ndef');
        const tc1 = {
            spec: spec1,
            env: {
                'a': 'a',
            }
        };
        const spec2 = path.join(tmpDir, 'spec2');
        fs.writeFileSync(spec2, 'foo.log\n1\nghi');
        const tc2 = {
            spec: spec2,
            env: {
                'foo': 'bar_baz',
            }
        };
        const result = tracer_config_1.concatTracerConfigs({ 'javascript': tc1, 'python': tc2 }, config);
        const envPath = result.spec + '.environment';
        t.true(fs.existsSync(envPath));
        const buffer = fs.readFileSync(envPath);
        t.deepEqual(28, buffer.length);
        t.deepEqual(2, buffer.readInt32LE(0));
        t.deepEqual(4, buffer.readInt32LE(4));
        t.deepEqual('a=a\0', buffer.toString('utf8', 8, 12));
        t.deepEqual(12, buffer.readInt32LE(12));
        t.deepEqual('foo=bar_baz\0', buffer.toString('utf8', 16, 28));
    });
});
ava_1.default('getTracerConfig - no traced languages', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        // No traced languages
        config.languages = [languages_1.Language.javascript, languages_1.Language.python];
        const codeQL = codeql_1.setCodeQL({
            getTracerEnv: async function () {
                return {
                    'ODASA_TRACER_CONFIGURATION': 'abc',
                    'foo': 'bar'
                };
            },
        });
        t.deepEqual(undefined, await tracer_config_1.getTracerConfig(config, codeQL));
    });
});
ava_1.default('getTracerConfig - full', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const spec = path.join(tmpDir, 'spec');
        fs.writeFileSync(spec, 'foo.log\n2\nabc\ndef');
        const codeQL = codeql_1.setCodeQL({
            getTracerEnv: async function () {
                return {
                    'ODASA_TRACER_CONFIGURATION': spec,
                    'foo': 'bar',
                };
            },
        });
        const result = await tracer_config_1.getTracerConfig(config, codeQL);
        t.deepEqual(result, {
            spec: path.join(tmpDir, 'compound-spec'),
            env: {
                'foo': 'bar',
                'ODASA_TRACER_CONFIGURATION': result.spec,
                'LD_PRELOAD': path.join(path.dirname(codeQL.getPath()), 'tools', 'linux64', '${LIB}trace.so'),
            }
        });
    });
});
//# sourceMappingURL=tracer-config.test.js.map