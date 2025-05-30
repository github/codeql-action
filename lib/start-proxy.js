"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLanguage = parseLanguage;
exports.getCredentials = getCredentials;
const languages_1 = require("./languages");
const util_1 = require("./util");
/*
 * Language aliases supported by the start-proxy Action.
 *
 * In general, the CodeQL CLI is the source of truth for language aliases, and to
 * allow us to more easily support new languages, we want to avoid hardcoding these
 * aliases in the Action itself.  However this is difficult to do in the start-proxy
 * Action since this Action does not use CodeQL, so we're accepting some hardcoding
 * for this Action.
 */
const LANGUAGE_ALIASES = {
    c: languages_1.KnownLanguage.cpp,
    "c++": languages_1.KnownLanguage.cpp,
    "c#": languages_1.KnownLanguage.csharp,
    kotlin: languages_1.KnownLanguage.java,
    typescript: languages_1.KnownLanguage.javascript,
    "javascript-typescript": languages_1.KnownLanguage.javascript,
    "java-kotlin": languages_1.KnownLanguage.java,
};
/**
 * Parse the start-proxy language input into its canonical CodeQL language name.
 *
 * Exported for testing, do not use this outside of the start-proxy Action
 * (see the `LANGUAGE_ALIASES` docstring for more info).
 */
function parseLanguage(language) {
    // Normalize to lower case
    language = language.trim().toLowerCase();
    // See if it's an exact match
    if (language in languages_1.KnownLanguage) {
        return language;
    }
    // Check language aliases, but return the original language name,
    // the alias will be resolved later.
    if (language in LANGUAGE_ALIASES) {
        return LANGUAGE_ALIASES[language];
    }
    return undefined;
}
const LANGUAGE_TO_REGISTRY_TYPE = {
    java: "maven_repository",
    csharp: "nuget_feed",
    javascript: "npm_registry",
    python: "python_index",
    ruby: "rubygems_server",
    rust: "cargo_registry",
    go: "goproxy_server",
};
// getCredentials returns registry credentials from action inputs.
// It prefers `registries_credentials` over `registry_secrets`.
// If neither is set, it returns an empty array.
function getCredentials(logger, registrySecrets, registriesCredentials, languageString) {
    const language = languageString ? parseLanguage(languageString) : undefined;
    const registryTypeForLanguage = language
        ? LANGUAGE_TO_REGISTRY_TYPE[language]
        : undefined;
    let credentialsStr;
    if (registriesCredentials !== undefined) {
        logger.info(`Using registries_credentials input.`);
        credentialsStr = Buffer.from(registriesCredentials, "base64").toString();
    }
    else if (registrySecrets !== undefined) {
        logger.info(`Using registry_secrets input.`);
        credentialsStr = registrySecrets;
    }
    else {
        logger.info(`No credentials defined.`);
        return [];
    }
    // Parse and validate the credentials
    let parsed;
    try {
        parsed = JSON.parse(credentialsStr);
    }
    catch {
        // Don't log the error since it might contain sensitive information.
        logger.error("Failed to parse the credentials data.");
        throw new util_1.ConfigurationError("Invalid credentials format.");
    }
    const out = [];
    for (const e of parsed) {
        if (e.url === undefined && e.host === undefined) {
            // The proxy needs one of these to work. If both are defined, the url has the precedence.
            throw new util_1.ConfigurationError("Invalid credentials - must specify host or url");
        }
        // Filter credentials based on language if specified. `type` is the registry type.
        // E.g., "maven_feed" for Java/Kotlin, "nuget_repository" for C#.
        if (registryTypeForLanguage && e.type !== registryTypeForLanguage) {
            continue;
        }
        const isPrintable = (str) => {
            return str ? /^[\x20-\x7E]*$/.test(str) : true;
        };
        if (!isPrintable(e.type) ||
            !isPrintable(e.host) ||
            !isPrintable(e.url) ||
            !isPrintable(e.username) ||
            !isPrintable(e.password) ||
            !isPrintable(e.token)) {
            throw new util_1.ConfigurationError("Invalid credentials - fields must contain only printable characters");
        }
        out.push({
            type: e.type,
            host: e.host,
            url: e.url,
            username: e.username,
            password: e.password,
            token: e.token,
        });
    }
    return out;
}
//# sourceMappingURL=start-proxy.js.map