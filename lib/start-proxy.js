"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCredentials = getCredentials;
const languages_1 = require("./languages");
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
    const parsed = JSON.parse(credentialsStr);
    const out = [];
    for (const e of parsed) {
        if (e.url === undefined && e.host === undefined) {
            throw new Error("Invalid credentials - must specify host or url");
        }
        // Filter credentials based on language if specified. `type` is the registry type.
        // E.g., "maven_feed" for Java/Kotlin, "nuget_repository" for C#.
        if (registryTypeForLanguage && e.type !== registryTypeForLanguage) {
            continue;
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