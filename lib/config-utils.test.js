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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const github = __importStar(require("@actions/github"));
const ava_1 = __importDefault(require("ava"));
const yaml = __importStar(require("js-yaml"));
const sinon = __importStar(require("sinon"));
const api = __importStar(require("./api-client"));
const caching_utils_1 = require("./caching-utils");
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
const githubVersion = { type: util_1.GitHubVariant.DOTCOM };
function createTestInitConfigInputs(overrides) {
    return Object.assign({}, {
        languagesInput: undefined,
        queriesInput: undefined,
        packsInput: undefined,
        configFile: undefined,
        dbLocation: undefined,
        configInput: undefined,
        buildModeInput: undefined,
        trapCachingEnabled: false,
        dependencyCachingEnabled: caching_utils_1.CachingKind.None,
        debugMode: false,
        debugArtifactName: "",
        debugDatabaseName: "",
        repository: { owner: "github", repo: "example" },
        tempDir: "",
        codeql: {},
        workspacePath: "",
        githubVersion,
        apiDetails: {
            auth: "token",
            externalRepoAuth: "token",
            url: "https://github.example.com",
            apiURL: undefined,
            registriesAuthTokens: undefined,
        },
        features: (0, testing_utils_1.createFeatures)([]),
        logger: (0, logging_1.getRunnerLogger)(true),
    }, overrides);
}
// Returns the filepath of the newly-created file
function createConfigFile(inputFileContents, tmpDir) {
    const configFilePath = path.join(tmpDir, "input");
    fs.writeFileSync(configFilePath, inputFileContents, "utf8");
    return configFilePath;
}
function mockGetContents(content) {
    // Passing an auth token is required, so we just use a dummy value
    const client = github.getOctokit("123");
    const response = {
        data: content,
    };
    const spyGetContents = sinon
        .stub(client.rest.repos, "getContent")
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .resolves(response);
    sinon.stub(api, "getApiClient").value(() => client);
    sinon.stub(api, "getApiClientWithExternalAuth").value(() => client);
    return spyGetContents;
}
function mockListLanguages(languages) {
    // Passing an auth token is required, so we just use a dummy value
    const client = github.getOctokit("123");
    const response = {
        data: {},
    };
    for (const language of languages) {
        response.data[language] = 123;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    sinon.stub(client.rest.repos, "listLanguages").resolves(response);
    sinon.stub(api, "getApiClient").value(() => client);
}
(0, ava_1.default)("load empty config", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        const logger = (0, logging_1.getRunnerLogger)(true);
        const languages = "javascript,python";
        const codeql = (0, codeql_1.setCodeQL)({
            async resolveQueries() {
                return {
                    byLanguage: {
                        javascript: { queries: ["query1.ql"] },
                        python: { queries: ["query2.ql"] },
                    },
                    noDeclaredLanguage: {},
                    multipleDeclaredLanguages: {},
                };
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        const config = await configUtils.initConfig(createTestInitConfigInputs({
            languagesInput: languages,
            repository: { owner: "github", repo: "example" },
            tempDir,
            codeql,
            logger,
        }));
        t.deepEqual(config, await configUtils.getDefaultConfig(createTestInitConfigInputs({
            languagesInput: languages,
            tempDir,
            codeql,
            logger,
        })));
    });
});
(0, ava_1.default)("loading config saves config", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        const logger = (0, logging_1.getRunnerLogger)(true);
        const codeql = (0, codeql_1.setCodeQL)({
            async resolveQueries() {
                return {
                    byLanguage: {
                        javascript: { queries: ["query1.ql"] },
                        python: { queries: ["query2.ql"] },
                    },
                    noDeclaredLanguage: {},
                    multipleDeclaredLanguages: {},
                };
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        // Sanity check the saved config file does not already exist
        t.false(fs.existsSync(configUtils.getPathToParsedConfigFile(tempDir)));
        // Sanity check that getConfig returns undefined before we have called initConfig
        t.deepEqual(await configUtils.getConfig(tempDir, logger), undefined);
        const config1 = await configUtils.initConfig(createTestInitConfigInputs({
            languagesInput: "javascript,python",
            tempDir,
            codeql,
            workspacePath: tempDir,
            logger,
        }));
        // The saved config file should now exist
        t.true(fs.existsSync(configUtils.getPathToParsedConfigFile(tempDir)));
        // And that same newly-initialised config should now be returned by getConfig
        const config2 = await configUtils.getConfig(tempDir, logger);
        t.not(config2, undefined);
        if (config2 !== undefined) {
            // removes properties assigned to undefined.
            const expectedConfig = JSON.parse(JSON.stringify(config1));
            t.deepEqual(expectedConfig, config2);
        }
    });
});
(0, ava_1.default)("load input outside of workspace", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        try {
            await configUtils.initConfig(createTestInitConfigInputs({
                configFile: "../input",
                tempDir,
                codeql: (0, codeql_1.getCachedCodeQL)(),
                workspacePath: tempDir,
            }));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new util_1.ConfigurationError(configUtils.getConfigFileOutsideWorkspaceErrorMessage(path.join(tempDir, "../input"))));
        }
    });
});
(0, ava_1.default)("load non-local input with invalid repo syntax", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        // no filename given, just a repo
        const configFile = "octo-org/codeql-config@main";
        try {
            await configUtils.initConfig(createTestInitConfigInputs({
                configFile,
                tempDir,
                codeql: (0, codeql_1.getCachedCodeQL)(),
                workspacePath: tempDir,
            }));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new util_1.ConfigurationError(configUtils.getConfigFileRepoFormatInvalidMessage("octo-org/codeql-config@main")));
        }
    });
});
(0, ava_1.default)("load non-existent input", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        const languagesInput = "javascript";
        const configFile = "input";
        t.false(fs.existsSync(path.join(tempDir, configFile)));
        try {
            await configUtils.initConfig(createTestInitConfigInputs({
                languagesInput,
                configFile,
                tempDir,
                codeql: (0, codeql_1.getCachedCodeQL)(),
                workspacePath: tempDir,
            }));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new util_1.ConfigurationError(configUtils.getConfigFileDoesNotExistErrorMessage(path.join(tempDir, "input"))));
        }
    });
});
(0, ava_1.default)("load non-empty input", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        const codeql = (0, codeql_1.setCodeQL)({
            async resolveQueries() {
                return {
                    byLanguage: {
                        javascript: {
                            "/foo/a.ql": {},
                            "/bar/b.ql": {},
                        },
                    },
                    noDeclaredLanguage: {},
                    multipleDeclaredLanguages: {},
                };
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        // Just create a generic config object with non-default values for all fields
        const inputFileContents = `
      name: my config
      disable-default-queries: true
      queries:
        - uses: ./foo
      paths-ignore:
        - a
        - b
      paths:
        - c/d`;
        fs.mkdirSync(path.join(tempDir, "foo"));
        // And the config we expect it to parse to
        const expectedConfig = {
            languages: [languages_1.Language.javascript],
            buildMode: util_1.BuildMode.None,
            originalUserInput: {
                name: "my config",
                "disable-default-queries": true,
                queries: [{ uses: "./foo" }],
                "paths-ignore": ["a", "b"],
                paths: ["c/d"],
            },
            tempDir,
            codeQLCmd: codeql.getPath(),
            gitHubVersion: githubVersion,
            dbLocation: path.resolve(tempDir, "codeql_databases"),
            debugMode: false,
            debugArtifactName: "my-artifact",
            debugDatabaseName: "my-db",
            augmentationProperties: configUtils.defaultAugmentationProperties,
            trapCaches: {},
            trapCacheDownloadTime: 0,
            dependencyCachingEnabled: caching_utils_1.CachingKind.None,
        };
        const languagesInput = "javascript";
        const configFilePath = createConfigFile(inputFileContents, tempDir);
        const actualConfig = await configUtils.initConfig(createTestInitConfigInputs({
            languagesInput,
            buildModeInput: "none",
            configFile: configFilePath,
            debugArtifactName: "my-artifact",
            debugDatabaseName: "my-db",
            tempDir,
            codeql,
            workspacePath: tempDir,
        }));
        // Should exactly equal the object we constructed earlier
        t.deepEqual(actualConfig, expectedConfig);
    });
});
/**
 * Returns the provided queries, just in the right format for a resolved query
 * This way we can test by seeing which returned items are in the final
 * configuration.
 */
