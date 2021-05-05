"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const github_linguist_1 = require("github-linguist");
// Map from linguist language names to language prefixes used in our metrics
const supportedLanguages = {
    c: "cpp",
    "c++": "cpp",
    "c#": "cs",
    go: "go",
    java: "java",
    javascript: "js",
    python: "py",
    ruby: "rb",
    typescript: "js",
};
const supportedLanguagesReversed = Object.entries(supportedLanguages).reduce((obj, [key, value]) => {
    if (!obj[value]) {
        obj[value] = [];
    }
    obj[value].push(key);
    return obj;
}, {});
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
        include: ["**"].concat(include || []),
        exclude,
        analysisLanguages: dbLanguages.flatMap((lang) => supportedLanguagesReversed[lang]),
    }).loadInfo();
    // The analysis counts LoC in all languages. We need to
    // extract the languages we care about. Also, note that
    // the analysis uses slightly different names for language.
    const lineCounts = Object.entries(result.languages).reduce((obj, [language, { code }]) => {
        const dbLanguage = supportedLanguages[language];
        if (dbLanguage && dbLanguages.includes(dbLanguage)) {
            obj[dbLanguage] = code + (obj[dbLanguage] || 0);
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
        logger.info("Could not determine the total number of lines of code in this repository. " +
            "Because of this, it will not be possible to compare the number of lines " +
            "of code analyzed by code scanning with the total number of lines of " +
            "code in the repository. This will not affect the results produced by code " +
            "scanning. If you have any questions, you can raise an issue at " +
            "https://github.com/github/codeql-action/issues. Please include a link " +
            "to the repository if public, or otherwise information about the code scanning " +
            "workflow you are using.");
    }
    return lineCounts;
}
exports.countLoc = countLoc;
//# sourceMappingURL=count-loc.js.map