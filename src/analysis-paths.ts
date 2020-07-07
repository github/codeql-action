import * as core from '@actions/core';

import * as configUtils from './config-utils';

function isInterpretedLanguage(language): boolean {
  return language === 'javascript' || language === 'python';
}

export function includeAndExcludeAnalysisPaths(config: configUtils.Config, languages: string[]) {
  // The 'LGTM_INDEX_INCLUDE' and 'LGTM_INDEX_EXCLUDE' environment variables
  // control which files/directories are traversed when scanning.
  // This allows including files that otherwise would not be scanned, or
  // excluding and not traversing entire file subtrees.
  // It does not understand double-globs because that would require it to
  // traverse the entire file tree to determine which files are matched.
  if (config.paths.length !== 0) {
    core.exportVariable('LGTM_INDEX_INCLUDE', config.paths.join('\n'));
  }
  if (config.pathsIgnore.length !== 0) {
    core.exportVariable('LGTM_INDEX_EXCLUDE', config.pathsIgnore.join('\n'));
  }

  // The 'LGTM_INDEX_FILTERS' environment variable controls which files are
  // extracted or ignored. It does not control which directories are traversed.
  // This does understand the double-glob syntax.
  const filters: string[] = [];
  filters.push(...config.paths.map(p => 'include:' + p));
  filters.push(...config.pathsIgnore.map(p => 'exclude:' + p));
  if (filters.length !== 0) {
    core.exportVariable('LGTM_INDEX_FILTERS', filters.join('\n'));
  }

  // Index include/exclude/filters only work in javascript and python.
  // If any other languages are detected/configured then show a warning.
  if ((config.paths.length !== 0 ||
        config.pathsIgnore.length !== 0 ||
        filters.length !== 0) &&
      !languages.every(isInterpretedLanguage)) {
    core.warning('The "paths"/"paths-ignore" fields of the config only have effect for Javascript and Python');
  }
}
