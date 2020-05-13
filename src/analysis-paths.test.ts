import test from 'ava';

import * as analysisPaths from './analysis-paths';
import * as configUtils from './config-utils';

test("emptyPaths", async t => {
    let config = new configUtils.Config();
    analysisPaths.includeAndExcludeAnalysisPaths(config, []);
    t.is(process.env['LGTM_INDEX_INCLUDE'], undefined);
    t.is(process.env['LGTM_INDEX_EXCLUDE'], undefined);
});

test("nonEmptyPaths", async t => {
    let config = new configUtils.Config();
    config.paths.push('path1', 'path2');
    config.pathsIgnore.push('path3', 'path4');
    analysisPaths.includeAndExcludeAnalysisPaths(config, []);
    t.is(process.env['LGTM_INDEX_INCLUDE'], 'path1\npath2');
    t.is(process.env['LGTM_INDEX_EXCLUDE'], 'path3\npath4');
});
