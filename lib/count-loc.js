"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countLoc = exports.getIdPrefix = void 0;
const github_linguist_1 = require("github-linguist");
const languages_1 = require("./languages");
const util_1 = require("./util");
// Map from linguist language names to language prefixes used in the action and codeql
const linguistToMetrics = {
    c: languages_1.Language.cpp,
    "c++": languages_1.Language.cpp,
    "c#": languages_1.Language.csharp,
    go: languages_1.Language.go,
    java: languages_1.Language.java,
    javascript: languages_1.Language.javascript,
    python: languages_1.Language.python,
    ruby: languages_1.Language.ruby,
    typescript: languages_1.Language.javascript,
};
const nameToLinguist = Object.entries(linguistToMetrics).reduce((obj, [key, name]) => {
    if (!obj[name]) {
        obj[name] = [];
    }
    obj[name].push(key);
    return obj;
}, {});
function getIdPrefix(language) {
    switch (language) {
        case languages_1.Language.cpp:
            return "cpp";
        case languages_1.Language.csharp:
            return "cs";
        case languages_1.Language.go:
            return "go";
        case languages_1.Language.java:
            return "java";
        case languages_1.Language.javascript:
            return "js";
        case languages_1.Language.python:
            return "py";
        case languages_1.Language.ruby:
            return "rb";
        default:
            util_1.assertNever(language);
    }
}
exports.getIdPrefix = getIdPrefix;
/**
 * Count the lines of code of the specified language using the include
 * and exclude glob paths.
 *
 * @param cwd the root directory to start the count from
 * @param include glob patterns to include in the search for relevant files
 * @param exclude glob patterns to exclude in the search for relevant files
 * @param dbLanguages list of languages to include in the results
 * @param logger object to log results
 */
async function countLoc(cwd, include, exclude, dbLanguages, logger) {
    const result = await new github_linguist_1.LocDir({
        cwd,
        include: Array.isArray(include) && include.length > 0 ? include : ["**"],
        exclude,
        analysisLanguages: dbLanguages.flatMap((lang) => nameToLinguist[lang]),
    }).loadInfo();
    // The analysis counts LoC in all languages. We need to
    // extract the languages we care about. Also, note that
    // the analysis uses slightly different names for language.
    const lineCounts = Object.entries(result.languages).reduce((obj, [language, { code }]) => {
        const metricsLanguage = linguistToMetrics[language];
        if (metricsLanguage && dbLanguages.includes(metricsLanguage)) {
            obj[metricsLanguage] = code + (obj[metricsLanguage] || 0);
        }
        return obj;
    }, {});
    if (Object.keys(lineCounts).length) {
        logger.debug("Lines of code count:");
        for (const [language, count] of Object.entries(lineCounts)) {
            logger.debug(`  ${language}: ${count}`);
        }
    }
    else {
        logger.info("Could not determine the baseline lines of code count in this repository. " +
            "Because of this, it will not be possible to compare the lines " +
            "of code analyzed by code scanning with the baseline. This will not affect " +
            "the results produced by code scanning. If you have any questions, you can " +
            "raise an issue at https://github.com/github/codeql-action/issues. Please " +
            "include a link to the repository if public, or otherwise information about " +
            "the code scanning workflow you are using.");
    }
    return lineCounts;
}
exports.countLoc = countLoc;
//# sourceMappingURL=count-loc.js.map