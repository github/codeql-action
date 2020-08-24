import test from 'ava';
import * as fs from 'fs';
import * as path from 'path';

import { setCodeQL } from './codeql';
import * as configUtils from './config-utils';
import { Language } from './languages';
import { setupTests } from './testing-utils';
import { concatTracerConfigs, getTracerConfig, tracerConfig } from './tracer-config';
import * as util from './util';

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
    codeQLCmd: '',
  };
}

// A very minimal setup
test('tracerConfig - minimal', async t => {
  await util.withTmpDir(async tmpDir => {
    const config = getTestConfig(tmpDir);

    const codeQL = setCodeQL({
      getTracerEnv: async function() {
        return {
          'ODASA_TRACER_CONFIGURATION': 'abc',
          'foo': 'bar'
        };
      },
    });

    const result = await tracerConfig(codeQL, config, Language.javascript);
    t.deepEqual(result, { spec: 'abc', env: {'foo': 'bar'} });
  });
});

// Existing vars should not be overwritten, unless they are critical or prefixed with CODEQL_
test('tracerConfig - existing / critical vars', async t => {
  await util.withTmpDir(async tmpDir => {
    const config = getTestConfig(tmpDir);

    const codeQL = setCodeQL({
      getTracerEnv: async function() {
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

    const result = await tracerConfig(codeQL, config, Language.javascript);
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

test('concatTracerConfigs - minimal', async t => {
  await util.withTmpDir(async tmpDir => {
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

    const result = concatTracerConfigs({ 'javascript': tc1, 'python': tc2 }, config);
    t.deepEqual(result, {
      spec: path.join(tmpDir, 'compound-spec'),
      env: {
        'a': 'a',
        'b': 'b',
        'c': 'c',
      }
    });
    t.true(fs.existsSync(result.spec));
    t.deepEqual(
      fs.readFileSync(result.spec, 'utf8'),
      path.join(tmpDir, 'compound-build-tracer.log') + '\n3\nabc\ndef\nghi');
  });
});

test('concatTracerConfigs - conflicting env vars', async t => {
  await util.withTmpDir(async tmpDir => {
    const config = getTestConfig(tmpDir);

    const spec = path.join(tmpDir, 'spec');
    fs.writeFileSync(spec, 'foo.log\n0');

    // Ok if env vars have the same name and the same value
    t.deepEqual(
      concatTracerConfigs(
        {
          'javascript': {spec: spec, env: {'a': 'a', 'b': 'b'}},
          'python': {spec: spec, env: {'b': 'b', 'c': 'c'}},
        },
        config).env,
      {
        'a': 'a',
        'b': 'b',
        'c': 'c',
      });

    // Throws if env vars have same name but different values
    const e = t.throws(() =>
      concatTracerConfigs(
        {
          'javascript': {spec: spec, env: {'a': 'a', 'b': 'b'}},
          'python': {spec: spec, env: {'b': 'c'}},
        },
        config));
    t.deepEqual(e.message, 'Incompatible values in environment parameter b: b and c');
  });
});

// If cpp is present then it's spec lines always come at the end
test('concatTracerConfigs - cpp comes last', async t => {
  await util.withTmpDir(async tmpDir => {
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

    const result = concatTracerConfigs({ 'cpp': tc1, 'python': tc2 }, config);
    t.deepEqual(result, {
      spec: path.join(tmpDir, 'compound-spec'),
      env: {
        'a': 'a',
        'b': 'b',
        'c': 'c',
      }
    });
    t.true(fs.existsSync(result.spec));
    t.deepEqual(
      fs.readFileSync(result.spec, 'utf8'),
      path.join(tmpDir, 'compound-build-tracer.log') + '\n3\nghi\nabc\ndef');
  });
});

test('concatTracerConfigs - SEMMLE_COPY_EXECUTABLES_ROOT', async t => {
  await util.withTmpDir(async tmpDir => {
    const config = getTestConfig(tmpDir);

    const spec = path.join(tmpDir, 'spec');
    fs.writeFileSync(spec, 'foo.log\n0');

    const result = concatTracerConfigs(
      {
        'javascript': {spec: spec, env: {'a': 'a', 'b': 'b'}},
        'python': {spec: spec, env: {'SEMMLE_COPY_EXECUTABLES_ROOT': 'foo'}},
      },
      config);

    t.deepEqual(result.env, {
      'a': 'a',
      'b': 'b',
      'SEMMLE_COPY_EXECUTABLES_ROOT': path.join(tmpDir, 'compound-temp')
    });
  });
});

test('concatTracerConfigs - compound environment file', async t => {
  await util.withTmpDir(async tmpDir => {
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

    const result = concatTracerConfigs({ 'javascript': tc1, 'python': tc2 }, config);
    const envPath = result.spec + '.environment';
    t.true(fs.existsSync(envPath));

    const buffer: Buffer = fs.readFileSync(envPath);
    t.deepEqual(28, buffer.length);
    t.deepEqual(2, buffer.readInt32LE(0));
    t.deepEqual(4, buffer.readInt32LE(4));
    t.deepEqual('a=a\0', buffer.toString('utf8', 8, 12));
    t.deepEqual(12, buffer.readInt32LE(12));
    t.deepEqual('foo=bar_baz\0', buffer.toString('utf8', 16, 28));
  });
});

test('getTracerConfig - no traced languages', async t => {
  await util.withTmpDir(async tmpDir => {
    const config = getTestConfig(tmpDir);
    // No traced languages
    config.languages = [Language.javascript, Language.python];

    const codeQL = setCodeQL({
      getTracerEnv: async function() {
        return {
          'ODASA_TRACER_CONFIGURATION': 'abc',
          'foo': 'bar'
        };
      },
    });

    t.deepEqual(undefined, await getTracerConfig(config, codeQL));
  });
});

test('getTracerConfig - full', async t => {
  await util.withTmpDir(async tmpDir => {
    const config = getTestConfig(tmpDir);

    const spec = path.join(tmpDir, 'spec');
    fs.writeFileSync(spec, 'foo.log\n2\nabc\ndef');

    const codeQL = setCodeQL({
      getTracerEnv: async function() {
        return {
          'ODASA_TRACER_CONFIGURATION': spec,
          'foo': 'bar',
        };
      },
    });

    const result = await getTracerConfig(config, codeQL);
    t.deepEqual(result, {
      spec: path.join(tmpDir, 'compound-spec'),
      env: {
        'foo': 'bar',
        'ODASA_TRACER_CONFIGURATION': result!.spec,
        'LD_PRELOAD': path.join(path.dirname(codeQL.getPath()), 'tools', 'linux64', '${LIB}trace.so'),
      }
    });
  });
});
