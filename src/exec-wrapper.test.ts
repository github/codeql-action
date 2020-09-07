import * as exec from '@actions/exec';
import * as toolrunnner from '@actions/exec/lib/toolrunner';
import test from 'ava';

import { ErrorMatcher } from './error-matcher';
import { execErrorCatcher } from './exec-wrapper';
import {setupTests} from './testing-utils';

setupTests(test);

test('matchers are never applied if non-error exit', async t => {

  const testArgs = buildDummyArgs("foo bar\\nblort qux", "foo bar\\nblort qux", '', 0);

  const matchers: ErrorMatcher[] = [[123, new RegExp("foo bar"), 'error!!!']];

  t.deepEqual(await exec.exec('node', testArgs), 0);

  t.deepEqual(await execErrorCatcher('node', testArgs, matchers), 0);

});

test('regex matchers are applied to stdout for non-zero exit code', async t => {

  const testArgs = buildDummyArgs("foo bar\\nblort qux", '', '', 1);

  const matchers: ErrorMatcher[] = [[123, new RegExp("foo bar"), '🦄']];

  await t.throwsAsync(exec.exec('node', testArgs), {instanceOf: Error, message: 'The process \'node\' failed with exit code 1'});

  await t.throwsAsync(
    execErrorCatcher('node', testArgs, matchers),
    {instanceOf: Error, message: '🦄'}
    );

});

test('regex matchers are applied to stderr for non-zero exit code', async t => {

  const testArgs = buildDummyArgs("non matching string", 'foo bar\\nblort qux', '', 1);

  const matchers: ErrorMatcher[] = [[123, new RegExp("foo bar"), '🦄']];

  await t.throwsAsync(exec.exec('node', testArgs), {instanceOf: Error, message: 'The process \'node\' failed with exit code 1'});

  await t.throwsAsync(
    execErrorCatcher('node', testArgs, matchers),
    {instanceOf: Error, message: '🦄'}
    );

});

test('matcher returns correct error message when multiple matchers defined', async t => {

  const testArgs = buildDummyArgs("non matching string", 'foo bar\\nblort qux', '', 1);

  const matchers: ErrorMatcher[] = [[456, new RegExp("lorem ipsum"), '😩'],
                                    [123, new RegExp("foo bar"), '🦄'],
                                    [789, new RegExp("blah blah"), '🤦‍♂️']];

  await t.throwsAsync(exec.exec('node', testArgs), {instanceOf: Error, message: 'The process \'node\' failed with exit code 1'});

  await t.throwsAsync(
    execErrorCatcher('node', testArgs, matchers),
    {instanceOf: Error, message: '🦄'}
    );

});

test('matcher returns first match to regex when multiple matches', async t => {

  const testArgs = buildDummyArgs("non matching string", 'foo bar\\nblort qux', '', 1);

  const matchers: ErrorMatcher[] = [[123, new RegExp("foo bar"), '🦄'],
                                    [789, new RegExp("blah blah"), '🤦‍♂️'],
                                    [987, new RegExp("foo bar"), '🚫']];

  await t.throwsAsync(exec.exec('node', testArgs), {instanceOf: Error, message: 'The process \'node\' failed with exit code 1'});

  await t.throwsAsync(
    execErrorCatcher('node', testArgs, matchers),
    {instanceOf: Error, message: '🦄'}
    );

});

test('exit code matchers are applied', async t => {

  const testArgs = buildDummyArgs("non matching string", 'foo bar\\nblort qux', '', 123);

  const matchers: ErrorMatcher[] = [[123, new RegExp("this will not match"), '🦄']];

  await t.throwsAsync(exec.exec('node', testArgs), {instanceOf: Error, message: 'The process \'node\' failed with exit code 123'});

  await t.throwsAsync(
    execErrorCatcher('node', testArgs, matchers),
    {instanceOf: Error, message: '🦄'}
    );

});

test('execErrorCatcher respects the ignoreReturnValue option', async t => {
  const testArgs = buildDummyArgs("standard output", 'error output', '', 199);

  await t.throwsAsync(execErrorCatcher('node', testArgs, [], {ignoreReturnCode: false}), {instanceOf: Error});

  t.deepEqual(await execErrorCatcher('node', testArgs, [], {ignoreReturnCode: true}), 199);

});

test('execErrorCatcher preserves behavior of provided listeners', async t => {

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

  const testArgs = buildDummyArgs(stdoutExpected, stderrExpected, '', 0);

  t.deepEqual(await execErrorCatcher('node', testArgs, [], {listeners: listeners}), 0);

  t.deepEqual(stdoutActual, stdoutExpected + "\n");
  t.deepEqual(stderrActual, stderrExpected + "\n");

});

function buildDummyArgs(stdoutContents: string, stderrContents: string,
                        desiredErrorMessage?: string, desiredExitCode?: number): string[] {

  let command = '';

  if (stdoutContents) command += 'console.log(\\"' + stdoutContents + '\\");';
  if (stderrContents) command += 'console.error(\\"' + stderrContents + '\\");';

  if (command.length === 0) throw new Error("Must provide contents for either stdout or stderr");

  if (desiredErrorMessage) command += 'throw new Error(\\"' + desiredErrorMessage + '\\");';
  if (desiredExitCode) command += 'process.exitCode = ' + desiredExitCode + ';';

  return toolrunnner.argStringToArray('-e "' + command + '"');
}
