import test from 'ava';

import {silenceDebugOutput} from './testing-utils';
import * as uploadLib from './upload-lib';

silenceDebugOutput(test);

test('validateSarifFileSchema - valid', t => {
  const inputFile = __dirname + '/../src/testdata/valid-sarif.sarif';
  t.true(uploadLib.validateSarifFileSchema(inputFile));
});

test('validateSarifFileSchema - invalid', t => {
  const inputFile = __dirname + '/../src/testdata/invalid-sarif.sarif';
  t.false(uploadLib.validateSarifFileSchema(inputFile));
  // validateSarifFileSchema calls core.setFailed which sets the exit code on error
  process.exitCode = 0;
});
