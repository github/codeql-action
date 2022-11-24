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
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
(0, testing_utils_1.setupTests)(ava_1.default);
const sampleApiDetails = {
    auth: "token",
    externalRepoAuth: "token",
    url: "https://github.example.com",
    apiURL: undefined,
    registriesAuthTokens: undefined,
};
const gitHubVersion = { type: util.GitHubVariant.DOTCOM };
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
        .stub(client.repos, "getContent")
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
    sinon.stub(client.repos, "listLanguages").resolves(response);
    sinon.stub(api, "getApiClient").value(() => client);
}
(0, ava_1.default)("load empty config", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const logger = (0, logging_1.getRunnerLogger)(true);
        const languages = "javascript,python";
        const codeQL = (0, codeql_1.setCodeQL)({
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
        const config = await configUtils.initConfig(languages, undefined, undefined, undefined, undefined, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), logger);
        t.deepEqual(config, await configUtils.getDefaultConfig(languages, undefined, undefined, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), logger));
    });
});
(0, ava_1.default)("loading config saves config", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const logger = (0, logging_1.getRunnerLogger)(true);
        const codeQL = (0, codeql_1.setCodeQL)({
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
        t.false(fs.existsSync(configUtils.getPathToParsedConfigFile(tmpDir)));
        // Sanity check that getConfig returns undefined before we have called initConfig
        t.deepEqual(await configUtils.getConfig(tmpDir, logger), undefined);
        const config1 = await configUtils.initConfig("javascript,python", undefined, undefined, undefined, undefined, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), logger);
        // The saved config file should now exist
        t.true(fs.existsSync(configUtils.getPathToParsedConfigFile(tmpDir)));
        // And that same newly-initialised config should now be returned by getConfig
        const config2 = await configUtils.getConfig(tmpDir, logger);
        t.not(config2, undefined);
        if (config2 !== undefined) {
            // removes properties assigned to undefined.
            const expectedConfig = JSON.parse(JSON.stringify(config1));
            t.deepEqual(expectedConfig, config2);
        }
    });
});
(0, ava_1.default)("load input outside of workspace", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        try {
            await configUtils.initConfig(undefined, undefined, undefined, undefined, "../input", undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, (0, codeql_1.getCachedCodeQL)(), tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getConfigFileOutsideWorkspaceErrorMessage(path.join(tmpDir, "../input"))));
        }
    });
});
(0, ava_1.default)("load non-local input with invalid repo syntax", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        // no filename given, just a repo
        const configFile = "octo-org/codeql-config@main";
        try {
            await configUtils.initConfig(undefined, undefined, undefined, undefined, configFile, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, (0, codeql_1.getCachedCodeQL)(), tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getConfigFileRepoFormatInvalidMessage("octo-org/codeql-config@main")));
        }
    });
});
(0, ava_1.default)("load non-existent input", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const languages = "javascript";
        const configFile = "input";
        t.false(fs.existsSync(path.join(tmpDir, configFile)));
        try {
            await configUtils.initConfig(languages, undefined, undefined, undefined, configFile, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, (0, codeql_1.getCachedCodeQL)(), tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getConfigFileDoesNotExistErrorMessage(path.join(tmpDir, "input"))));
        }
    });
});
(0, ava_1.default)("load non-empty input", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const codeQL = (0, codeql_1.setCodeQL)({
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
        fs.mkdirSync(path.join(tmpDir, "foo"));
        // And the config we expect it to parse to
        const expectedConfig = {
            languages: [languages_1.Language.javascript],
            queries: {
                javascript: {
                    builtin: [],
                    custom: [
                        {
                            queries: ["/foo/a.ql", "/bar/b.ql"],
                            searchPath: tmpDir,
                        },
                    ],
                },
            },
            pathsIgnore: ["a", "b"],
            paths: ["c/d"],
            originalUserInput: {
                name: "my config",
                "disable-default-queries": true,
                queries: [{ uses: "./foo" }],
                "paths-ignore": ["a", "b"],
                paths: ["c/d"],
            },
            tempDir: tmpDir,
            codeQLCmd: codeQL.getPath(),
            gitHubVersion,
            dbLocation: path.resolve(tmpDir, "codeql_databases"),
            packs: {},
            debugMode: false,
            debugArtifactName: "my-artifact",
            debugDatabaseName: "my-db",
            augmentationProperties: configUtils.defaultAugmentationProperties,
            trapCaches: {},
            trapCacheDownloadTime: 0,
        };
        const languages = "javascript";
        const configFilePath = createConfigFile(inputFileContents, tmpDir);
        const actualConfig = await configUtils.initConfig(languages, undefined, undefined, undefined, configFilePath, undefined, false, false, "my-artifact", "my-db", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        // Should exactly equal the object we constructed earlier
        t.deepEqual(actualConfig, expectedConfig);
    });
});
(0, ava_1.default)("Default queries are used", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        // Check that the default behaviour is to add the default queries.
        // In this case if a config file is specified but does not include
        // the disable-default-queries field.
        // We determine this by whether CodeQL.resolveQueries is called
        // with the correct arguments.
        const resolveQueriesArgs = [];
        const codeQL = (0, codeql_1.setCodeQL)({
            async resolveQueries(queries, extraSearchPath) {
                resolveQueriesArgs.push({ queries, extraSearchPath });
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
        // The important point of this config is that it doesn't specify
        // the disable-default-queries field.
        // Any other details are hopefully irrelevant for this test.
        const inputFileContents = `
      paths:
        - foo`;
        fs.mkdirSync(path.join(tmpDir, "foo"));
        const languages = "javascript";
        const configFilePath = createConfigFile(inputFileContents, tmpDir);
        await configUtils.initConfig(languages, undefined, undefined, undefined, configFilePath, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        // Check resolve queries was called correctly
        t.deepEqual(resolveQueriesArgs.length, 1);
        t.deepEqual(resolveQueriesArgs[0].queries, [
            "javascript-code-scanning.qls",
        ]);
        t.deepEqual(resolveQueriesArgs[0].extraSearchPath, undefined);
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
(0, ava_1.default)("Queries can be specified in config file", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const inputFileContents = `
      name: my config
      queries:
        - uses: ./foo`;
        const configFilePath = createConfigFile(inputFileContents, tmpDir);
        fs.mkdirSync(path.join(tmpDir, "foo"));
        const resolveQueriesArgs = [];
        const codeQL = (0, codeql_1.setCodeQL)({
            async resolveQueries(queries, extraSearchPath) {
                resolveQueriesArgs.push({ queries, extraSearchPath });
                return queriesToResolvedQueryForm(queries);
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        const languages = "javascript";
        const config = await configUtils.initConfig(languages, undefined, undefined, undefined, configFilePath, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        // Check resolveQueries was called correctly
        // It'll be called once for the default queries
        // and once for `./foo` from the config file.
        t.deepEqual(resolveQueriesArgs.length, 2);
        t.deepEqual(resolveQueriesArgs[1].queries.length, 1);
        t.true(resolveQueriesArgs[1].queries[0].endsWith(`${path.sep}foo`));
        // Now check that the end result contains the default queries and the query from config
        t.deepEqual(config.queries["javascript"].builtin.length, 1);
        t.deepEqual(config.queries["javascript"].custom.length, 1);
        t.true(config.queries["javascript"].builtin[0].endsWith("javascript-code-scanning.qls"));
        t.true(config.queries["javascript"].custom[0].queries[0].endsWith(`${path.sep}foo`));
    });
});
(0, ava_1.default)("Queries from config file can be overridden in workflow file", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const inputFileContents = `
      name: my config
      queries:
        - uses: ./foo`;
        const configFilePath = createConfigFile(inputFileContents, tmpDir);
        // This config item should take precedence over the config file but shouldn't affect the default queries.
        const testQueries = "./override";
        fs.mkdirSync(path.join(tmpDir, "foo"));
        fs.mkdirSync(path.join(tmpDir, "override"));
        const resolveQueriesArgs = [];
        const codeQL = (0, codeql_1.setCodeQL)({
            async resolveQueries(queries, extraSearchPath) {
                resolveQueriesArgs.push({ queries, extraSearchPath });
                return queriesToResolvedQueryForm(queries);
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        const languages = "javascript";
        const config = await configUtils.initConfig(languages, testQueries, undefined, undefined, configFilePath, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        // Check resolveQueries was called correctly
        // It'll be called once for the default queries and once for `./override`,
        // but won't be called for './foo' from the config file.
        t.deepEqual(resolveQueriesArgs.length, 2);
        t.deepEqual(resolveQueriesArgs[1].queries.length, 1);
        t.true(resolveQueriesArgs[1].queries[0].endsWith(`${path.sep}override`));
        // Now check that the end result contains only the default queries and the override query
        t.deepEqual(config.queries["javascript"].builtin.length, 1);
        t.deepEqual(config.queries["javascript"].custom.length, 1);
        t.true(config.queries["javascript"].builtin[0].endsWith("javascript-code-scanning.qls"));
        t.true(config.queries["javascript"].custom[0].queries[0].endsWith(`${path.sep}override`));
    });
});
(0, ava_1.default)("Queries in workflow file can be used in tandem with the 'disable default queries' option", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env["RUNNER_TEMP"] = tmpDir;
        process.env["GITHUB_WORKSPACE"] = tmpDir;
        const inputFileContents = `
      name: my config
      disable-default-queries: true`;
        const configFilePath = createConfigFile(inputFileContents, tmpDir);
        const testQueries = "./workflow-query";
        fs.mkdirSync(path.join(tmpDir, "workflow-query"));
        const resolveQueriesArgs = [];
        const codeQL = (0, codeql_1.setCodeQL)({
            async resolveQueries(queries, extraSearchPath) {
                resolveQueriesArgs.push({ queries, extraSearchPath });
                return queriesToResolvedQueryForm(queries);
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        const languages = "javascript";
        const config = await configUtils.initConfig(languages, testQueries, undefined, undefined, configFilePath, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        // Check resolveQueries was called correctly
        // It'll be called once for `./workflow-query`,
        // but won't be called for the default one since that was disabled
        t.deepEqual(resolveQueriesArgs.length, 1);
        t.deepEqual(resolveQueriesArgs[0].queries.length, 1);
        t.true(resolveQueriesArgs[0].queries[0].endsWith(`${path.sep}workflow-query`));
        // Now check that the end result contains only the workflow query, and not the default one
        t.deepEqual(config.queries["javascript"].builtin.length, 0);
        t.deepEqual(config.queries["javascript"].custom.length, 1);
        t.true(config.queries["javascript"].custom[0].queries[0].endsWith(`${path.sep}workflow-query`));
    });
});
(0, ava_1.default)("Multiple queries can be specified in workflow file, no config file required", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        fs.mkdirSync(path.join(tmpDir, "override1"));
        fs.mkdirSync(path.join(tmpDir, "override2"));
        const testQueries = "./override1,./override2";
        const resolveQueriesArgs = [];
        const codeQL = (0, codeql_1.setCodeQL)({
            async resolveQueries(queries, extraSearchPath) {
                resolveQueriesArgs.push({ queries, extraSearchPath });
                return queriesToResolvedQueryForm(queries);
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        const languages = "javascript";
        const config = await configUtils.initConfig(languages, testQueries, undefined, undefined, undefined, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        // Check resolveQueries was called correctly:
        // It'll be called once for the default queries,
        // and then once for each of the two queries from the workflow
        t.deepEqual(resolveQueriesArgs.length, 3);
        t.deepEqual(resolveQueriesArgs[1].queries.length, 1);
        t.deepEqual(resolveQueriesArgs[2].queries.length, 1);
        t.true(resolveQueriesArgs[1].queries[0].endsWith(`${path.sep}override1`));
        t.true(resolveQueriesArgs[2].queries[0].endsWith(`${path.sep}override2`));
        // Now check that the end result contains both the queries from the workflow, as well as the defaults
        t.deepEqual(config.queries["javascript"].builtin.length, 1);
        t.deepEqual(config.queries["javascript"].custom.length, 2);
        t.true(config.queries["javascript"].builtin[0].endsWith("javascript-code-scanning.qls"));
        t.true(config.queries["javascript"].custom[0].queries[0].endsWith(`${path.sep}override1`));
        t.true(config.queries["javascript"].custom[1].queries[0].endsWith(`${path.sep}override2`));
    });
});
(0, ava_1.default)("Queries in workflow file can be added to the set of queries without overriding config file", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env["RUNNER_TEMP"] = tmpDir;
        process.env["GITHUB_WORKSPACE"] = tmpDir;
        const inputFileContents = `
      name: my config
      queries:
        - uses: ./foo`;
        const configFilePath = createConfigFile(inputFileContents, tmpDir);
        // These queries shouldn't override anything, because the value is prefixed with "+"
        const testQueries = "+./additional1,./additional2";
        fs.mkdirSync(path.join(tmpDir, "foo"));
        fs.mkdirSync(path.join(tmpDir, "additional1"));
        fs.mkdirSync(path.join(tmpDir, "additional2"));
        const resolveQueriesArgs = [];
        const codeQL = (0, codeql_1.setCodeQL)({
            async resolveQueries(queries, extraSearchPath) {
                resolveQueriesArgs.push({ queries, extraSearchPath });
                return queriesToResolvedQueryForm(queries);
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        const languages = "javascript";
        const config = await configUtils.initConfig(languages, testQueries, undefined, undefined, configFilePath, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        // Check resolveQueries was called correctly
        // It'll be called once for the default queries,
        // once for each of additional1 and additional2,
        // and once for './foo' from the config file
        t.deepEqual(resolveQueriesArgs.length, 4);
        t.deepEqual(resolveQueriesArgs[1].queries.length, 1);
        t.true(resolveQueriesArgs[1].queries[0].endsWith(`${path.sep}additional1`));
        t.deepEqual(resolveQueriesArgs[2].queries.length, 1);
        t.true(resolveQueriesArgs[2].queries[0].endsWith(`${path.sep}additional2`));
        t.deepEqual(resolveQueriesArgs[3].queries.length, 1);
        t.true(resolveQueriesArgs[3].queries[0].endsWith(`${path.sep}foo`));
        // Now check that the end result contains all the queries
        t.deepEqual(config.queries["javascript"].builtin.length, 1);
        t.deepEqual(config.queries["javascript"].custom.length, 3);
        t.true(config.queries["javascript"].builtin[0].endsWith("javascript-code-scanning.qls"));
        t.true(config.queries["javascript"].custom[0].queries[0].endsWith(`${path.sep}additional1`));
        t.true(config.queries["javascript"].custom[1].queries[0].endsWith(`${path.sep}additional2`));
        t.true(config.queries["javascript"].custom[2].queries[0].endsWith(`${path.sep}foo`));
    });
});
(0, ava_1.default)("Invalid queries in workflow file handled correctly", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const queries = "foo/bar@v1@v3";
        const languages = "javascript";
        // This function just needs to be type-correct; it doesn't need to do anything,
        // since we're deliberately passing in invalid data
        const codeQL = (0, codeql_1.setCodeQL)({
            async resolveQueries() {
                return {
                    byLanguage: {
                        javascript: {},
                    },
                    noDeclaredLanguage: {},
                    multipleDeclaredLanguages: {},
                };
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        try {
            await configUtils.initConfig(languages, queries, undefined, undefined, undefined, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
            t.fail("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getQueryUsesInvalid(undefined, "foo/bar@v1@v3")));
        }
    });
});
(0, ava_1.default)("API client used when reading remote config", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const codeQL = (0, codeql_1.setCodeQL)({
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
        fs.mkdirSync(path.join(tmpDir, "foo/bar/dev"), { recursive: true });
        const configFile = "octo-org/codeql-config/config.yaml@main";
        const languages = "javascript";
        await configUtils.initConfig(languages, undefined, undefined, undefined, configFile, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        t.assert(spyGetContents.called);
    });
});
(0, ava_1.default)("Remote config handles the case where a directory is provided", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const dummyResponse = []; // directories are returned as arrays
        mockGetContents(dummyResponse);
        const repoReference = "octo-org/codeql-config/config.yaml@main";
        try {
            await configUtils.initConfig(undefined, undefined, undefined, undefined, repoReference, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, (0, codeql_1.getCachedCodeQL)(), tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getConfigFileDirectoryGivenMessage(repoReference)));
        }
    });
});
(0, ava_1.default)("Invalid format of remote config handled correctly", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const dummyResponse = {
        // note no "content" property here
        };
        mockGetContents(dummyResponse);
        const repoReference = "octo-org/codeql-config/config.yaml@main";
        try {
            await configUtils.initConfig(undefined, undefined, undefined, undefined, repoReference, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, (0, codeql_1.getCachedCodeQL)(), tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getConfigFileFormatInvalidMessage(repoReference)));
        }
    });
});
(0, ava_1.default)("No detected languages", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        mockListLanguages([]);
        const codeQL = (0, codeql_1.setCodeQL)({
            async resolveLanguages() {
                return {};
            },
            async packDownload() {
                return { packs: [] };
            },
        });
        try {
            await configUtils.initConfig(undefined, undefined, undefined, undefined, undefined, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getNoLanguagesError()));
        }
    });
});
(0, ava_1.default)("Unknown languages", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const languages = "rubbish,english";
        try {
            await configUtils.initConfig(languages, undefined, undefined, undefined, undefined, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, (0, codeql_1.getCachedCodeQL)(), tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
            throw new Error("initConfig did not throw error");
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getUnknownLanguagesError(["rubbish", "english"])));
        }
    });
});
(0, ava_1.default)("Config specifies packages", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const codeQL = (0, codeql_1.setCodeQL)({
            async resolveQueries() {
                return {
                    byLanguage: {},
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
      packs:
        - a/b@1.2.3
      `;
        const configFile = path.join(tmpDir, "codeql-config.yaml");
        fs.writeFileSync(configFile, inputFileContents);
        const languages = "javascript";
        const { packs } = await configUtils.initConfig(languages, undefined, undefined, undefined, configFile, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        t.deepEqual(packs, {
            [languages_1.Language.javascript]: ["a/b@1.2.3"],
        });
    });
});
(0, ava_1.default)("Config specifies packages for multiple languages", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const codeQL = (0, codeql_1.setCodeQL)({
            async resolveQueries() {
                return {
                    byLanguage: {
                        cpp: { "/foo/a.ql": {} },
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
      - uses: ./foo
      packs:
        javascript:
          - a/b@1.2.3
        python:
          - c/d@1.2.3
      `;
        const configFile = path.join(tmpDir, "codeql-config.yaml");
        fs.writeFileSync(configFile, inputFileContents);
        fs.mkdirSync(path.join(tmpDir, "foo"));
        const languages = "javascript,python,cpp";
        const { packs, queries } = await configUtils.initConfig(languages, undefined, undefined, undefined, configFile, undefined, false, false, "", "", { owner: "github", repo: "example" }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
        t.deepEqual(packs, {
            [languages_1.Language.javascript]: ["a/b@1.2.3"],
            [languages_1.Language.python]: ["c/d@1.2.3"],
        });
        t.deepEqual(queries, {
            cpp: {
                builtin: [],
                custom: [
                    {
                        queries: ["/foo/a.ql"],
                        searchPath: tmpDir,
                    },
                ],
            },
            javascript: {
                builtin: [],
                custom: [],
            },
            python: {
                builtin: [],
                custom: [],
            },
        });
    });
});
function doInvalidInputTest(testName, inputFileContents, expectedErrorMessageGenerator) {
    (0, ava_1.default)(`load invalid input - ${testName}`, async (t) => {
        return await util.withTmpDir(async (tmpDir) => {
            const codeQL = (0, codeql_1.setCodeQL)({
                async resolveQueries() {
                    return {
                        byLanguage: {},
                        noDeclaredLanguage: {},
                        multipleDeclaredLanguages: {},
                    };
                },
                async packDownload() {
                    return { packs: [] };
                },
            });
            const languages = "javascript";
            const configFile = "input";
            const inputFile = path.join(tmpDir, configFile);
            fs.writeFileSync(inputFile, inputFileContents, "utf8");
            try {
                await configUtils.initConfig(languages, undefined, undefined, undefined, configFile, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)([]), (0, logging_1.getRunnerLogger)(true));
                throw new Error("initConfig did not throw error");
            }
            catch (err) {
                t.deepEqual(err, new Error(expectedErrorMessageGenerator(inputFile)));
            }
        });
    });
}
doInvalidInputTest("name invalid type", `
  name:
    - foo: bar`, configUtils.getNameInvalid);
doInvalidInputTest("disable-default-queries invalid type", `disable-default-queries: 42`, configUtils.getDisableDefaultQueriesInvalid);
doInvalidInputTest("queries invalid type", `queries: foo`, configUtils.getQueriesInvalid);
doInvalidInputTest("paths-ignore invalid type", `paths-ignore: bar`, configUtils.getPathsIgnoreInvalid);
doInvalidInputTest("paths invalid type", `paths: 17`, configUtils.getPathsInvalid);
doInvalidInputTest("queries uses invalid type", `
  queries:
  - uses:
      - hello: world`, configUtils.getQueriesMissingUses);
function doInvalidQueryUsesTest(input, expectedErrorMessageGenerator) {
    // Invalid contents of a "queries.uses" field.
    // Should fail with the expected error message
    const inputFileContents = `
    name: my config
    queries:
      - name: foo
        uses: ${input}`;
    doInvalidInputTest(`queries uses "${input}"`, inputFileContents, expectedErrorMessageGenerator);
}
// Various "uses" fields, and the errors they should produce
doInvalidQueryUsesTest("''", (c) => configUtils.getQueryUsesInvalid(c, undefined));
doInvalidQueryUsesTest("foo/bar", (c) => configUtils.getQueryUsesInvalid(c, "foo/bar"));
doInvalidQueryUsesTest("foo/bar@v1@v2", (c) => configUtils.getQueryUsesInvalid(c, "foo/bar@v1@v2"));
doInvalidQueryUsesTest("foo@master", (c) => configUtils.getQueryUsesInvalid(c, "foo@master"));
doInvalidQueryUsesTest("https://github.com/foo/bar@master", (c) => configUtils.getQueryUsesInvalid(c, "https://github.com/foo/bar@master"));
doInvalidQueryUsesTest("./foo", (c) => configUtils.getLocalPathDoesNotExist(c, "foo"));
doInvalidQueryUsesTest("./..", (c) => configUtils.getLocalPathOutsideOfRepository(c, ".."));
const validPaths = [
    "foo",
    "foo/",
    "foo/**",
    "foo/**/",
    "foo/**/**",
    "foo/**/bar/**/baz",
    "**/",
    "**/foo",
    "/foo",
];
const invalidPaths = ["a/***/b", "a/**b", "a/b**", "**"];
(0, ava_1.default)("path validations", (t) => {
    // Dummy values to pass to validateAndSanitisePath
    const propertyName = "paths";
    const configFile = "./.github/codeql/config.yml";
    for (const validPath of validPaths) {
        t.truthy(configUtils.validateAndSanitisePath(validPath, propertyName, configFile, (0, logging_1.getRunnerLogger)(true)));
    }
    for (const invalidPath of invalidPaths) {
        t.throws(() => configUtils.validateAndSanitisePath(invalidPath, propertyName, configFile, (0, logging_1.getRunnerLogger)(true)));
    }
});
(0, ava_1.default)("path sanitisation", (t) => {
    // Dummy values to pass to validateAndSanitisePath
    const propertyName = "paths";
    const configFile = "./.github/codeql/config.yml";
    // Valid paths are not modified
    t.deepEqual(configUtils.validateAndSanitisePath("foo/bar", propertyName, configFile, (0, logging_1.getRunnerLogger)(true)), "foo/bar");
    // Trailing stars are stripped
    t.deepEqual(configUtils.validateAndSanitisePath("foo/**", propertyName, configFile, (0, logging_1.getRunnerLogger)(true)), "foo/");
});
/**
 * Test macro for ensuring the packs block is valid
 */
const parsePacksMacro = ava_1.default.macro({
    exec: (t, packsByLanguage, languages, expected) => t.deepEqual(configUtils.parsePacksFromConfig(packsByLanguage, languages, "/a/b", mockLogger), expected),
    title: (providedTitle = "") => `Parse Packs: ${providedTitle}`,
});
/**
 * Test macro for testing when the packs block is invalid
 */
const parsePacksErrorMacro = ava_1.default.macro({
    exec: (t, packsByLanguage, languages, expected) => t.throws(() => configUtils.parsePacksFromConfig(packsByLanguage, languages, "/a/b", {}), {
        message: expected,
    }),
    title: (providedTitle = "") => `Parse Packs Error: ${providedTitle}`,
});
/**
 * Test macro for testing when the packs block is invalid
 */
const invalidPackNameMacro = ava_1.default.macro({
    exec: (t, name) => parsePacksErrorMacro.exec(t, { [languages_1.Language.cpp]: [name] }, [languages_1.Language.cpp], new RegExp(`The configuration file "/a/b" is invalid: property "packs" "${name}" is not a valid pack`)),
    title: (_providedTitle, arg) => `Invalid pack string: ${arg}`,
});
(0, ava_1.default)("no packs", parsePacksMacro, {}, [], {});
(0, ava_1.default)("two packs", parsePacksMacro, ["a/b", "c/d@1.2.3"], [languages_1.Language.cpp], {
    [languages_1.Language.cpp]: ["a/b", "c/d@1.2.3"],
});
(0, ava_1.default)("two packs with spaces", parsePacksMacro, [" a/b ", " c/d@1.2.3 "], [languages_1.Language.cpp], {
    [languages_1.Language.cpp]: ["a/b", "c/d@1.2.3"],
});
(0, ava_1.default)("two packs with language", parsePacksMacro, {
    [languages_1.Language.cpp]: ["a/b", "c/d@1.2.3"],
    [languages_1.Language.java]: ["d/e", "f/g@1.2.3"],
}, [languages_1.Language.cpp, languages_1.Language.java, languages_1.Language.csharp], {
    [languages_1.Language.cpp]: ["a/b", "c/d@1.2.3"],
    [languages_1.Language.java]: ["d/e", "f/g@1.2.3"],
});
(0, ava_1.default)("two packs with unused language in config", parsePacksMacro, {
    [languages_1.Language.cpp]: ["a/b", "c/d@1.2.3"],
    [languages_1.Language.java]: ["d/e", "f/g@1.2.3"],
}, [languages_1.Language.cpp, languages_1.Language.csharp], {
    [languages_1.Language.cpp]: ["a/b", "c/d@1.2.3"],
});
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
], [languages_1.Language.cpp], {
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
(0, ava_1.default)("no language", parsePacksErrorMacro, ["a/b@1.2.3"], [languages_1.Language.java, languages_1.Language.python], /The configuration file "\/a\/b" is invalid: property "packs" must split packages by language/);
(0, ava_1.default)("not an array", parsePacksErrorMacro, { [languages_1.Language.cpp]: "c/d" }, [languages_1.Language.cpp], /The configuration file "\/a\/b" is invalid: property "packs" must be an array of non-empty strings/);
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
        const stringified = configUtils.prettyPrintPack(packObj);
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
/**
 * Test macro for testing the packs block and the packs input
 */
function parseInputAndConfigMacro(t, packsFromConfig, packsFromInput, languages, expected) {
    t.deepEqual(configUtils.parsePacks(packsFromConfig, packsFromInput, !!(packsFromInput === null || packsFromInput === void 0 ? void 0 : packsFromInput.trim().startsWith("+")), // coerce to boolean
    languages, "/a/b", mockLogger), expected);
}
parseInputAndConfigMacro.title = (providedTitle) => `Parse Packs input and config: ${providedTitle}`;
const mockLogger = (0, logging_1.getRunnerLogger)(true);
function parseInputAndConfigErrorMacro(t, packsFromConfig, packsFromInput, languages, packsFromInputOverride, expected) {
    t.throws(() => {
        configUtils.parsePacks(packsFromConfig, packsFromInput, packsFromInputOverride, languages, "/a/b", mockLogger);
    }, {
        message: expected,
    });
}
parseInputAndConfigErrorMacro.title = (providedTitle) => `Parse Packs input and config Error: ${providedTitle}`;
(0, ava_1.default)("input only", parseInputAndConfigMacro, {}, " c/d ", [languages_1.Language.cpp], {
    [languages_1.Language.cpp]: ["c/d"],
});
(0, ava_1.default)("input only with multiple", parseInputAndConfigMacro, {}, "a/b , c/d@1.2.3", [languages_1.Language.cpp], {
    [languages_1.Language.cpp]: ["a/b", "c/d@1.2.3"],
});
(0, ava_1.default)("input only with +", parseInputAndConfigMacro, {}, "  +  a/b , c/d@1.2.3 ", [languages_1.Language.cpp], {
    [languages_1.Language.cpp]: ["a/b", "c/d@1.2.3"],
});
(0, ava_1.default)("config only", parseInputAndConfigMacro, ["a/b", "c/d"], "  ", [languages_1.Language.cpp], {
    [languages_1.Language.cpp]: ["a/b", "c/d"],
});
(0, ava_1.default)("input overrides", parseInputAndConfigMacro, ["a/b", "c/d"], " e/f, g/h@1.2.3 ", [languages_1.Language.cpp], {
    [languages_1.Language.cpp]: ["e/f", "g/h@1.2.3"],
});
(0, ava_1.default)("input and config", parseInputAndConfigMacro, ["a/b", "c/d"], " +e/f, g/h@1.2.3 ", [languages_1.Language.cpp], {
    [languages_1.Language.cpp]: ["e/f", "g/h@1.2.3", "a/b", "c/d"],
});
(0, ava_1.default)("input with no language", parseInputAndConfigErrorMacro, {}, "c/d", [], false, /No languages specified/);
(0, ava_1.default)("input with two languages", parseInputAndConfigErrorMacro, {}, "c/d", [languages_1.Language.cpp, languages_1.Language.csharp], false, /multi-language analysis/);
(0, ava_1.default)("input with + only", parseInputAndConfigErrorMacro, {}, " + ", [languages_1.Language.cpp], true, /remove the '\+'/);
(0, ava_1.default)("input with invalid pack name", parseInputAndConfigErrorMacro, {}, " xxx", [languages_1.Language.cpp], false, /"xxx" is not a valid pack/);
const mlPoweredQueriesMacro = ava_1.default.macro({
    exec: async (t, codeQLVersion, isMlPoweredQueriesEnabled, packsInput, queriesInput, expectedVersionString) => {
        return await util.withTmpDir(async (tmpDir) => {
            const codeQL = (0, codeql_1.setCodeQL)({
                async getVersion() {
                    return codeQLVersion;
                },
                async resolveQueries() {
                    return {
                        byLanguage: {
                            javascript: { "fake-query.ql": {} },
                        },
                        noDeclaredLanguage: {},
                        multipleDeclaredLanguages: {},
                    };
                },
                async packDownload() {
                    return { packs: [] };
                },
            });
            const { packs } = await configUtils.initConfig("javascript", queriesInput, packsInput, undefined, undefined, undefined, false, false, "", "", { owner: "github", repo: "example " }, tmpDir, codeQL, tmpDir, gitHubVersion, sampleApiDetails, (0, testing_utils_1.createFeatures)(isMlPoweredQueriesEnabled ? [feature_flags_1.Feature.MlPoweredQueriesEnabled] : []), (0, logging_1.getRunnerLogger)(true));
            if (expectedVersionString !== undefined) {
                t.deepEqual(packs, {
                    [languages_1.Language.javascript]: [
                        `codeql/javascript-experimental-atm-queries@${expectedVersionString}`,
                    ],
                });
            }
            else {
                t.deepEqual(packs, {});
            }
        });
    },
    title: (_providedTitle, codeQLVersion, isMlPoweredQueriesEnabled, packsInput, queriesInput, expectedVersionString) => `ML-powered queries ${expectedVersionString !== undefined
        ? `${expectedVersionString} are`
        : "aren't"} loaded for packs: ${packsInput}, queries: ${queriesInput} using CLI v${codeQLVersion} when feature is ${isMlPoweredQueriesEnabled ? "enabled" : "disabled"}`,
});
// macro, codeQLVersion, isMlPoweredQueriesEnabled, packsInput, queriesInput, expectedVersionString
// Test that ML-powered queries aren't run when the feature is off.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.7.5", false, undefined, "security-extended", undefined);
// Test that the ~0.1.0 version of ML-powered queries is run on v2.8.3 of the CLI.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.8.3", true, undefined, "security-extended", process.platform === "win32" ? undefined : "~0.1.0");
// Test that ML-powered queries aren't run when the user hasn't specified that we should run the
// `security-extended` or `security-and-quality` query suite.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.7.5", true, undefined, undefined, undefined);
// Test that ML-powered queries are run on non-Windows platforms running `security-extended` on
// versions of the CodeQL CLI prior to 2.9.0.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.8.5", true, undefined, "security-extended", process.platform === "win32" ? undefined : "~0.2.0");
// Test that ML-powered queries are run on non-Windows platforms running `security-and-quality` on
// versions of the CodeQL CLI prior to 2.9.0.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.8.5", true, undefined, "security-and-quality", process.platform === "win32" ? undefined : "~0.2.0");
// Test that ML-powered queries are run on all platforms running `security-extended` on CodeQL CLI
// 2.9.0+.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.9.0", true, undefined, "security-extended", "~0.2.0");
// Test that ML-powered queries are run on all platforms running `security-and-quality` on CodeQL
// CLI 2.9.0+.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.9.0", true, undefined, "security-and-quality", "~0.2.0");
// Test that we don't inject an ML-powered query pack if the user has already specified one.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.9.0", true, "codeql/javascript-experimental-atm-queries@0.0.1", "security-and-quality", "0.0.1");
// Test that ML-powered queries are run on all platforms running `security-extended` on CodeQL
// CLI 2.9.3+.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.9.3", true, undefined, "security-extended", "~0.3.0");
// Test that ML-powered queries are run on all platforms running `security-and-quality` on CodeQL
// CLI 2.9.3+.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.9.3", true, undefined, "security-and-quality", "~0.3.0");
// Test that ML-powered queries are run on all platforms running `security-extended` on CodeQL
// CLI 2.11.3+.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.11.3", true, undefined, "security-extended", "~0.4.0");
// Test that ML-powered queries are run on all platforms running `security-and-quality` on CodeQL
// CLI 2.11.3+.
(0, ava_1.default)(mlPoweredQueriesMacro, "2.11.3", true, undefined, "security-and-quality", "~0.4.0");
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
    injectedMlQueries: false,
});
(0, ava_1.default)(calculateAugmentationMacro, "With queries", undefined, " a, b , c, d", [languages_1.Language.javascript], {
    queriesInputCombines: false,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
    packsInputCombines: false,
    packsInput: undefined,
    injectedMlQueries: false,
});
(0, ava_1.default)(calculateAugmentationMacro, "With queries combining", undefined, "   +   a, b , c, d ", [languages_1.Language.javascript], {
    queriesInputCombines: true,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
    packsInputCombines: false,
    packsInput: undefined,
    injectedMlQueries: false,
});
(0, ava_1.default)(calculateAugmentationMacro, "With packs", "   codeql/a , codeql/b   , codeql/c  , codeql/d  ", undefined, [languages_1.Language.javascript], {
    queriesInputCombines: false,
    queriesInput: undefined,
    packsInputCombines: false,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
    injectedMlQueries: false,
});
(0, ava_1.default)(calculateAugmentationMacro, "With packs combining", "   +   codeql/a, codeql/b, codeql/c, codeql/d", undefined, [languages_1.Language.javascript], {
    queriesInputCombines: false,
    queriesInput: undefined,
    packsInputCombines: true,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
    injectedMlQueries: false,
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
(0, ava_1.default)("downloadPacks-no-registries", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const packDownloadStub = sinon.stub();
        packDownloadStub.callsFake((packs) => ({
            packs,
        }));
        const codeQL = (0, codeql_1.setCodeQL)({
            packDownload: packDownloadStub,
        });
        const logger = (0, logging_1.getRunnerLogger)(true);
        // packs are supplied for go, java, and python
        // analyzed languages are java, javascript, and python
        await configUtils.downloadPacks(codeQL, [languages_1.Language.javascript, languages_1.Language.java, languages_1.Language.python], {
            java: ["a", "b"],
            go: ["c", "d"],
            python: ["e", "f"],
        }, undefined, // registries
        sampleApiDetails, tmpDir, logger);
        // Expecting packs to be downloaded once for java and once for python
        t.deepEqual(packDownloadStub.callCount, 2);
        // no config file was created, so pass `undefined` as the config file path
        t.deepEqual(packDownloadStub.firstCall.args, [["a", "b"], undefined]);
        t.deepEqual(packDownloadStub.secondCall.args, [["e", "f"], undefined]);
    });
});
(0, ava_1.default)("downloadPacks-with-registries", async (t) => {
    // same thing, but this time include a registries block and
    // associated env vars
    return await util.withTmpDir(async (tmpDir) => {
        process.env.GITHUB_TOKEN = "not-a-token";
        process.env.CODEQL_REGISTRIES_AUTH = "not-a-registries-auth";
        const logger = (0, logging_1.getRunnerLogger)(true);
        const registries = [
            {
                // no slash
                url: "http://ghcr.io",
                packages: ["codeql/*", "dsp-testing/*"],
                token: "not-a-token",
            },
            {
                // with slash
                url: "https://containers.GHEHOSTNAME1/v2/",
                packages: "semmle/*",
                token: "still-not-a-token",
            },
        ];
        // append a slash to the first url
        const expectedRegistries = registries.map((r, i) => ({
            packages: r.packages,
            url: i === 0 ? `${r.url}/` : r.url,
        }));
        const expectedConfigFile = path.join(tmpDir, "qlconfig.yml");
        const packDownloadStub = sinon.stub();
        packDownloadStub.callsFake((packs, configFile) => {
            t.deepEqual(configFile, expectedConfigFile);
            // verify the env vars were set correctly
            t.deepEqual(process.env.GITHUB_TOKEN, sampleApiDetails.auth);
            t.deepEqual(process.env.CODEQL_REGISTRIES_AUTH, "http://ghcr.io=not-a-token,https://containers.GHEHOSTNAME1/v2/=still-not-a-token");
            // verify the config file contents were set correctly
            const config = yaml.load(fs.readFileSync(configFile, "utf8"));
            t.deepEqual(config.registries, expectedRegistries);
            return {
                packs,
            };
        });
        const codeQL = (0, codeql_1.setCodeQL)({
            packDownload: packDownloadStub,
            getVersion: () => Promise.resolve("2.10.5"),
        });
        // packs are supplied for go, java, and python
        // analyzed languages are java, javascript, and python
        await configUtils.downloadPacks(codeQL, [languages_1.Language.javascript, languages_1.Language.java, languages_1.Language.python], {
            java: ["a", "b"],
            go: ["c", "d"],
            python: ["e", "f"],
        }, registries, sampleApiDetails, tmpDir, logger);
        // Same packs are downloaded as in previous test
        t.deepEqual(packDownloadStub.callCount, 2);
        t.deepEqual(packDownloadStub.firstCall.args, [
            ["a", "b"],
            expectedConfigFile,
        ]);
        t.deepEqual(packDownloadStub.secondCall.args, [
            ["e", "f"],
            expectedConfigFile,
        ]);
        // Verify that the env vars were unset.
        t.deepEqual(process.env.GITHUB_TOKEN, "not-a-token");
        t.deepEqual(process.env.CODEQL_REGISTRIES_AUTH, "not-a-registries-auth");
    });
});
(0, ava_1.default)("downloadPacks-with-registries fails on 2.10.3", async (t) => {
    // same thing, but this time include a registries block and
    // associated env vars
    return await util.withTmpDir(async (tmpDir) => {
        process.env.GITHUB_TOKEN = "not-a-token";
        process.env.CODEQL_REGISTRIES_AUTH = "not-a-registries-auth";
        const logger = (0, logging_1.getRunnerLogger)(true);
        const registries = [
            {
                url: "http://ghcr.io",
                packages: ["codeql/*", "dsp-testing/*"],
                token: "not-a-token",
            },
            {
                url: "https://containers.GHEHOSTNAME1/v2/",
                packages: "semmle/*",
                token: "still-not-a-token",
            },
        ];
        const codeQL = (0, codeql_1.setCodeQL)({
            getVersion: () => Promise.resolve("2.10.3"),
        });
        await t.throwsAsync(async () => {
            return await configUtils.downloadPacks(codeQL, [languages_1.Language.javascript, languages_1.Language.java, languages_1.Language.python], {}, registries, sampleApiDetails, tmpDir, logger);
        }, { instanceOf: Error }, "'registries' input is not supported on CodeQL versions less than 2.10.4.");
    });
});
(0, ava_1.default)("downloadPacks-with-registries fails with invalid registries block", async (t) => {
    // same thing, but this time include a registries block and
    // associated env vars
    return await util.withTmpDir(async (tmpDir) => {
        process.env.GITHUB_TOKEN = "not-a-token";
        process.env.CODEQL_REGISTRIES_AUTH = "not-a-registries-auth";
        const logger = (0, logging_1.getRunnerLogger)(true);
        const registries = [
            {
                // missing url property
                packages: ["codeql/*", "dsp-testing/*"],
                token: "not-a-token",
            },
            {
                url: "https://containers.GHEHOSTNAME1/v2/",
                packages: "semmle/*",
                token: "still-not-a-token",
            },
        ];
        const codeQL = (0, codeql_1.setCodeQL)({
            getVersion: () => Promise.resolve("2.10.4"),
        });
        await t.throwsAsync(async () => {
            return await configUtils.downloadPacks(codeQL, [languages_1.Language.javascript, languages_1.Language.java, languages_1.Language.python], {}, registries, sampleApiDetails, tmpDir, logger);
        }, { instanceOf: Error }, "Invalid 'registries' input. Must be an array of objects with 'url' and 'packages' properties.");
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
//# sourceMappingURL=config-utils.test.js.map