"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCredentials = getCredentials;
const languages_1 = require("./languages");
const util_1 = require("./util");
const LANGUAGE_TO_REGISTRY_TYPE = {
    java: "maven_repository",
    csharp: "nuget_feed",
    javascript: "npm_registry",
    python: "python_index",
    ruby: "rubygems_server",
    rust: "cargo_registry",
    // We do not have an established proxy type for these languages, thus leaving empty.
    actions: "",
    cpp: "",
    go: "",
    swift: "",
};
// getCredentials returns registry credentials from action inputs.
// It prefers `registries_credentials` over `registry_secrets`.
// If neither is set, it returns an empty array.
function getCredentials(logger, registrySecrets, registriesCredentials, languageString) {
    const language = languageString ? (0, languages_1.parseLanguage)(languageString) : undefined;
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