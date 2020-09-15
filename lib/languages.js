"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const api = __importStar(require("./api-client"));
// All the languages supported by CodeQL
var Language;
(function (Language) {
    Language["csharp"] = "csharp";
    Language["cpp"] = "cpp";
    Language["go"] = "go";
    Language["java"] = "java";
    Language["javascript"] = "javascript";
    Language["python"] = "python";
})(Language = exports.Language || (exports.Language = {}));
// Additional names for languages
const LANGUAGE_ALIASES = {
    c: Language.cpp,
    "c++": Language.cpp,
    "c#": Language.csharp,
    typescript: Language.javascript,
};
// Translate from user input or GitHub's API names for languages to CodeQL's names for languages
function parseLanguage(language) {
    // Normalise to lower case
    language = language.toLowerCase();
    // See if it's an exact match
    if (language in Language) {
        return language;
    }
    // Check language aliases
    if (language in LANGUAGE_ALIASES) {
        return LANGUAGE_ALIASES[language];
    }
    return undefined;
}
exports.parseLanguage = parseLanguage;
function isTracedLanguage(language) {
    return ["cpp", "java", "csharp"].includes(language);
}
exports.isTracedLanguage = isTracedLanguage;
function isScannedLanguage(language) {
    return !isTracedLanguage(language);
}
exports.isScannedLanguage = isScannedLanguage;
function getNoLanguagesError() {
    return ("Did not detect any languages to analyze. " +
        "Please update input in workflow or check that GitHub detects the correct languages in your repository.");
}
exports.getNoLanguagesError = getNoLanguagesError;
function getUnknownLanguagesError(languages) {
    return `Did not recognise the following languages: ${languages.join(", ")}`;
}
exports.getUnknownLanguagesError = getUnknownLanguagesError;
/**
 * Get the languages to analyse.
 *
 * The result is obtained from the action input parameter 'languages' if that
 * has been set, otherwise it is deduced as all languages in the repo that
 * can be analysed.
 *
 * If no languages could be detected from either the workflow or the repository
 * then throw an error.
 */
async function getLanguages(languagesInput, repository, githubAuth, githubUrl, logger) {
    // Obtain from action input 'languages' if set
    let languages = (languagesInput || "")
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
    logger.info(`Languages from configuration: ${JSON.stringify(languages)}`);
    if (languages.length === 0) {
        // Obtain languages as all languages in the repo that can be analysed
        languages = await getLanguagesInRepo(repository, githubAuth, githubUrl, logger);
        logger.info(`Automatically detected languages: ${JSON.stringify(languages)}`);
    }
    // If the languages parameter was not given and no languages were
    // detected then fail here as this is a workflow configuration error.
    if (languages.length === 0) {
        throw new Error(getNoLanguagesError());
    }
    // Make sure they are supported
    const parsedLanguages = [];
    const unknownLanguages = [];
    for (const language of languages) {
        const parsedLanguage = parseLanguage(language);
        if (parsedLanguage === undefined) {
            unknownLanguages.push(language);
        }
        else if (parsedLanguages.indexOf(parsedLanguage) === -1) {
            parsedLanguages.push(parsedLanguage);
        }
    }
    if (unknownLanguages.length > 0) {
        throw new Error(getUnknownLanguagesError(unknownLanguages));
    }
    return parsedLanguages;
}
exports.getLanguages = getLanguages;
/**
 * Gets the set of languages in the current repository
 */
async function getLanguagesInRepo(repository, githubAuth, githubUrl, logger) {
    logger.debug(`GitHub repo ${repository.owner} ${repository.repo}`);
    const response = await api
        .getApiClient(githubAuth, githubUrl, true)
        .repos.listLanguages({
        owner: repository.owner,
        repo: repository.repo,
    });
    logger.debug(`Languages API response: ${JSON.stringify(response)}`);
    // The GitHub API is going to return languages in order of popularity,
    // When we pick a language to autobuild we want to pick the most popular traced language
    // Since sets in javascript maintain insertion order, using a set here and then splatting it
    // into an array gives us an array of languages ordered by popularity
    const languages = new Set();
    for (const lang of Object.keys(response.data)) {
        const parsedLang = parseLanguage(lang);
        if (parsedLang !== undefined) {
            languages.add(parsedLang);
        }
    }
    return [...languages];
}
//# sourceMappingURL=languages.js.map