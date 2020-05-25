import test from 'ava';
import * as fs from 'fs';
import * as path from 'path';

import * as configUtils from './config-utils';
import * as util from './util';

function setInput(name: string, value: string | undefined) {
  // Transformation copied from
  // https://github.com/actions/toolkit/blob/05e39f551d33e1688f61b209ab5cdd335198f1b8/packages/core/src/core.ts#L69
  const envVar = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  if (value !== undefined) {
    process.env[envVar] = value;
  } else {
    delete process.env[envVar];
  }
}

test("load empty config", async t => {
  return await util.withTmpDir(async tmpDir => {
    process.env['RUNNER_WORKSPACE'] = tmpDir;
    process.env['GITHUB_WORKSPACE'] = tmpDir;

    setInput('config-file', undefined);

    const config = await configUtils.loadConfig();

    t.deepEqual(config, new configUtils.Config());
  });
});

test("loading config saves config", async t => {
  return await util.withTmpDir(async tmpDir => {
    process.env['RUNNER_WORKSPACE'] = tmpDir;
    process.env['GITHUB_WORKSPACE'] = tmpDir;

    const configFile = configUtils.getConfigFile();
    // Sanity check the saved config file does not already exist
    t.false(fs.existsSync(configFile));

    const config = await configUtils.loadConfig();

    // The saved config file should now exist
    t.true(fs.existsSync(configFile));

    // And the contents should parse correctly to the config that was returned
    t.deepEqual(fs.readFileSync(configFile, 'utf8'), JSON.stringify(config));
  });
});

test("load input outside of workspace", async t => {
  return await util.withTmpDir(async tmpDir => {
    process.env['RUNNER_WORKSPACE'] = tmpDir;
    process.env['GITHUB_WORKSPACE'] = tmpDir;

    setInput('config-file', '../input');

    try {
      await configUtils.loadConfig();
      throw new Error('loadConfig did not throw error');
    } catch (err) {
      t.deepEqual(err, new Error(configUtils.getConfigFileOutsideWorkspaceErrorMessage(path.join(tmpDir, '../input'))));
    }
  });
});

test("load non-existent input", async t => {
  return await util.withTmpDir(async tmpDir => {
    process.env['RUNNER_WORKSPACE'] = tmpDir;
    process.env['GITHUB_WORKSPACE'] = tmpDir;

    t.false(fs.existsSync(path.join(tmpDir, 'input')));
    setInput('config-file', 'input');

    try {
      await configUtils.loadConfig();
      throw new Error('loadConfig did not throw error');
    } catch (err) {
      t.deepEqual(err, new Error(configUtils.getConfigFileDoesNotExistErrorMessage(path.join(tmpDir, 'input'))));
    }
  });
});

test("load non-empty input", async t => {
  return await util.withTmpDir(async tmpDir => {
    process.env['RUNNER_WORKSPACE'] = tmpDir;
    process.env['GITHUB_WORKSPACE'] = tmpDir;

    // Just create a generic config object with non-default values for all fields
    const inputFileContents = `
      name: my config
      disable-default-queries: true
      queries:
        - uses: ./foo
        - uses: foo/bar@dev
      paths-ignore:
        - a
        - b
      paths:
        - c/d`;

    // And the config we expect it to parse to
    const expectedConfig = new configUtils.Config();
    expectedConfig.name = 'my config';
    expectedConfig.disableDefaultQueries = true;
    expectedConfig.additionalQueries.push('foo');
    expectedConfig.externalQueries = [new configUtils.ExternalQuery('foo/bar', 'dev')];
    expectedConfig.pathsIgnore = ['a', 'b'];
    expectedConfig.paths = ['c/d'];

    fs.writeFileSync(path.join(tmpDir, 'input'), inputFileContents, 'utf8');
    setInput('config-file', 'input');

    const actualConfig = await configUtils.loadConfig();

    // Should exactly equal the object we constructed earlier
    t.deepEqual(actualConfig, expectedConfig);
  });
});

