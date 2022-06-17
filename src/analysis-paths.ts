import * as path from "path";

import * as configUtils from "./config-utils";
import { Logger } from "./logging";

function isInterpretedLanguage(language): boolean {
  return (
    language === "javascript" || language === "python" || language === "ruby"
  );
}

// Matches a string containing only characters that are legal to include in paths on windows.
export const legalWindowsPathCharactersRegex = /^[^<>:"|?]*$/;

// Builds an environment variable suitable for LGTM_INDEX_INCLUDE or LGTM_INDEX_EXCLUDE
function buildIncludeExcludeEnvVar(paths: string[]): string {
  // Ignore anything containing a *
  paths = paths.filter((p) => p.indexOf("*") === -1);

  // Some characters are illegal in path names in windows
  if (process.platform === "win32") {
    paths = paths.filter((p) => p.match(legalWindowsPathCharactersRegex));
  }

  return paths.join("\n");
}

export function printPathFiltersWarning(
  config: configUtils.Config,
  logger: Logger
) {
  // Index include/exclude/filters only work in javascript/python/ruby.
  // If any other languages are detected/configured then show a warning.
  if (
    (config.paths.length !== 0 || config.pathsIgnore.length !== 0) &&
    !config.languages.every(isInterpretedLanguage)
  ) {
    logger.warning(
      'The "paths"/"paths-ignore" fields of the config only have effect for JavaScript, Python, and Ruby'
    );
  }
}

export function includeAndExcludeAnalysisPaths(config: configUtils.Config) {
  // The 'LGTM_INDEX_INCLUDE' and 'LGTM_INDEX_EXCLUDE' environment variables
  // control which files/directories are traversed when scanning.
  // This allows including files that otherwise would not be scanned, or
  // excluding and not traversing entire file subtrees.
  // It does not understand globs or double-globs because that would require it to
  // traverse the entire file tree to determine which files are matched.
  // Any paths containing "*" are not included in these.
  if (config.paths.length !== 0) {
    process.env["LGTM_INDEX_INCLUDE"] = buildIncludeExcludeEnvVar(config.paths);
  }
  // If the temporary or tools directory is in the working directory ignore that too.
  const tempRelativeToWorking = path.relative(process.cwd(), config.tempDir);
  let pathsIgnore = config.pathsIgnore;
  if (!tempRelativeToWorking.startsWith("..")) {
    pathsIgnore = pathsIgnore.concat(tempRelativeToWorking);
  }
  if (pathsIgnore.length !== 0) {
    process.env["LGTM_INDEX_EXCLUDE"] = buildIncludeExcludeEnvVar(pathsIgnore);
  }

  // The 'LGTM_INDEX_FILTERS' environment variable controls which files are
  // extracted or ignored. It does not control which directories are traversed.
  // This does understand the glob and double-glob syntax.
  const filters: string[] = [];
  filters.push(...config.paths.map((p) => `include:${p}`));
  filters.push(...config.pathsIgnore.map((p) => `exclude:${p}`));
  if (filters.length !== 0) {
    process.env["LGTM_INDEX_FILTERS"] = filters.join("\n");
  }
}
