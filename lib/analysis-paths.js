"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
function includeAndExcludeAnalysisPaths(config, languages) {
    if (config.paths.length !== 0) {
        core.exportVariable('LGTM_INDEX_INCLUDE', config.paths.join('\n'));
    }
    if (config.pathsIgnore.length !== 0) {
        core.exportVariable('LGTM_INDEX_EXCLUDE', config.pathsIgnore.join('\n'));
    }
    function isInterpretedLanguage(language) {
        return language === 'javascript' || language === 'python';
    }
    // Index include/exclude only work in javascript and python
    // If some other language is detected/configured show a warning
    if ((config.paths.length !== 0 || config.pathsIgnore.length !== 0) && !languages.every(isInterpretedLanguage)) {
        core.warning('The "paths"/"paths-ignore" fields of the config only have effect for Javascript and Python');
    }
}
exports.includeAndExcludeAnalysisPaths = includeAndExcludeAnalysisPaths;
//# sourceMappingURL=analysis-paths.js.map