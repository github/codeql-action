"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const github = __importStar(require("@actions/github"));
const ava_1 = __importDefault(require("ava"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sinon_1 = __importDefault(require("sinon"));
const api = __importStar(require("./api-client"));
const CodeQL = __importStar(require("./codeql"));
const configUtils = __importStar(require("./config-utils"));
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
testing_utils_1.setupTests(ava_1.default);
function setInput(name, value) {
    // Transformation copied from
    // https://github.com/actions/toolkit/blob/05e39f551d33e1688f61b209ab5cdd335198f1b8/packages/core/src/core.ts#L69
    const envVar = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
    if (value !== undefined) {
        process.env[envVar] = value;
    }
    else {
        delete process.env[envVar];
    }
}
function mockGetContents(content) {
    // Passing an auth token is required, so we just use a dummy value
    let client = new github.GitHub('123');
    const response = {
        data: content
    };
    const spyGetContents = sinon_1.default.stub(client.repos, "getContents").resolves(response);
    sinon_1.default.stub(api, "getApiClient").value(() => client);
    return spyGetContents;
}
function mockListLanguages(languages) {
    // Passing an auth token is required, so we just use a dummy value
    let client = new github.GitHub('123');
    const response = {
        data: {},
    };
    for (const language of languages) {
        response.data[language] = 123;
    }
    sinon_1.default.stub(client.repos, "listLanguages").resolves(response);
    sinon_1.default.stub(api, "getApiClient").value(() => client);
}
ava_1.default("load empty config", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env['RUNNER_TEMP'] = tmpDir;
        process.env['GITHUB_WORKSPACE'] = tmpDir;
        setInput('config-file', undefined);
        setInput('languages', 'javascript,python');
        CodeQL.setCodeQL({
            resolveQueries: async function () {
                return {
                    byLanguage: {},
                    noDeclaredLanguage: {},
                    multipleDeclaredLanguages: {},
                };
            },
        });
        const config = await configUtils.initConfig();
        t.deepEqual(config, await configUtils.getDefaultConfig());
    });
});
ava_1.default("loading config saves config", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env['RUNNER_TEMP'] = tmpDir;
        process.env['GITHUB_WORKSPACE'] = tmpDir;
        setInput('config-file', undefined);
        setInput('languages', 'javascript,python');
        CodeQL.setCodeQL({
            resolveQueries: async function () {
                return {
                    byLanguage: {},
                    noDeclaredLanguage: {},
                    multipleDeclaredLanguages: {},
                };
            },
        });
        // Sanity check the saved config file does not already exist
        t.false(fs.existsSync(configUtils.getPathToParsedConfigFile()));
        // Sanity check that getConfig throws before we have called initConfig
        await t.throwsAsync(configUtils.getConfig);
        const config1 = await configUtils.initConfig();
        // The saved config file should now exist
        t.true(fs.existsSync(configUtils.getPathToParsedConfigFile()));
        // And that same newly-initialised config should now be returned by getConfig
        const config2 = await configUtils.getConfig();
        t.deepEqual(config1, config2);
    });
});
ava_1.default("load non-local input with invalid repo syntax", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env['RUNNER_TEMP'] = tmpDir;
        process.env['GITHUB_WORKSPACE'] = tmpDir;
        // no filename given, just a repo
        setInput('config-file', 'octo-org/codeql-config@main');
        try {
            await configUtils.initConfig();
            throw new Error('initConfig did not throw error');
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getConfigFileRepoFormatInvalidMessage('octo-org/codeql-config@main')));
        }
    });
});
ava_1.default("load non-empty input", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env['RUNNER_TEMP'] = tmpDir;
        process.env['GITHUB_WORKSPACE'] = tmpDir;
        process.env['GITHUB_REPOSITORY'] = "octo-org/codeql-config";
        process.env["GITHUB_REF"] = "refs/heads/main";
        CodeQL.setCodeQL({
            resolveQueries: async function () {
                return {
                    byLanguage: {
                        'javascript': {
                            '/foo/a.ql': {},
                            '/bar/b.ql': {},
                        },
                    },
                    noDeclaredLanguage: {},
                    multipleDeclaredLanguages: {},
                };
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
        const dummyResponse = {
            content: Buffer.from(inputFileContents).toString("base64"),
        };
        const spyGetContents = mockGetContents(dummyResponse);
        fs.mkdirSync(path.join(tmpDir, 'foo'));
        // And the config we expect it to parse to
        const expectedConfig = {
            languages: ['javascript'],
            queries: { 'javascript': ['/foo/a.ql', '/bar/b.ql'] },
            pathsIgnore: ['a', 'b'],
            paths: ['c/d'],
            originalUserInput: {
                name: 'my config',
                'disable-default-queries': true,
                queries: [{ uses: './foo' }],
                'paths-ignore': ['a', 'b'],
                paths: ['c/d'],
            },
        };
        setInput('config-file', 'input');
        setInput('languages', 'javascript');
        const actualConfig = await configUtils.initConfig();
        // Should exactly equal the object we constructed earlier
        t.deepEqual(actualConfig, expectedConfig);
        t.assert(spyGetContents.called);
    });
});
ava_1.default("default queries are used", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env['RUNNER_TEMP'] = tmpDir;
        process.env['GITHUB_WORKSPACE'] = tmpDir;
        process.env['GITHUB_REPOSITORY'] = "octo-org/codeql-config";
        process.env["GITHUB_REF"] = "refs/heads/main";
        // Check that the default behaviour is to add the default queries.
        // In this case if a config file is specified but does not include
        // the disable-default-queries field.
        // We determine this by whether CodeQL.resolveQueries is called
        // with the correct arguments.
        const resolveQueriesArgs = [];
        CodeQL.setCodeQL({
            resolveQueries: async function (queries, extraSearchPath) {
                resolveQueriesArgs.push({ queries, extraSearchPath });
                return {
                    byLanguage: {
                        'javascript': {
                            'foo.ql': {},
                        },
                    },
                    noDeclaredLanguage: {},
                    multipleDeclaredLanguages: {},
                };
            },
        });
        // The important point of this config is that it doesn't specify
        // the disable-default-queries field.
        // Any other details are hopefully irrelevant for this tetst.
        const inputFileContents = `
      paths:
        - foo`;
        const dummyResponse = {
            content: Buffer.from(inputFileContents).toString("base64"),
        };
        const spyGetContents = mockGetContents(dummyResponse);
        fs.mkdirSync(path.join(tmpDir, 'foo'));
        setInput('config-file', 'input');
        setInput('languages', 'javascript');
        await configUtils.initConfig();
        // Check resolve queries was called correctly
        t.deepEqual(resolveQueriesArgs.length, 1);
        t.deepEqual(resolveQueriesArgs[0].queries, ['javascript-code-scanning.qls']);
        t.deepEqual(resolveQueriesArgs[0].extraSearchPath, undefined);
        t.assert(spyGetContents.called);
    });
});
ava_1.default("API client used when reading remote config", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env['RUNNER_TEMP'] = tmpDir;
        process.env['GITHUB_WORKSPACE'] = tmpDir;
        CodeQL.setCodeQL({
            resolveQueries: async function () {
                return {
                    byLanguage: {
                        'javascript': {
                            'foo.ql': {},
                        },
                    },
                    noDeclaredLanguage: {},
                    multipleDeclaredLanguages: {},
                };
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
        fs.mkdirSync(path.join(tmpDir, 'foo/bar'), { recursive: true });
        setInput('config-file', 'octo-org/codeql-config/config.yaml@main');
        setInput('languages', 'javascript');
        await configUtils.initConfig();
        t.assert(spyGetContents.called);
    });
});
ava_1.default("Remote config handles the case where a directory is provided", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env['RUNNER_TEMP'] = tmpDir;
        process.env['GITHUB_WORKSPACE'] = tmpDir;
        const dummyResponse = []; // directories are returned as arrays
        mockGetContents(dummyResponse);
        const repoReference = 'octo-org/codeql-config/config.yaml@main';
        setInput('config-file', repoReference);
        try {
            await configUtils.initConfig();
            throw new Error('initConfig did not throw error');
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getConfigFileDirectoryGivenMessage(repoReference)));
        }
    });
});
ava_1.default("Invalid format of remote config handled correctly", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env['RUNNER_TEMP'] = tmpDir;
        process.env['GITHUB_WORKSPACE'] = tmpDir;
        const dummyResponse = {
        // note no "content" property here
        };
        mockGetContents(dummyResponse);
        const repoReference = 'octo-org/codeql-config/config.yaml@main';
        setInput('config-file', repoReference);
        try {
            await configUtils.initConfig();
            throw new Error('initConfig did not throw error');
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getConfigFileFormatInvalidMessage(repoReference)));
        }
    });
});
ava_1.default("No detected languages", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env['RUNNER_TEMP'] = tmpDir;
        process.env['GITHUB_WORKSPACE'] = tmpDir;
        mockListLanguages([]);
        try {
            await configUtils.initConfig();
            throw new Error('initConfig did not throw error');
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getNoLanguagesError()));
        }
    });
});
ava_1.default("Unknown languages", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env['RUNNER_TEMP'] = tmpDir;
        process.env['GITHUB_WORKSPACE'] = tmpDir;
        setInput('languages', 'ruby,english');
        try {
            await configUtils.initConfig();
            throw new Error('initConfig did not throw error');
        }
        catch (err) {
            t.deepEqual(err, new Error(configUtils.getUnknownLanguagesError(['ruby', 'english'])));
        }
    });
});
function doInvalidInputTest(testName, inputFileContents, expectedErrorMessageGenerator) {
    ava_1.default("load invalid input - " + testName, async (t) => {
        return await util.withTmpDir(async (tmpDir) => {
            process.env['RUNNER_TEMP'] = tmpDir;
            process.env['GITHUB_WORKSPACE'] = tmpDir;
            process.env['GITHUB_REPOSITORY'] = "octo-org/codeql-config";
            process.env["GITHUB_REF"] = "refs/heads/main";
            CodeQL.setCodeQL({
                resolveQueries: async function () {
                    return {
                        byLanguage: {},
                        noDeclaredLanguage: {},
                        multipleDeclaredLanguages: {},
                    };
                },
            });
            const dummyResponse = {
                content: Buffer.from(inputFileContents).toString("base64"),
            };
            const spyGetContents = mockGetContents(dummyResponse);
            setInput('config-file', 'input');
            setInput('languages', 'javascript');
            try {
                await configUtils.initConfig();
                throw new Error('initConfig did not throw error');
            }
            catch (err) {
                t.deepEqual(err, new Error(expectedErrorMessageGenerator("input")));
                t.assert(spyGetContents.called);
            }
        });
    });
}
doInvalidInputTest('name invalid type', `
  name:
    - foo: bar`, configUtils.getNameInvalid);