test("load partially invalid input", async t => {
  return await util.withTmpDir(async tmpDir => {
    process.env['RUNNER_WORKSPACE'] = tmpDir;
    process.env['GITHUB_WORKSPACE'] = tmpDir;

    // The valid parts of this config should be parsed correctly.
    // The invalid parts should be ignored and left as the default values.
    const inputFileContents = `
      name:
        - foo: bar
      disable-default-queries: 42
      queries:
        - name: foo/bar
          uses: foo/bar@dev
      paths-ignore:
        - a
        - b
      paths:
        - c/d`;

    // And the config we expect it to parse to
    const expectedConfig = new configUtils.Config();
    expectedConfig.externalQueries = [new configUtils.ExternalQuery('foo/bar', 'dev')];
    expectedConfig.pathsIgnore = ['a', 'b'];
    expectedConfig.paths = ['c/d'];

    fs.writeFileSync(path.join(tmpDir, 'input'), inputFileContents, 'utf8');
    setInput('config-file', 'input');

    const actualConfig = await configUtils.loadConfig();

    // Should exactly equal the object we constructed earlier
    t.deepEqual(actualConfig, expectedConfig);
  });
});

test("load invalid input - top level entries", async t => {
  return await util.withTmpDir(async tmpDir => {
    process.env['RUNNER_WORKSPACE'] = tmpDir;
    process.env['GITHUB_WORKSPACE'] = tmpDir;

    // Replace the arrays with strings or numbers.
    // The invalid parts should be ignored and left as the default values.
    const inputFileContents = `
      name: my config
      disable-default-queries: true
      queries: foo
      paths-ignore: bar
      paths: 123`;

    // And the config we expect it to parse to
    const expectedConfig = new configUtils.Config();
    expectedConfig.name = 'my config';
    expectedConfig.disableDefaultQueries = true;

    fs.writeFileSync(path.join(tmpDir, 'input'), inputFileContents, 'utf8');
    setInput('config-file', 'input');

    const actualConfig = await configUtils.loadConfig();

    // Should exactly equal the object we constructed earlier
    t.deepEqual(actualConfig, expectedConfig);
  });
});

test("load invalid input - queries field type", async t => {
  return await util.withTmpDir(async tmpDir => {
    process.env['RUNNER_WORKSPACE'] = tmpDir;
    process.env['GITHUB_WORKSPACE'] = tmpDir;

    // Invalid contents of the "queries" array.
    // The invalid parts should be ignored and left as the default values.
    const inputFileContents = `
      name: my config
      disable-default-queries: true
      queries:
        - name: foo
          uses:
            - hello: world
        - name: bar
          uses: github/bar@master`;

    // And the config we expect it to parse to
    const expectedConfig = new configUtils.Config();
    expectedConfig.name = 'my config';
    expectedConfig.disableDefaultQueries = true;
    expectedConfig.externalQueries.push(new configUtils.ExternalQuery("github/bar", "master"));

    fs.writeFileSync(path.join(tmpDir, 'input'), inputFileContents, 'utf8');
    setInput('config-file', 'input');

    const actualConfig = await configUtils.loadConfig();

    // Should exactly equal the object we constructed earlier
    t.deepEqual(actualConfig, expectedConfig);
  });
});

// Various "uses" fields, and the errors they should produce
const testInputs = {
  "''": configUtils.getQueryUsesBlank(),
  "foo/bar": configUtils.getQueryUsesIncorrect("foo/bar"),
  "foo/bar@v1@v2": configUtils.getQueryUsesIncorrect("foo/bar@v1@v2"),
  "foo@master": configUtils.getQueryUsesIncorrect("foo@master"),
  "https://github.com/foo/bar@master": configUtils.getQueryUsesIncorrect("https://github.com/foo/bar@master")
};

for (const [input, result] of Object.entries(testInputs)) {
  test("load invalid input - queries uses \"" + input + "\"", async t => {
    return await util.withTmpDir(async tmpDir => {
      process.env['RUNNER_WORKSPACE'] = tmpDir;
      process.env['GITHUB_WORKSPACE'] = tmpDir;

      // Invalid contents of a "queries.uses" field.
      // Should fail with the expected error message
      const inputFileContents = `
        name: my config
        queries:
          - name: foo
            uses: ` + input;

      fs.writeFileSync(path.join(tmpDir, 'input'), inputFileContents, 'utf8');
      setInput('config-file', 'input');

      try {
        await configUtils.loadConfig();
        throw new Error('loadConfig did not throw error');
      } catch (err) {
        t.deepEqual(err, new Error(result));
      }
    });
  });
}
