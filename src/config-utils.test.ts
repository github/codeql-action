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
    process.env['RUNNER_TEMP'] = tmpDir;
    process.env['GITHUB_WORKSPACE'] = tmpDir;

    setInput('config-file', undefined);

    const config = await configUtils.loadConfig();

    t.deepEqual(config, new configUtils.Config());
  });
});

test("loading config saves config", async t => {
  return await util.withTmpDir(async tmpDir => {
    process.env['RUNNER_TEMP'] = tmpDir;
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
    process.env['RUNNER_TEMP'] = tmpDir;
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
    process.env['RUNNER_TEMP'] = tmpDir;
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
    process.env['RUNNER_TEMP'] = tmpDir;
    process.env['GITHUB_WORKSPACE'] = tmpDir;

    // Just create a generic config object with non-default values for all fields
    const inputFileContents = `
      name: my config
      disable-default-queries: true
      queries:
        - uses: ./
        - uses: ./foo
        - uses: foo/bar@dev
      paths-ignore:
        - a
        - b
      paths:
        - c/d`;

    fs.mkdirSync(path.join(tmpDir, 'foo'));

    // And the config we expect it to parse to
    const expectedConfig = new configUtils.Config();
    expectedConfig.name = 'my config';
    expectedConfig.disableDefaultQueries = true;
    expectedConfig.additionalQueries.push(fs.realpathSync(tmpDir));
    expectedConfig.additionalQueries.push(fs.realpathSync(path.join(tmpDir, 'foo')));
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

function doInvalidInputTest(
  testName: string,
  inputFileContents: string,
  expectedErrorMessageGenerator: (configFile: string) => string) {

  test("load invalid input - " + testName, async t => {
    return await util.withTmpDir(async tmpDir => {
      process.env['RUNNER_TEMP'] = tmpDir;
      process.env['GITHUB_WORKSPACE'] = tmpDir;

      const inputFile = path.join(tmpDir, 'input');
      fs.writeFileSync(inputFile, inputFileContents, 'utf8');
      setInput('config-file', 'input');

      try {
        await configUtils.loadConfig();
        throw new Error('loadConfig did not throw error');
      } catch (err) {
        t.deepEqual(err, new Error(expectedErrorMessageGenerator(inputFile)));
      }
    });
  });
}

doInvalidInputTest(
  'name invalid type',
  `
  name:
    - foo: bar`,
  configUtils.getNameInvalid);

doInvalidInputTest(
  'disable-default-queries invalid type',
  `disable-default-queries: 42`,
  configUtils.getDisableDefaultQueriesInvalid);

doInvalidInputTest(
  'queries invalid type',
  `queries: foo`,
  configUtils.getQueriesInvalid);

doInvalidInputTest(
  'paths-ignore invalid type',
  `paths-ignore: bar`,
  configUtils.getPathsIgnoreInvalid);

doInvalidInputTest(
  'paths invalid type',
  `paths: 17`,
  configUtils.getPathsInvalid);

doInvalidInputTest(
  'queries uses invalid type',
  `
  queries:
  - uses:
      - hello: world`,
  configUtils.getQueryUsesInvalid);

function doInvalidQueryUsesTest(
  input: string,
  expectedErrorMessageGenerator: (configFile: string) => string) {

  // Invalid contents of a "queries.uses" field.
  // Should fail with the expected error message
  const inputFileContents = `
    name: my config
    queries:
      - name: foo
        uses: ` + input;

  doInvalidInputTest(
    "queries uses \"" + input + "\"",
    inputFileContents,
    expectedErrorMessageGenerator);
}

// Various "uses" fields, and the errors they should produce
doInvalidQueryUsesTest(
  "''",
  c => configUtils.getQueryUsesInvalid(c, undefined));
doInvalidQueryUsesTest(
  "foo/bar",
  c => configUtils.getQueryUsesInvalid(c, "foo/bar"));
doInvalidQueryUsesTest(
  "foo/bar@v1@v2",
  c => configUtils.getQueryUsesInvalid(c, "foo/bar@v1@v2"));
doInvalidQueryUsesTest(
  "foo@master",
  c => configUtils.getQueryUsesInvalid(c, "foo@master"));
doInvalidQueryUsesTest(
  "https://github.com/foo/bar@master",
  c => configUtils.getQueryUsesInvalid(c, "https://github.com/foo/bar@master"));
doInvalidQueryUsesTest(
  "./foo",
  c => configUtils.getLocalPathDoesNotExist(c, "foo"));
doInvalidQueryUsesTest(
  "./..",
  c => configUtils.getLocalPathOutsideOfRepository(c, ".."));