function queriesToResolvedQueryForm(queries) {
    const dummyResolvedQueries = {};
    for (const q of queries) {
        dummyResolvedQueries[q] = {};
    }
    return {
        byLanguage: {
            javascript: dummyResolvedQueries,
        },
        noDeclaredLanguage: {},
        multipleDeclaredLanguages: {},
    };
}
(0, ava_1.default)("Using config input and file together, config input should be used.", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        process.env["RUNNER_TEMP"] = tempDir;
        process.env["GITHUB_WORKSPACE"] = tempDir;
        const inputFileContents = `
      name: my config
      queries:
        - uses: ./foo_file`;
        const configFilePath = createConfigFile(inputFileContents, tempDir);
        const configInput = `
      name: my config
      queries:
        - uses: ./foo
      packs:
        javascript:
          - a/b@1.2.3
        python:
          - c/d@1.2.3
    `;
        fs.mkdirSync(path.join(tempDir, "foo"));
        const resolveQueriesArgs = [];
        const codeql = (0, codeql_1.setCodeQL)({
            async resolveQueries(queries, extraSearchPath) {
                resolveQueriesArgs.push({ queries, extraSearchPath });
                return queriesToResolvedQueryForm(queries);
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        // Only JS, python packs will be ignored
        const languagesInput = "javascript";
        const config = await configUtils.initConfig(createTestInitConfigInputs({
            languagesInput,
            configFile: configFilePath,
            configInput,
            tempDir,
            codeql,
            workspacePath: tempDir,
        }));
        t.deepEqual(config.originalUserInput, yaml.load(configInput));
    });
});
(0, ava_1.default)("API client used when reading remote config", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        const codeql = (0, codeql_1.setCodeQL)({
            async resolveQueries() {
                return {
                    byLanguage: {
                        javascript: {
                            "foo.ql": {},
                        },
                    },
                    noDeclaredLanguage: {},
                    multipleDeclaredLanguages: {},
                };
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        const inputFileContents = `
      name: my config
      disable-default-queries: true
      queries:
        - uses: ./
        - uses: ./foo
        - uses: foo/bar@dev
      paths-ignore:
        - a
        - b
      paths:
        - c/d`;
        const dummyResponse = {
            content: Buffer.from(inputFileContents).toString("base64"),
        };
        const spyGetContents = mockGetContents(dummyResponse);
        // Create checkout directory for remote queries repository
        fs.mkdirSync(path.join(tempDir, "foo/bar/dev"), { recursive: true });
        const configFile = "octo-org/codeql-config/config.yaml@main";
        const languagesInput = "javascript";
        await configUtils.initConfig(createTestInitConfigInputs({
            languagesInput,
            configFile,
            tempDir,
            codeql,
            workspacePath: tempDir,
        }));
        t.assert(spyGetContents.called);
    });
});
(0, ava_1.default)("Remote config handles the case where a directory is provided", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        const dummyResponse = []; // directories are returned as arrays
        mockGetContents(dummyResponse);
        const repoReference = "octo-org/codeql-config/config.yaml@main";
        try {
            await configUtils.initConfig(createTestInitConfigInputs({
                configFile: repoReference,
                tempDir,
                codeql: (0, codeql_1.getCachedCodeQL)(),
                workspacePath: tempDir,
            }));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new util_1.ConfigurationError(configUtils.getConfigFileDirectoryGivenMessage(repoReference)));
        }
    });
});
(0, ava_1.default)("Invalid format of remote config handled correctly", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        const dummyResponse = {
        // note no "content" property here
        };
        mockGetContents(dummyResponse);
        const repoReference = "octo-org/codeql-config/config.yaml@main";
        try {
            await configUtils.initConfig(createTestInitConfigInputs({
                configFile: repoReference,
                tempDir,
                codeql: (0, codeql_1.getCachedCodeQL)(),
                workspacePath: tempDir,
            }));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new util_1.ConfigurationError(configUtils.getConfigFileFormatInvalidMessage(repoReference)));
        }
    });
});
(0, ava_1.default)("No detected languages", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        mockListLanguages([]);
        const codeql = (0, codeql_1.setCodeQL)({
            async resolveLanguages() {
                return {};
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        try {
            await configUtils.initConfig(createTestInitConfigInputs({
                tempDir,
                codeql,
                workspacePath: tempDir,
            }));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new util_1.ConfigurationError(configUtils.getNoLanguagesError()));
        }
    });
});
(0, ava_1.default)("Unknown languages", async (t) => {
    return await (0, util_1.withTmpDir)(async (tempDir) => {
        const languagesInput = "rubbish,english";
        try {
            await configUtils.initConfig(createTestInitConfigInputs({
                languagesInput,
                tempDir,
                codeql: (0, codeql_1.getCachedCodeQL)(),
                workspacePath: tempDir,
            }));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new util_1.ConfigurationError(configUtils.getUnknownLanguagesError(["rubbish", "english"])));
        }
    });
});
/**
 * Test macro for ensuring the packs block is valid
 */
