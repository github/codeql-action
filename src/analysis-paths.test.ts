import * as analysisPaths from './analysis-paths';
import * as configUtils from './config-utils';

test("emptyPaths", async () => {
    let config = new configUtils.Config();
    analysisPaths.includeAndExcludeAnalysisPaths(config, []);
    expect(process.env['LGTM_INDEX_INCLUDE']).toBeUndefined();
    expect(process.env['LGTM_INDEX_EXCLUDE']).toBeUndefined();
});

test("nonEmptyPaths", async () => {
    let config = new configUtils.Config();
    config.paths.push('path1', 'path2');
    config.pathsIgnore.push('path3', 'path4');
    analysisPaths.includeAndExcludeAnalysisPaths(config, []);
    expect(process.env['LGTM_INDEX_INCLUDE']).toEqual('path1\npath2');
    expect(process.env['LGTM_INDEX_EXCLUDE']).toEqual('path3\npath4');
});