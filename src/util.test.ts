import test from 'ava';
import * as fs from 'fs';

import * as util from './util';

test('getToolNames', t => {
  const input = fs.readFileSync(__dirname + '/../src/testdata/tool-names.sarif', 'utf8');
  const toolNames = util.getToolNames(input);
  t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});