doInvalidInputTest('disable-default-queries invalid type', `disable-default-queries: 42`, configUtils.getDisableDefaultQueriesInvalid);
doInvalidInputTest('queries invalid type', `queries: foo`, configUtils.getQueriesInvalid);
doInvalidInputTest('paths-ignore invalid type', `paths-ignore: bar`, configUtils.getPathsIgnoreInvalid);
doInvalidInputTest('paths invalid type', `paths: 17`, configUtils.getPathsInvalid);
doInvalidInputTest('queries uses invalid type', `
  queries:
  - uses:
      - hello: world`, configUtils.getQueryUsesInvalid);
function doInvalidQueryUsesTest(input, expectedErrorMessageGenerator) {
    // Invalid contents of a "queries.uses" field.
    // Should fail with the expected error message
    const inputFileContents = `
    name: my config
    queries:
      - name: foo
        uses: ` + input;
    doInvalidInputTest("queries uses \"" + input + "\"", inputFileContents, expectedErrorMessageGenerator);
}
// Various "uses" fields, and the errors they should produce
doInvalidQueryUsesTest("''", c => configUtils.getQueryUsesInvalid(c, undefined));
doInvalidQueryUsesTest("foo/bar", c => configUtils.getQueryUsesInvalid(c, "foo/bar"));
doInvalidQueryUsesTest("foo/bar@v1@v2", c => configUtils.getQueryUsesInvalid(c, "foo/bar@v1@v2"));
doInvalidQueryUsesTest("foo@master", c => configUtils.getQueryUsesInvalid(c, "foo@master"));
doInvalidQueryUsesTest("https://github.com/foo/bar@master", c => configUtils.getQueryUsesInvalid(c, "https://github.com/foo/bar@master"));
doInvalidQueryUsesTest("./foo", c => configUtils.getLocalPathDoesNotExist(c, "foo"));
// doInvalidQueryUsesTest(
//   "./..",
//   c => configUtils.getLocalPathOutsideOfRepository(c, ".."));
const validPaths = [
    'foo',
    'foo/',
    'foo/**',
    'foo/**/',
    'foo/**/**',
    'foo/**/bar/**/baz',
    '**/',
    '**/foo',
    '/foo',
];
const invalidPaths = [
    'a/***/b',
    'a/**b',
    'a/b**',
    '**',
];
ava_1.default('path validations', t => {
    // Dummy values to pass to validateAndSanitisePath
    const propertyName = 'paths';
    const configFile = './.github/codeql/config.yml';
    for (const path of validPaths) {
        t.truthy(configUtils.validateAndSanitisePath(path, propertyName, configFile));
    }
    for (const path of invalidPaths) {
        t.throws(() => configUtils.validateAndSanitisePath(path, propertyName, configFile));
    }
});
ava_1.default('path sanitisation', t => {
    // Dummy values to pass to validateAndSanitisePath
    const propertyName = 'paths';
    const configFile = './.github/codeql/config.yml';
    // Valid paths are not modified
    t.deepEqual(configUtils.validateAndSanitisePath('foo/bar', propertyName, configFile), 'foo/bar');
    // Trailing stars are stripped
    t.deepEqual(configUtils.validateAndSanitisePath('foo/**', propertyName, configFile), 'foo/');
});
//# sourceMappingURL=config-utils.test.js.map