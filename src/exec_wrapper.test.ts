import * as exec from '@actions/exec';
import test from 'ava';

import { exec_wrapper, ErrorMatcher } from './exec_wrapper';
import {setupTests} from './testing-utils';
// import fs from 'fs';

// import { exec_wrapper } from './exec_wrapper';

// const matchers: [[number, RegExp, string]] = [
//   [-999,
//     new RegExp("match this string"),
//     'No source code was found. CUSTOM ERROR MESSAGE HERE'],
// ];

setupTests(test);

test('matchers are never applied if non-error exit', async t => {

  const testCommand = buildDummyCommand("foo bar\\nblort qux", "foo bar\\nblort qux", '', 0);

  const matchers: ErrorMatcher[] = [[123, new RegExp("foo bar"), 'error!!!']];

  t.deepEqual(await exec.exec(testCommand), 0);

  t.deepEqual(await exec_wrapper(testCommand, [], matchers), 0);

});

test('regex matchers are applied to stdout for non-zero exit code', async t => {

  const testCommand = buildDummyCommand("foo bar\\nblort qux", '', '', 1);

  const matchers: ErrorMatcher[] = [[123, new RegExp("foo bar"), '🦄']];

  await t.throwsAsync(exec.exec(testCommand), {instanceOf: Error, message: 'The process \'node\' failed with exit code 1'});

  await t.throwsAsync(
    exec_wrapper(testCommand, [], matchers),
    {instanceOf: Error, message: '🦄'}
    );

});

test('regex matchers are applied to stderr for non-zero exit code', async t => {

  const testCommand = buildDummyCommand("non matching string", 'foo bar\\nblort qux', '', 1);

  const matchers: ErrorMatcher[] = [[123, new RegExp("foo bar"), '🦄']];

  await t.throwsAsync(exec.exec(testCommand), {instanceOf: Error, message: 'The process \'node\' failed with exit code 1'});

  await t.throwsAsync(
    exec_wrapper(testCommand, [], matchers),
    {instanceOf: Error, message: '🦄'}
    );

});

test('matcher returns correct error message when multiple matchers defined', async t => {

  const testCommand = buildDummyCommand("non matching string", 'foo bar\\nblort qux', '', 1);

  const matchers: ErrorMatcher[] = [[456, new RegExp("lorem ipsum"), '😩'],
                                    [123, new RegExp("foo bar"), '🦄'],
                                    [789, new RegExp("blah blah"), '🤦‍♂️']];

  await t.throwsAsync(exec.exec(testCommand), {instanceOf: Error, message: 'The process \'node\' failed with exit code 1'});

  await t.throwsAsync(
    exec_wrapper(testCommand, [], matchers),
    {instanceOf: Error, message: '🦄'}
    );

});

test('matcher returns first match to regex when multiple matches', async t => {

  const testCommand = buildDummyCommand("non matching string", 'foo bar\\nblort qux', '', 1);

  const matchers: ErrorMatcher[] = [[123, new RegExp("foo bar"), '🦄'],
                                    [789, new RegExp("blah blah"), '🤦‍♂️'],
                                    [987, new RegExp("foo bar"), '🚫']];

  await t.throwsAsync(exec.exec(testCommand), {instanceOf: Error, message: 'The process \'node\' failed with exit code 1'});

  await t.throwsAsync(
    exec_wrapper(testCommand, [], matchers),
    {instanceOf: Error, message: '🦄'}
    );

});

test('exit code matchers are applied', async t => {

  const testCommand = buildDummyCommand("non matching string", 'foo bar\\nblort qux', '', 123);

  const matchers: ErrorMatcher[] = [[123, new RegExp("this will not match"), '🦄']];

  await t.throwsAsync(exec.exec(testCommand), {instanceOf: Error, message: 'The process \'node\' failed with exit code 123'});

  await t.throwsAsync(
    exec_wrapper(testCommand, [], matchers),
    {instanceOf: Error, message: '🦄'}
    );

});

test('exec_wrapper respects the ignoreReturnValue option', async t => {
  const testCommand = buildDummyCommand("standard output", 'error output', '', 199);

  await t.throwsAsync(exec_wrapper(testCommand, [], [], {ignoreReturnCode: false}), {instanceOf: Error});

  t.deepEqual(await exec_wrapper(testCommand, [], [], {ignoreReturnCode: true}), 199);

});

test('exec_wrapper preserves behavior of provided listeners', async t => {

  let stdoutExpected = 'standard output';
  let stderrExpected = 'error output';

  let stdoutActual = '';
  let stderrActual = '';

  let listeners = {
    stdout: (data: Buffer) => {
      stdoutActual += data.toString();
    },
    stderr: (data: Buffer) => {
      stderrActual += data.toString();
    }
  };

  const testCommand = buildDummyCommand(stdoutExpected, stderrExpected, '', 0);

  t.deepEqual(await exec_wrapper(testCommand, [], [], {listeners: listeners}), 0);

  t.deepEqual(stdoutActual, stdoutExpected + "\n");
  t.deepEqual(stderrActual, stderrExpected + "\n");

});

function buildDummyCommand(stdoutContents: string, stderrContents: string,
                           desiredErrorMessage?: string, desiredExitCode?: number): string {

  let command = '';

  if (stdoutContents) command += 'console.log(\\"' + stdoutContents + '\\");';
  if (stderrContents) command += 'console.error(\\"' + stderrContents + '\\");';

  if (command.length === 0) throw new Error("Must provide contents for either stdout or stderr");

  if (desiredErrorMessage) command += 'throw new Error(\\"' + desiredErrorMessage + '\\");';
  if (desiredExitCode) command += 'process.exitCode = ' + desiredExitCode + ';';

  return 'node -e "' + command + '"';
}
