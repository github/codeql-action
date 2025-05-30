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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const startProxyExports = __importStar(require("./start-proxy"));
const start_proxy_1 = require("./start-proxy");
const testing_utils_1 = require("./testing-utils");
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("getCredentials prefers registriesCredentials over registrySecrets", async (t) => {
    const registryCredentials = Buffer.from(JSON.stringify([
        { type: "npm_registry", host: "npm.pkg.github.com", token: "abc" },
    ])).toString("base64");
    const registrySecrets = JSON.stringify([
        { type: "npm_registry", host: "registry.npmjs.org", token: "def" },
    ]);
    const credentials = startProxyExports.getCredentials((0, logging_1.getRunnerLogger)(true), registrySecrets, registryCredentials, undefined);
    t.is(credentials.length, 1);
    t.is(credentials[0].host, "npm.pkg.github.com");
});
(0, ava_1.default)("getCredentials throws error when credential missing host and url", async (t) => {
    const registryCredentials = Buffer.from(JSON.stringify([{ type: "npm_registry", token: "abc" }])).toString("base64");
    t.throws(() => startProxyExports.getCredentials((0, logging_1.getRunnerLogger)(true), undefined, registryCredentials, undefined), {
        message: "Invalid credentials - must specify host or url",
    });
});
(0, ava_1.default)("getCredentials filters by language when specified", async (t) => {
    const mixedCredentials = [
        { type: "npm_registry", host: "npm.pkg.github.com", token: "abc" },
        { type: "maven_repository", host: "maven.pkg.github.com", token: "def" },
        { type: "nuget_feed", host: "nuget.pkg.github.com", token: "ghi" },
    ];
    const credentials = startProxyExports.getCredentials((0, logging_1.getRunnerLogger)(true), undefined, Buffer.from(JSON.stringify(mixedCredentials)).toString("base64"), "java");
    t.is(credentials.length, 1);
    t.is(credentials[0].type, "maven_repository");
});
(0, ava_1.default)("getCredentials returns all credentials when no language specified", async (t) => {
    const mixedCredentials = [
        { type: "npm_registry", host: "npm.pkg.github.com", token: "abc" },
        { type: "maven_repository", host: "maven.pkg.github.com", token: "def" },
        { type: "nuget_feed", host: "nuget.pkg.github.com", token: "ghi" },
    ];
    const credentialsInput = Buffer.from(JSON.stringify(mixedCredentials)).toString("base64");
    const credentials = startProxyExports.getCredentials((0, logging_1.getRunnerLogger)(true), undefined, credentialsInput, undefined);
    t.is(credentials.length, 3);
});
(0, ava_1.default)("getCredentials throws an error when non-printable characters are used", async (t) => {
    const invalidCredentials = [
        { type: "nuget_feed", host: "1nuget.pkg.github.com", token: "abc\u0000" }, // Non-printable character in token
        { type: "nuget_feed", host: "2nuget.pkg.github.com\u0001" }, // Non-printable character in host
        {
            type: "nuget_feed",
            host: "3nuget.pkg.github.com",
            password: "ghi\u0002",
        }, // Non-printable character in password
        { type: "nuget_feed", host: "4nuget.pkg.github.com", password: "ghi\x00" }, // Non-printable character in password
    ];
    for (const invalidCredential of invalidCredentials) {
        const credentialsInput = Buffer.from(JSON.stringify([invalidCredential])).toString("base64");
        t.throws(() => startProxyExports.getCredentials((0, logging_1.getRunnerLogger)(true), undefined, credentialsInput, undefined), {
            message: "Invalid credentials - fields must contain only printable characters",
        });
    }
});
(0, ava_1.default)("parseLanguage", async (t) => {
    // Exact matches
    t.deepEqual((0, start_proxy_1.parseLanguage)("csharp"), languages_1.Language.csharp);
    t.deepEqual((0, start_proxy_1.parseLanguage)("cpp"), languages_1.Language.cpp);
    t.deepEqual((0, start_proxy_1.parseLanguage)("go"), languages_1.Language.go);
    t.deepEqual((0, start_proxy_1.parseLanguage)("java"), languages_1.Language.java);
    t.deepEqual((0, start_proxy_1.parseLanguage)("javascript"), languages_1.Language.javascript);
    t.deepEqual((0, start_proxy_1.parseLanguage)("python"), languages_1.Language.python);
    t.deepEqual((0, start_proxy_1.parseLanguage)("rust"), languages_1.Language.rust);
    // Aliases
    t.deepEqual((0, start_proxy_1.parseLanguage)("c"), languages_1.Language.cpp);
    t.deepEqual((0, start_proxy_1.parseLanguage)("c++"), languages_1.Language.cpp);
    t.deepEqual((0, start_proxy_1.parseLanguage)("c#"), languages_1.Language.csharp);
    t.deepEqual((0, start_proxy_1.parseLanguage)("kotlin"), languages_1.Language.java);
    t.deepEqual((0, start_proxy_1.parseLanguage)("typescript"), languages_1.Language.javascript);
    // spaces and case-insensitivity
    t.deepEqual((0, start_proxy_1.parseLanguage)("  \t\nCsHaRp\t\t"), languages_1.Language.csharp);
    t.deepEqual((0, start_proxy_1.parseLanguage)("  \t\nkOtLin\t\t"), languages_1.Language.java);
    // Not matches
    t.deepEqual((0, start_proxy_1.parseLanguage)("foo"), undefined);
    t.deepEqual((0, start_proxy_1.parseLanguage)(" "), undefined);
    t.deepEqual((0, start_proxy_1.parseLanguage)(""), undefined);
});
//# sourceMappingURL=start-proxy.test.js.map