const parsePacksMacro = ava_1.default.macro({
    exec: (t, packsInput, languages, expected) => t.deepEqual(configUtils.parsePacksFromInput(packsInput, languages, false), expected),
    title: (providedTitle = "") => `Parse Packs: ${providedTitle}`,
});
/**
 * Test macro for testing when the packs block is invalid
 */
const parsePacksErrorMacro = ava_1.default.macro({
    exec: (t, packsInput, languages, expected) => t.throws(() => configUtils.parsePacksFromInput(packsInput, languages, false), {
        message: expected,
    }),
    title: (providedTitle = "") => `Parse Packs Error: ${providedTitle}`,
});
/**
 * Test macro for testing when the packs block is invalid
 */
const invalidPackNameMacro = ava_1.default.macro({
    exec: (t, name) => parsePacksErrorMacro.exec(t, name, [languages_1.Language.cpp], new RegExp(`^"${name}" is not a valid pack$`)),
    title: (_providedTitle, arg) => `Invalid pack string: ${arg}`,
});
(0, ava_1.default)("no packs", parsePacksMacro, "", [], undefined);
(0, ava_1.default)("two packs", parsePacksMacro, "a/b,c/d@1.2.3", [languages_1.Language.cpp], {
    [languages_1.Language.cpp]: ["a/b", "c/d@1.2.3"],
});
(0, ava_1.default)("two packs with spaces", parsePacksMacro, " a/b , c/d@1.2.3 ", [languages_1.Language.cpp], {
    [languages_1.Language.cpp]: ["a/b", "c/d@1.2.3"],
});
(0, ava_1.default)("two packs with language", parsePacksErrorMacro, "a/b,c/d@1.2.3", [languages_1.Language.cpp, languages_1.Language.java], new RegExp("Cannot specify a 'packs' input in a multi-language analysis. " +
    "Use a codeql-config.yml file instead and specify packs by language."));
