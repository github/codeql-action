import * as fs from 'fs';

import * as util from './util';

test('getToolNames', () => {
  const input = fs.readFileSync(__dirname + '/testdata/tool-names.sarif', 'utf8')
  const toolNames = util.getToolNames(input);
  expect(toolNames).toStrictEqual(["CodeQL command-line toolchain", "ESLint"])
})
