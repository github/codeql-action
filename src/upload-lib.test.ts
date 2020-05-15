import test from 'ava';

import * as uploadLib from './upload-lib';

test('validateSarifFileSchema - valid', t => {
  const inputFile = __dirname + '/../src/testdata/valid-sarif.sarif';
  const errors = uploadLib.validateSarifFileSchema(inputFile);
  t.deepEqual(errors, []);
});

test('validateSarifFileSchema - invalid', t => {
  const inputFile = __dirname + '/../src/testdata/invalid-sarif.sarif';
  const errors = uploadLib.validateSarifFileSchema(inputFile);
  t.notDeepEqual(errors, []);
});
