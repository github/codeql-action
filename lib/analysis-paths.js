"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
function isInterpretedLanguage(language) {
    return language === "javascript" || language === "python";
}
// Matches a string containing only characters that are legal to include in paths on windows.
exports.legalWindowsPathCharactersRegex = /^[^<>:"|?]*$/;
// Builds an environment variable suitable for LGTM_INDEX_INCLUDE or LGTM_INDEX_EXCLUDE
function buildIncludeExcludeEnvVar(paths) {
    // Ignore anything containing a *
    paths = paths.filter((p) => p.indexOf("*") === -1);
    // Some characters are illegal in path names in windows
    if (process.platform === "win32") {
        paths = paths.filter((p) => p.match(exports.legalWindowsPathCharactersRegex));
    }
    return paths.join("\n");
}
function printPathFiltersWarning(config, logger) {
    // Index include/exclude/filters only work in javascript and python.
    // If any other languages are detected/configured then show a warning.
    if ((config.paths.length !== 0 || config.pathsIgnore.length !== 0) &&
        !config.languages.every(isInterpretedLanguage)) {
        logger.warning('The "paths"/"paths-ignore" fields of the config only have effect for JavaScript and Python');
    }
}
exports.printPathFiltersWarning = printPathFiltersWarning;
function includeAndExcludeAnalysisPaths(config) {
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
    const toolsRelativeToWorking = path.relative(process.cwd(), config.toolCacheDir);
    let pathsIgnore = config.pathsIgnore;
    if (!tempRelativeToWorking.startsWith("..")) {
        pathsIgnore = pathsIgnore.concat(tempRelativeToWorking);
    }
    if (!toolsRelativeToWorking.startsWith("..")) {
        pathsIgnore = pathsIgnore.concat(toolsRelativeToWorking);
    }
    if (pathsIgnore.length !== 0) {
        process.env["LGTM_INDEX_EXCLUDE"] = buildIncludeExcludeEnvVar(pathsIgnore);
    }
    // The 'LGTM_INDEX_FILTERS' environment variable controls which files are
    // extracted or ignored. It does not control which directories are traversed.
    // This does understand the glob and double-glob syntax.
    const filters = [];
    filters.push(...config.paths.map((p) => `include:${p}`));
    filters.push(...config.pathsIgnore.map((p) => `exclude:${p}`));
    if (filters.length !== 0) {
        process.env["LGTM_INDEX_FILTERS"] = filters.join("\n");
    }
}
exports.includeAndExcludeAnalysisPaths = includeAndExcludeAnalysisPaths;
//# sourceMappingURL=analysis-paths.js.map