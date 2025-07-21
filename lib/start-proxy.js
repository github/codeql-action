"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCredentials = getCredentials;
const core = __importStar(require("@actions/core"));
const languages_1 = require("./languages");
const util_1 = require("./util");
const LANGUAGE_TO_REGISTRY_TYPE = {
    java: "maven_repository",
    csharp: "nuget_feed",
    javascript: "npm_registry",
    python: "python_index",
    ruby: "rubygems_server",
    rust: "cargo_registry",
    go: "goproxy_server",
    // We do not have an established proxy type for these languages, thus leaving empty.
    actions: "",
    cpp: "",
    swift: "",
};
/**
 * Checks that `value` is neither `undefined` nor `null`.
 * @param value The value to test.
 * @returns Narrows the type of `value` to exclude `undefined` and `null`.
 */
function isDefined(value) {
    return value !== undefined && value !== null;
}
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
    // Check that the parsed data is indeed an array.
    if (!Array.isArray(parsed)) {
        throw new util_1.ConfigurationError("Expected credentials data to be an array of configurations, but it is not.");
    }
    const out = [];
    for (const e of parsed) {
        if (e === null || typeof e !== "object") {
            throw new util_1.ConfigurationError("Invalid credentials - must be an object");
        }
        // Mask credentials to reduce chance of accidental leakage in logs.
        if (isDefined(e.password)) {
            core.setSecret(e.password);
        }
        if (isDefined(e.token)) {
            core.setSecret(e.token);
        }
        if (!isDefined(e.url) && !isDefined(e.host)) {
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