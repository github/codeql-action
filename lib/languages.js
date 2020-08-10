"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// All the languages supported by CodeQL
exports.ALL_LANGUAGES = ['csharp', 'cpp', 'go', 'java', 'javascript', 'python'];
// Additional names for languages
const LANGUAGE_ALIASES = {
    'c': 'cpp',
    'c++': 'cpp',
    'c#': 'csharp',
    'typescript': 'javascript',
};
// Translate from user input or GitHub's API names for languages to CodeQL's names for languages
function parseLanguage(language) {
    // Normalise to lower case
    language = language.toLowerCase();
    // See if it's an exact match
    const parsedLanguage = exports.ALL_LANGUAGES.find(l => l === language);
    if (parsedLanguage !== undefined) {
        return parsedLanguage;
    }
    // Check language aliases
    if (language in LANGUAGE_ALIASES) {
        return LANGUAGE_ALIASES[language];
    }
    return undefined;
}
exports.parseLanguage = parseLanguage;
function isTracedLanguage(language) {
    return ['cpp', 'java', 'csharp'].includes(language);
}
exports.isTracedLanguage = isTracedLanguage;
function isScannedLanguage(language) {
    return !isTracedLanguage(language);
}
exports.isScannedLanguage = isScannedLanguage;
//# sourceMappingURL=languages.js.map