import test from 'ava';
import * as fs from 'fs';

import {silenceDebugOutput} from './testing-utils';
import * as util from './util';

silenceDebugOutput(test);

test('getToolNames', t => {
  const input = fs.readFileSync(__dirname + '/../src/testdata/tool-names.sarif', 'utf8');
  const toolNames = util.getToolNames(input);
  t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});