(0, ava_1.default)("packs with other valid names", parsePacksMacro, [
    // ranges are ok
    "c/d@1.0",
    "c/d@~1.0.0",
    "c/d@~1.0.0:a/b",
    "c/d@~1.0.0+abc:a/b",
    "c/d@~1.0.0-abc:a/b",
    "c/d:a/b",
    // whitespace is removed
    " c/d      @     ~1.0.0    :    b.qls   ",
    // and it is retained within a path
    " c/d      @     ~1.0.0    :    b/a path with/spaces.qls   ",
    // this is valid. the path is '@'. It will probably fail when passed to the CLI
    "c/d@1.2.3:@",
    // this is valid, too. It will fail if it doesn't match a path
    // (globbing is not done)
    "c/d@1.2.3:+*)_(",
].join(","), [languages_1.Language.cpp], {
    [languages_1.Language.cpp]: [
        "c/d@1.0",
        "c/d@~1.0.0",
        "c/d@~1.0.0:a/b",
        "c/d@~1.0.0+abc:a/b",
        "c/d@~1.0.0-abc:a/b",
        "c/d:a/b",
        "c/d@~1.0.0:b.qls",
        "c/d@~1.0.0:b/a path with/spaces.qls",
        "c/d@1.2.3:@",
        "c/d@1.2.3:+*)_(",
    ],
});
(0, ava_1.default)(invalidPackNameMacro, "c"); // all packs require at least a scope and a name
(0, ava_1.default)(invalidPackNameMacro, "c-/d");
(0, ava_1.default)(invalidPackNameMacro, "-c/d");
(0, ava_1.default)(invalidPackNameMacro, "c/d_d");
(0, ava_1.default)(invalidPackNameMacro, "c/d@@");
(0, ava_1.default)(invalidPackNameMacro, "c/d@1.0.0:");
(0, ava_1.default)(invalidPackNameMacro, "c/d:");
(0, ava_1.default)(invalidPackNameMacro, "c/d:/a");
(0, ava_1.default)(invalidPackNameMacro, "@1.0.0:a");
(0, ava_1.default)(invalidPackNameMacro, "c/d@../a");
(0, ava_1.default)(invalidPackNameMacro, "c/d@b/../a");
(0, ava_1.default)(invalidPackNameMacro, "c/d:z@1");
/**
 * Test macro for pretty printing pack specs
 */
