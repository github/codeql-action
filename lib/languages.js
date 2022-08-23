"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isScannedLanguage = exports.isTracedLanguage = exports.parseLanguage = exports.Language = void 0;
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
    if (process.env["CODEQL_EXTRACTOR_GO_BUILD_TRACING"] === "true") {
        throw new Error("The CODEQL_EXTRACTOR_GO_BUILD_TRACING environment variable is set to an invalid value. " +
            "To enable Go build tracing, please set it to 'on'.");
    }
    return (["cpp", "java", "csharp", "swift"].includes(language) ||
        (process.env["CODEQL_EXTRACTOR_GO_BUILD_TRACING"] === "on" &&
            language === Language.go));
}
exports.isTracedLanguage = isTracedLanguage;
function isScannedLanguage(language) {
    return !isTracedLanguage(language);
}
exports.isScannedLanguage = isScannedLanguage;
//# sourceMappingURL=languages.js.map