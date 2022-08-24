"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isScannedLanguage = exports.isTracedLanguage = exports.parseLanguage = exports.Language = void 0;
const core = __importStar(require("@actions/core"));
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
function isTracedLanguage(language, logger) {
    if (process.env["CODEQL_EXTRACTOR_GO_BUILD_TRACING"] === "true") {
        logger.warning("The CODEQL_EXTRACTOR_GO_BUILD_TRACING environment variable was set to 'true', but it must " +
            "be 'on' to enable Go build tracing. Setting it to 'on'.");
        process.env["CODEQL_EXTRACTOR_GO_BUILD_TRACING"] = "on";
        core.exportVariable("CODEQL_EXTRACTOR_GO_BUILD_TRACING", "on");
    }
    return (["cpp", "java", "csharp", "swift"].includes(language) ||
        (process.env["CODEQL_EXTRACTOR_GO_BUILD_TRACING"] === "on" &&
            language === Language.go));
}
exports.isTracedLanguage = isTracedLanguage;
function isScannedLanguage(language, logger) {
    return !isTracedLanguage(language, logger);
}
exports.isScannedLanguage = isScannedLanguage;
//# sourceMappingURL=languages.js.map