import * as core from '@actions/core';

import * as configUtils from './config-utils';

function isInterpretedLanguage(language): boolean {
  return language === 'javascript' || language === 'python';
}

// Builds an environment variable suitable for LGTM_INDEX_INCLUDE or LGTM_INDEX_EXCLUDE
function buildIncludeExcludeEnvVar(paths: string[]): string {
  return paths.filter(p => p.indexOf('**') === -1).join('\n');
}

export function includeAndExcludeAnalysisPaths(config: configUtils.Config, languages: string[]) {
  // The 'LGTM_INDEX_INCLUDE' and 'LGTM_INDEX_EXCLUDE' environment variables
  // control which files/directories are traversed when scanning.
  // This allows including files that otherwise would not be scanned, or
  // excluding and not traversing entire file subtrees.
  // It does not understand double-globs because that would require it to
  // traverse the entire file tree to determine which files are matched.
  // Any paths containing "**" are not included in these.
  if (config.paths.length !== 0) {
    core.exportVariable('LGTM_INDEX_INCLUDE', buildIncludeExcludeEnvVar(config.paths));
  }
  if (config.pathsIgnore.length !== 0) {
    core.exportVariable('LGTM_INDEX_EXCLUDE', buildIncludeExcludeEnvVar(config.pathsIgnore));
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
