import test from 'ava';

import {setupTests} from './testing-utils';
import * as uploadLib from './upload-lib';

setupTests(test);

test('validateSarifFileSchema - valid', t => {
  const inputFile = __dirname + '/../src/testdata/valid-sarif.sarif';
  t.notThrows(() => uploadLib.validateSarifFileSchema(inputFile));
});

test('validateSarifFileSchema - invalid', t => {
  const inputFile = __dirname + '/../src/testdata/invalid-sarif.sarif';
  t.throws(() => uploadLib.validateSarifFileSchema(inputFile));
});
