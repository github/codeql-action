import test from 'ava';

import * as analysisPaths from './analysis-paths';
import * as configUtils from './config-utils';
import {setupTests} from './testing-utils';

setupTests(test);

test("emptyPaths", async t => {
  let config = new configUtils.Config();
  analysisPaths.includeAndExcludeAnalysisPaths(config, []);
  t.is(process.env['LGTM_INDEX_INCLUDE'], undefined);
  t.is(process.env['LGTM_INDEX_EXCLUDE'], undefined);
  t.is(process.env['LGTM_INDEX_FILTERS'], undefined);
});

test("nonEmptyPaths", async t => {
  let config = new configUtils.Config();
  config.paths.push('path1', 'path2', '**/path3');
  config.pathsIgnore.push('path4', 'path5', 'path6/**');
  analysisPaths.includeAndExcludeAnalysisPaths(config, []);
  t.is(process.env['LGTM_INDEX_INCLUDE'], 'path1\npath2');
  t.is(process.env['LGTM_INDEX_EXCLUDE'], 'path4\npath5');
  t.is(process.env['LGTM_INDEX_FILTERS'], 'include:path1\ninclude:path2\ninclude:**/path3\nexclude:path4\nexclude:path5\nexclude:path6/**');
});
