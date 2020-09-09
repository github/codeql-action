import * as toolcache from '@actions/tool-cache';
import test from 'ava';
import nock from 'nock';
import * as path from 'path';

import * as codeql from './codeql';
import { getRunnerLogger } from './logging';
import {setupTests} from './testing-utils';
import * as util from './util';

setupTests(test);

test('download codeql bundle cache', async t => {

  await util.withTmpDir(async tmpDir => {
    const versions = ['20200601', '20200610'];
    const plVersions = ['linux64-cpp', undefined];

    for (let i=0; i < versions.length; i++) {
      for (let j=0; j < plVersions.length; j++) {
        const version = versions[i];
        const plVersion = plVersions[j];
        const pkg = plVersion ? `codeql-${plVersion}.tar.gz` : `codeql-bundle.tar.gz`

        nock('https://example.com')
        .get(`/download/codeql-bundle-${version}/${pkg}`)
        .replyWithFile(200, path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`));

        await codeql.setupCodeQL(
          `https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`,
          plVersion,
          'token',
          'https://github.example.com',
          tmpDir,
          tmpDir,
          'runner',
          getRunnerLogger(true));

        const toolcacheVersion = plVersion ? `0.0.0-${version}-${plVersion}` : `0.0.0-${version}`;
        console.debug(toolcacheVersion)
        t.assert(toolcache.find('CodeQL', toolcacheVersion), `Looking for ${toolcacheVersion} - ${plVersion}`);
      }
    }

    const cachedVersions = toolcache.findAllVersions('CodeQL');

    t.is(cachedVersions.length, 4);
  });
});


test('use codeql bundle cache if pl version is not available', async t => {
  // If we look for a pl version but find in cache the bundle, we use the bundle
  await util.withTmpDir(async tmpDir => {
    const version = '20200601';
    const plVersion = 'linux64-cpp';

    nock('https://example.com')
      .get(`/download/codeql-bundle-${version}/codeql-bundle.tar.gz`)
      .replyWithFile(200, path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`));

    await codeql.setupCodeQL(
      `https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`,
      undefined,
      'token',
      'https://github.example.com',
      tmpDir,
      tmpDir,
      'runner',
      getRunnerLogger(true));

    t.assert(toolcache.find('CodeQL', `0.0.0-${version}`));
    t.is(toolcache.findAllVersions('CodeQL').length, 1);

    // Now try to request the plVersion, and see that we do not change the cache
    await codeql.setupCodeQL(
      `https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`,
      plVersion,
      'token',
      'https://github.example.com',
      tmpDir,
      tmpDir,
      'runner',
      getRunnerLogger(true));

    t.assert(toolcache.find('CodeQL', `0.0.0-${version}`));
    t.is(toolcache.findAllVersions('CodeQL').length, 1);

  });
});


test('parse codeql bundle url version', t => {

  const tests = {
    '20200601': '0.0.0-20200601',
    '20200601.0': '0.0.0-20200601.0',
    '20200601.0.0': '20200601.0.0',
    '1.2.3': '1.2.3',
    '1.2.3-alpha': '1.2.3-alpha',
    '1.2.3-beta.1': '1.2.3-beta.1',
    '20200601-linux64-python': '0.0.0-20200601-linux64-python',
  };

  for (const [version, expectedVersion] of Object.entries(tests)) {
    const url = `https://github.com/.../codeql-bundle-${version}/...`;

    try {
      const parsedVersion = codeql.getCodeQLURLVersion(url, getRunnerLogger(true));
      t.deepEqual(parsedVersion, expectedVersion);
    } catch (e) {
      t.fail(e.message);
    }
  }
});

test('getExtraOptions works for explicit paths', t => {
  t.deepEqual(codeql.getExtraOptions({}, ['foo'], []), []);

  t.deepEqual(codeql.getExtraOptions({foo: [42]}, ['foo'], []), ['42']);

  t.deepEqual(codeql.getExtraOptions({foo: {bar: [42]}}, ['foo', 'bar'], []), ['42']);
});

test('getExtraOptions works for wildcards', t => {
  t.deepEqual(codeql.getExtraOptions({'*': [42]}, ['foo'], []), ['42']);
});

test('getExtraOptions works for wildcards and explicit paths', t => {
  let o1 = {'*': [42], foo: [87]};
  t.deepEqual(codeql.getExtraOptions(o1, ['foo'], []), ['42', '87']);

  let o2 = {'*': [42], foo: [87]};
  t.deepEqual(codeql.getExtraOptions(o2, ['foo', 'bar'], []), ['42']);

  let o3 = {'*': [42], foo: { '*': [87], bar: [99]}};
  let p = ['foo', 'bar'];
  t.deepEqual(codeql.getExtraOptions(o3, p, []), ['42', '87', '99']);
});

test('getExtraOptions throws for bad content', t => {
  t.throws(() => codeql.getExtraOptions({'*': 42}, ['foo'], []));

  t.throws(() => codeql.getExtraOptions({foo: 87}, ['foo'], []));

  t.throws(() => codeql.getExtraOptions({'*': [42], foo: { '*': 87, bar: [99]}}, ['foo', 'bar'], []));
});
