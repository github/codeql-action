"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isScannedLanguage = exports.isTracedLanguage = exports.parseLanguage = exports.resolveAlias = exports.KOTLIN_SWIFT_BYPASS = exports.LANGUAGE_ALIASES = exports.Language = void 0;
// All the languages supported by CodeQL
var Language;
(function (Language) {
    Language["csharp"] = "csharp";
    Language["cpp"] = "cpp";
    Language["go"] = "go";
    Language["java"] = "java";
    Language["javascript"] = "javascript";
    Language["python"] = "python";
    Language["ruby"] = "ruby";
    Language["swift"] = "swift";
})(Language = exports.Language || (exports.Language = {}));
// Additional names for languages
exports.LANGUAGE_ALIASES = {
    c: Language.cpp,
    "c++": Language.cpp,
    "c#": Language.csharp,
    kotlin: Language.java,
    typescript: Language.javascript,
};
exports.KOTLIN_SWIFT_BYPASS = ["kotlin", "swift"];
function resolveAlias(lang) {
    return exports.LANGUAGE_ALIASES[lang] || lang;
}
exports.resolveAlias = resolveAlias;
/**
 * Translate from user input or GitHub's API names for languages to CodeQL's
 * names for languages. This does not translate a language alias to the actual
 * language used by CodeQL.
 *
 * @param language The language to translate.
 * @returns A language supported by CodeQL, an alias for a language, or
 * `undefined` if the input language cannot be parsed into a langauge supported
 * by CodeQL.
 */
function parseLanguage(language) {
    // Normalise to lower case
    language = language.trim().toLowerCase();
    // See if it's an exact match
    if (language in Language) {
        return language;
    }
    // Check language aliases, but return the original language name,
    // the alias will be resolved later.
    if (language in exports.LANGUAGE_ALIASES) {
        return language;
    }
    return undefined;
}
exports.parseLanguage = parseLanguage;
function isTracedLanguage(language) {
    return [
        Language.cpp,
        Language.csharp,
        Language.go,
        Language.java,
        Language.swift,
    ].includes(language);
}
exports.isTracedLanguage = isTracedLanguage;
function isScannedLanguage(language) {
    return !isTracedLanguage(language);
}
exports.isScannedLanguage = isScannedLanguage;
//# sourceMappingURL=languages.js.map