import test from 'ava';
import * as fs from 'fs';
import * as os from "os";

import {setupTests} from './testing-utils';
import * as util from './util';

setupTests(test);

test('getToolNames', t => {
  const input = fs.readFileSync(__dirname + '/../src/testdata/tool-names.sarif', 'utf8');
  const toolNames = util.getToolNames(input);
  t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});

test('getMemoryFlag() should return the correct --ram flag', t => {

  const totalMem = Math.floor(os.totalmem() / (1024 * 1024));

  const tests = {
    "": `--ram=${totalMem - 256}`,
    "512": "--ram=512",
  };

  for (const [input, expectedFlag] of Object.entries(tests)) {

    process.env['INPUT_RAM'] = input;

    const flag = util.getMemoryFlag();
    t.deepEqual(flag, expectedFlag);
  }
});

test('getMemoryFlag() throws if the ram input is < 0 or NaN', t => {
  for (const input of ["-1", "hello!"]) {
    process.env['INPUT_RAM'] = input;
    t.throws(util.getMemoryFlag);
  }
});

test('getThreadsFlag() should return the correct --threads flag', t => {

  const numCpus = os.cpus().length;

  const tests = {
    "0": "--threads=0",
    "1": "--threads=1",
    [`${numCpus + 1}`]: `--threads=${numCpus}`,
    [`${-numCpus - 1}`]: `--threads=${-numCpus}`
  };

  for (const [input, expectedFlag] of Object.entries(tests)) {

    process.env['INPUT_THREADS'] = input;

    const flag = util.getThreadsFlag();
    t.deepEqual(flag, expectedFlag);
  }
});

test('getThreadsFlag() throws if the threads input is not an integer', t => {
  process.env['INPUT_THREADS'] = "hello!";
  t.throws(util.getThreadsFlag);
});

test('getRef() throws on the empty string', t => {
  process.env["GITHUB_REF"] = "";
  t.throws(util.getRef);
});

test('isLocalRun() runs correctly', t => {
  const origLocalRun = process.env.CODEQL_LOCAL_RUN;

  process.env.CODEQL_LOCAL_RUN = '';
  t.assert(!util.isLocalRun());

  process.env.CODEQL_LOCAL_RUN = 'false';
  t.assert(!util.isLocalRun());

  process.env.CODEQL_LOCAL_RUN = '0';
  t.assert(!util.isLocalRun());

  process.env.CODEQL_LOCAL_RUN = 'true';
  t.assert(util.isLocalRun());

  process.env.CODEQL_LOCAL_RUN = 'hucairz';
  t.assert(util.isLocalRun());

  process.env.CODEQL_LOCAL_RUN = origLocalRun;
});

test('prepareEnvironment() when a local run', t => {
  const origLocalRun = process.env.CODEQL_LOCAL_RUN;

  process.env.CODEQL_LOCAL_RUN = 'false';
  process.env.GITHUB_JOB = 'YYY';

  util.prepareLocalRunEnvironment();

  // unchanged
  t.deepEqual(process.env.GITHUB_JOB, 'YYY');

  process.env.CODEQL_LOCAL_RUN = 'true';

  util.prepareLocalRunEnvironment();

  // unchanged
  t.deepEqual(process.env.GITHUB_JOB, 'YYY');

  process.env.GITHUB_JOB = '';

  util.prepareLocalRunEnvironment();

  // updated
  t.deepEqual(process.env.GITHUB_JOB, 'UNKNOWN-JOB');

  process.env.CODEQL_LOCAL_RUN = origLocalRun;
});