const packSpecPrettyPrintingMacro = ava_1.default.macro({
    exec: (t, packStr, packObj) => {
        const parsed = configUtils.parsePacksSpecification(packStr);
        t.deepEqual(parsed, packObj, "parsed pack spec is correct");
        const stringified = (0, util_1.prettyPrintPack)(packObj);
        t.deepEqual(stringified, packStr.trim(), "pretty-printed pack spec is correct");
        t.deepEqual(configUtils.validatePackSpecification(packStr), packStr.trim(), "pack spec is valid");
    },
    title: (_providedTitle, packStr, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _packObj) => `Prettyprint pack spec: '${packStr}'`,
});
(0, ava_1.default)(packSpecPrettyPrintingMacro, "a/b", {
    name: "a/b",
    version: undefined,
    path: undefined,
});
(0, ava_1.default)(packSpecPrettyPrintingMacro, "a/b@~1.2.3", {
    name: "a/b",
    version: "~1.2.3",
    path: undefined,
});
(0, ava_1.default)(packSpecPrettyPrintingMacro, "a/b@~1.2.3:abc/def", {
    name: "a/b",
    version: "~1.2.3",
    path: "abc/def",
});
(0, ava_1.default)(packSpecPrettyPrintingMacro, "a/b:abc/def", {
    name: "a/b",
    version: undefined,
    path: "abc/def",
});
(0, ava_1.default)(packSpecPrettyPrintingMacro, "    a/b:abc/def    ", {
    name: "a/b",
    version: undefined,
    path: "abc/def",
});
const mockLogger = (0, logging_1.getRunnerLogger)(true);
const calculateAugmentationMacro = ava_1.default.macro({
    exec: async (t, _title, rawPacksInput, rawQueriesInput, languages, expectedAugmentationProperties) => {
        const actualAugmentationProperties = configUtils.calculateAugmentation(rawPacksInput, rawQueriesInput, languages);
        t.deepEqual(actualAugmentationProperties, expectedAugmentationProperties);
    },
    title: (_, title) => `Calculate Augmentation: ${title}`,
});
(0, ava_1.default)(calculateAugmentationMacro, "All empty", undefined, undefined, [languages_1.Language.javascript], {
    queriesInputCombines: false,
    queriesInput: undefined,
    packsInputCombines: false,
    packsInput: undefined,
});
(0, ava_1.default)(calculateAugmentationMacro, "With queries", undefined, " a, b , c, d", [languages_1.Language.javascript], {
    queriesInputCombines: false,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
    packsInputCombines: false,
    packsInput: undefined,
});
(0, ava_1.default)(calculateAugmentationMacro, "With queries combining", undefined, "   +   a, b , c, d ", [languages_1.Language.javascript], {
    queriesInputCombines: true,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
    packsInputCombines: false,
    packsInput: undefined,
});
(0, ava_1.default)(calculateAugmentationMacro, "With packs", "   codeql/a , codeql/b   , codeql/c  , codeql/d  ", undefined, [languages_1.Language.javascript], {
    queriesInputCombines: false,
    queriesInput: undefined,
    packsInputCombines: false,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
});
(0, ava_1.default)(calculateAugmentationMacro, "With packs combining", "   +   codeql/a, codeql/b, codeql/c, codeql/d", undefined, [languages_1.Language.javascript], {
    queriesInputCombines: false,
    queriesInput: undefined,
    packsInputCombines: true,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
});
const calculateAugmentationErrorMacro = ava_1.default.macro({
    exec: async (t, _title, rawPacksInput, rawQueriesInput, languages, expectedError) => {
        t.throws(() => configUtils.calculateAugmentation(rawPacksInput, rawQueriesInput, languages), { message: expectedError });
    },
    title: (_, title) => `Calculate Augmentation Error: ${title}`,
});
(0, ava_1.default)(calculateAugmentationErrorMacro, "Plus (+) with nothing else (queries)", undefined, "   +   ", [languages_1.Language.javascript], /The workflow property "queries" is invalid/);
(0, ava_1.default)(calculateAugmentationErrorMacro, "Plus (+) with nothing else (packs)", "   +   ", undefined, [languages_1.Language.javascript], /The workflow property "packs" is invalid/);
(0, ava_1.default)(calculateAugmentationErrorMacro, "Packs input with multiple languages", "   +  a/b, c/d ", undefined, [languages_1.Language.javascript, languages_1.Language.java], /Cannot specify a 'packs' input in a multi-language analysis/);
(0, ava_1.default)(calculateAugmentationErrorMacro, "Packs input with no languages", "   +  a/b, c/d ", undefined, [], /No languages specified/);
(0, ava_1.default)(calculateAugmentationErrorMacro, "Invalid packs", " a-pack-without-a-scope ", undefined, [languages_1.Language.javascript], /"a-pack-without-a-scope" is not a valid pack/);
(0, ava_1.default)("no generateRegistries when registries is undefined", async (t) => {
    return await (0, util_1.withTmpDir)(async (tmpDir) => {
        const registriesInput = undefined;
        const logger = (0, logging_1.getRunnerLogger)(true);
        const { registriesAuthTokens, qlconfigFile } = await configUtils.generateRegistries(registriesInput, tmpDir, logger);
        t.is(registriesAuthTokens, undefined);
        t.is(qlconfigFile, undefined);
    });
});
(0, ava_1.default)("generateRegistries prefers original CODEQL_REGISTRIES_AUTH", async (t) => {
    return await (0, util_1.withTmpDir)(async (tmpDir) => {
        process.env.CODEQL_REGISTRIES_AUTH = "original";
        const registriesInput = yaml.dump([
            {
                url: "http://ghcr.io",
                packages: ["codeql/*", "codeql-testing/*"],
                token: "not-a-token",
            },
        ]);
        const logger = (0, logging_1.getRunnerLogger)(true);
        const { registriesAuthTokens, qlconfigFile } = await configUtils.generateRegistries(registriesInput, tmpDir, logger);
        t.is(registriesAuthTokens, "original");
        t.is(qlconfigFile, path.join(tmpDir, "qlconfig.yml"));
    });
});
// getLanguages
const mockRepositoryNwo = (0, repository_1.parseRepositoryNwo)("owner/repo");
// eslint-disable-next-line github/array-foreach
[
    {
        name: "languages from input",
        codeqlResolvedLanguages: ["javascript", "java", "python"],
        languagesInput: "jAvAscript, \n jaVa",
        languagesInRepository: ["SwiFt", "other"],
        expectedLanguages: ["javascript", "java"],
        expectedApiCall: false,
    },
    {
        name: "languages from github api",
        codeqlResolvedLanguages: ["javascript", "java", "python"],
        languagesInput: "",
        languagesInRepository: ["  jAvAscript\n \t", " jaVa", "SwiFt", "other"],
        expectedLanguages: ["javascript", "java"],
        expectedApiCall: true,
    },
    {
        name: "aliases from input",
        codeqlResolvedLanguages: ["javascript", "csharp", "cpp", "java", "python"],
        languagesInput: "  typEscript\n \t, C#, c , KoTlin",
        languagesInRepository: ["SwiFt", "other"],
        expectedLanguages: ["javascript", "csharp", "cpp", "java"],
        expectedApiCall: false,
    },
    {
        name: "duplicate languages from input",
        codeqlResolvedLanguages: ["javascript", "java", "python"],
        languagesInput: "jAvAscript, \n jaVa, kotlin, typescript",
        languagesInRepository: ["SwiFt", "other"],
        expectedLanguages: ["javascript", "java"],
        expectedApiCall: false,
    },
    {
        name: "aliases from github api",
        codeqlResolvedLanguages: ["javascript", "csharp", "cpp", "java", "python"],
        languagesInput: "",
        languagesInRepository: ["  typEscript\n \t", " C#", "c", "other"],
        expectedLanguages: ["javascript", "csharp", "cpp"],
        expectedApiCall: true,
    },
    {
        name: "no languages",
        codeqlResolvedLanguages: ["javascript", "java", "python"],
        languagesInput: "",
        languagesInRepository: [],
        expectedApiCall: true,
        expectedError: configUtils.getNoLanguagesError(),
    },
    {
        name: "unrecognized languages from input",
        codeqlResolvedLanguages: ["javascript", "java", "python"],
        languagesInput: "a, b, c, javascript",
        languagesInRepository: [],
        expectedApiCall: false,
        expectedError: configUtils.getUnknownLanguagesError(["a", "b"]),
    },
].forEach((args) => {
    (0, ava_1.default)(`getLanguages: ${args.name}`, async (t) => {
        const mockRequest = (0, testing_utils_1.mockLanguagesInRepo)(args.languagesInRepository);
        const languages = args.codeqlResolvedLanguages.reduce((acc, lang) => ({
            ...acc,
            [lang]: true,
        }), {});
        const codeQL = (0, codeql_1.setCodeQL)({
            resolveLanguages: () => Promise.resolve(languages),
        });
        if (args.expectedLanguages) {
            // happy path
            const actualLanguages = await configUtils.getLanguages(codeQL, args.languagesInput, mockRepositoryNwo, mockLogger);
            t.deepEqual(actualLanguages.sort(), args.expectedLanguages.sort());
        }
        else {
            // there is an error
            await t.throwsAsync(async () => await configUtils.getLanguages(codeQL, args.languagesInput, mockRepositoryNwo, mockLogger), { message: args.expectedError });
        }
        t.deepEqual(mockRequest.called, args.expectedApiCall);
    });
});
for (const { displayName, language, feature } of [
    {
        displayName: "Java",
        language: languages_1.Language.java,
        feature: feature_flags_1.Feature.DisableJavaBuildlessEnabled,
    },
    {
        displayName: "C#",
        language: languages_1.Language.csharp,
        feature: feature_flags_1.Feature.DisableCsharpBuildless,
    },
]) {
    (0, ava_1.default)(`Build mode not overridden when disable ${displayName} buildless feature flag disabled`, async (t) => {
        const messages = [];
        const buildMode = await configUtils.parseBuildModeInput("none", [language], (0, testing_utils_1.createFeatures)([]), (0, testing_utils_1.getRecordingLogger)(messages));
        t.is(buildMode, util_1.BuildMode.None);
        t.deepEqual(messages, []);
    });
    (0, ava_1.default)(`Build mode not overridden for other languages when disable ${displayName} buildless feature flag enabled`, async (t) => {
        const messages = [];
        const buildMode = await configUtils.parseBuildModeInput("none", [languages_1.Language.python], (0, testing_utils_1.createFeatures)([feature]), (0, testing_utils_1.getRecordingLogger)(messages));
        t.is(buildMode, util_1.BuildMode.None);
        t.deepEqual(messages, []);
    });
    (0, ava_1.default)(`Build mode overridden when analyzing ${displayName} and disable ${displayName} buildless feature flag enabled`, async (t) => {
        const messages = [];
        const buildMode = await configUtils.parseBuildModeInput("none", [language], (0, testing_utils_1.createFeatures)([feature]), (0, testing_utils_1.getRecordingLogger)(messages));
        t.is(buildMode, util_1.BuildMode.Autobuild);
        t.deepEqual(messages, [
            {
                message: `Scanning ${displayName} code without a build is temporarily unavailable. Falling back to 'autobuild' build mode.`,
                type: "warning",
            },
        ]);
    });
}
//# sourceMappingURL=config-utils.test.js.map