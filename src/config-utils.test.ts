import * as fs from "fs";
import * as path from "path";

import * as github from "@actions/github";
import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import * as api from "./api-client";
import { getCachedCodeQL, setCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { createFeatureFlags, FeatureFlag } from "./feature-flags";
import { Language } from "./languages";
import { getRunnerLogger, Logger } from "./logging";
import { setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

const sampleApiDetails = {
  auth: "token",
  externalRepoAuth: "token",
  url: "https://github.example.com",
};

const gitHubVersion = { type: util.GitHubVariant.DOTCOM } as util.GitHubVersion;

// Returns the filepath of the newly-created file
function createConfigFile(inputFileContents: string, tmpDir: string): string {
  const configFilePath = path.join(tmpDir, "input");
  fs.writeFileSync(configFilePath, inputFileContents, "utf8");
  return configFilePath;
}

type GetContentsResponse = { content?: string } | Array<{}>;

function mockGetContents(
  content: GetContentsResponse
): sinon.SinonStub<any, any> {
  // Passing an auth token is required, so we just use a dummy value
  const client = github.getOctokit("123");
  const response = {
    data: content,
  };
  const spyGetContents = sinon
    .stub(client.repos, "getContent")
    .resolves(response as any);
  sinon.stub(api, "getApiClient").value(() => client);
  return spyGetContents;
}

function mockListLanguages(languages: string[]) {
  // Passing an auth token is required, so we just use a dummy value
  const client = github.getOctokit("123");
  const response = {
    data: {},
  };
  for (const language of languages) {
    response.data[language] = 123;
  }
  sinon.stub(client.repos, "listLanguages").resolves(response as any);
  sinon.stub(api, "getApiClient").value(() => client);
}

test("load empty config", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const logger = getRunnerLogger(true);
    const languages = "javascript,python";

    const codeQL = setCodeQL({
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
    });

    const config = await configUtils.initConfig(
      languages,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      "",
      "",
      { owner: "github", repo: "example " },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      logger
    );

    t.deepEqual(
      config,
      await configUtils.getDefaultConfig(
        languages,
        undefined,
        undefined,
        undefined,
        false,
        "",
        "",
        { owner: "github", repo: "example " },
        tmpDir,
        tmpDir,
        codeQL,
        tmpDir,
        gitHubVersion,
        sampleApiDetails,
        createFeatureFlags([]),
        logger
      )
    );
  });
});

test("loading config saves config", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const logger = getRunnerLogger(true);

    const codeQL = setCodeQL({
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
    });

    // Sanity check the saved config file does not already exist
    t.false(fs.existsSync(configUtils.getPathToParsedConfigFile(tmpDir)));

    // Sanity check that getConfig returns undefined before we have called initConfig
    t.deepEqual(await configUtils.getConfig(tmpDir, logger), undefined);

    const config1 = await configUtils.initConfig(
      "javascript,python",
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      "",
      "",
      { owner: "github", repo: "example " },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      logger
    );

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

test("load input outside of workspace", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    try {
      await configUtils.initConfig(
        undefined,
        undefined,
        undefined,
        "../input",
        undefined,
        false,
        "",
        "",
        { owner: "github", repo: "example " },
        tmpDir,
        tmpDir,
        getCachedCodeQL(),
        tmpDir,
        gitHubVersion,
        sampleApiDetails,
        createFeatureFlags([]),
        getRunnerLogger(true)
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new Error(
          configUtils.getConfigFileOutsideWorkspaceErrorMessage(
            path.join(tmpDir, "../input")
          )
        )
      );
    }
  });
});

test("load non-local input with invalid repo syntax", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    // no filename given, just a repo
    const configFile = "octo-org/codeql-config@main";

    try {
      await configUtils.initConfig(
        undefined,
        undefined,
        undefined,
        configFile,
        undefined,
        false,
        "",
        "",
        { owner: "github", repo: "example " },
        tmpDir,
        tmpDir,
        getCachedCodeQL(),
        tmpDir,
        gitHubVersion,
        sampleApiDetails,
        createFeatureFlags([]),
        getRunnerLogger(true)
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new Error(
          configUtils.getConfigFileRepoFormatInvalidMessage(
            "octo-org/codeql-config@main"
          )
        )
      );
    }
  });
});

test("load non-existent input", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const languages = "javascript";
    const configFile = "input";
    t.false(fs.existsSync(path.join(tmpDir, configFile)));

    try {
      await configUtils.initConfig(
        languages,
        undefined,
        undefined,
        configFile,
        undefined,
        false,
        "",
        "",
        { owner: "github", repo: "example " },
        tmpDir,
        tmpDir,
        getCachedCodeQL(),
        tmpDir,
        gitHubVersion,
        sampleApiDetails,
        createFeatureFlags([]),
        getRunnerLogger(true)
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new Error(
          configUtils.getConfigFileDoesNotExistErrorMessage(
            path.join(tmpDir, "input")
          )
        )
      );
    }
  });
});

test("load non-empty input", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const codeQL = setCodeQL({
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
    const expectedConfig: configUtils.Config = {
      languages: [Language.javascript],
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
      toolCacheDir: tmpDir,
      codeQLCmd: codeQL.getPath(),
      gitHubVersion,
      dbLocation: path.resolve(tmpDir, "codeql_databases"),
      packs: {} as configUtils.Packs,
      debugMode: false,
      debugArtifactName: "my-artifact",
      debugDatabaseName: "my-db",
      augmentationProperties: {
        injectedMlQueries: false,
        packsInputCombines: false,
        queriesInputCombines: false,
        packsInput: undefined,
        queriesInput: undefined,
      },
    };

    const languages = "javascript";
    const configFilePath = createConfigFile(inputFileContents, tmpDir);

    const actualConfig = await configUtils.initConfig(
      languages,
      undefined,
      undefined,
      configFilePath,
      undefined,
      false,
      "my-artifact",
      "my-db",
      { owner: "github", repo: "example " },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      getRunnerLogger(true)
    );

    // Should exactly equal the object we constructed earlier
    t.deepEqual(actualConfig, expectedConfig);
  });
});

test("Default queries are used", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    // Check that the default behaviour is to add the default queries.
    // In this case if a config file is specified but does not include
    // the disable-default-queries field.
    // We determine this by whether CodeQL.resolveQueries is called
    // with the correct arguments.

    const resolveQueriesArgs: Array<{
      queries: string[];
      extraSearchPath: string | undefined;
    }> = [];
    const codeQL = setCodeQL({
      async resolveQueries(
        queries: string[],
        extraSearchPath: string | undefined
      ) {
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

    await configUtils.initConfig(
      languages,
      undefined,
      undefined,
      configFilePath,
      undefined,
      false,
      "",
      "",
      { owner: "github", repo: "example " },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      getRunnerLogger(true)
    );

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
function queriesToResolvedQueryForm(queries: string[]) {
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

test("Queries can be specified in config file", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const inputFileContents = `
      name: my config
      queries:
        - uses: ./foo`;

    const configFilePath = createConfigFile(inputFileContents, tmpDir);

    fs.mkdirSync(path.join(tmpDir, "foo"));

    const resolveQueriesArgs: Array<{
      queries: string[];
      extraSearchPath: string | undefined;
    }> = [];
    const codeQL = setCodeQL({
      async resolveQueries(
        queries: string[],
        extraSearchPath: string | undefined
      ) {
        resolveQueriesArgs.push({ queries, extraSearchPath });
        return queriesToResolvedQueryForm(queries);
      },
    });

    const languages = "javascript";

    const config = await configUtils.initConfig(
      languages,
      undefined,
      undefined,
      configFilePath,
      undefined,
      false,
      "",
      "",
      { owner: "github", repo: "example " },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      getRunnerLogger(true)
    );

    // Check resolveQueries was called correctly
    // It'll be called once for the default queries
    // and once for `./foo` from the config file.
    t.deepEqual(resolveQueriesArgs.length, 2);
    t.deepEqual(resolveQueriesArgs[1].queries.length, 1);
    t.regex(resolveQueriesArgs[1].queries[0], /.*\/foo$/);

    // Now check that the end result contains the default queries and the query from config
    t.deepEqual(config.queries["javascript"].builtin.length, 1);
    t.deepEqual(config.queries["javascript"].custom.length, 1);
    t.regex(
      config.queries["javascript"].builtin[0],
      /javascript-code-scanning.qls$/
    );
    t.regex(config.queries["javascript"].custom[0].queries[0], /.*\/foo$/);
  });
});

test("Queries from config file can be overridden in workflow file", async (t) => {
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

    const resolveQueriesArgs: Array<{
      queries: string[];
      extraSearchPath: string | undefined;
    }> = [];
    const codeQL = setCodeQL({
      async resolveQueries(
        queries: string[],
        extraSearchPath: string | undefined
      ) {
        resolveQueriesArgs.push({ queries, extraSearchPath });
        return queriesToResolvedQueryForm(queries);
      },
    });

    const languages = "javascript";

    const config = await configUtils.initConfig(
      languages,
      testQueries,
      undefined,
      configFilePath,
      undefined,
      false,
      "",
      "",
      { owner: "github", repo: "example " },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      getRunnerLogger(true)
    );

    // Check resolveQueries was called correctly
    // It'll be called once for the default queries and once for `./override`,
    // but won't be called for './foo' from the config file.
    t.deepEqual(resolveQueriesArgs.length, 2);
    t.deepEqual(resolveQueriesArgs[1].queries.length, 1);
    t.regex(resolveQueriesArgs[1].queries[0], /.*\/override$/);

    // Now check that the end result contains only the default queries and the override query
    t.deepEqual(config.queries["javascript"].builtin.length, 1);
    t.deepEqual(config.queries["javascript"].custom.length, 1);
    t.regex(
      config.queries["javascript"].builtin[0],
      /javascript-code-scanning.qls$/
    );
    t.regex(config.queries["javascript"].custom[0].queries[0], /.*\/override$/);
  });
});

test("Queries in workflow file can be used in tandem with the 'disable default queries' option", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    process.env["RUNNER_TEMP"] = tmpDir;
    process.env["GITHUB_WORKSPACE"] = tmpDir;

    const inputFileContents = `
      name: my config
      disable-default-queries: true`;
    const configFilePath = createConfigFile(inputFileContents, tmpDir);

    const testQueries = "./workflow-query";
    fs.mkdirSync(path.join(tmpDir, "workflow-query"));

    const resolveQueriesArgs: Array<{
      queries: string[];
      extraSearchPath: string | undefined;
    }> = [];
    const codeQL = setCodeQL({
      async resolveQueries(
        queries: string[],
        extraSearchPath: string | undefined
      ) {
        resolveQueriesArgs.push({ queries, extraSearchPath });
        return queriesToResolvedQueryForm(queries);
      },
    });

    const languages = "javascript";

    const config = await configUtils.initConfig(
      languages,
      testQueries,
      undefined,
      configFilePath,
      undefined,
      false,
      "",
      "",
      { owner: "github", repo: "example " },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      getRunnerLogger(true)
    );

    // Check resolveQueries was called correctly
    // It'll be called once for `./workflow-query`,
    // but won't be called for the default one since that was disabled
    t.deepEqual(resolveQueriesArgs.length, 1);
    t.deepEqual(resolveQueriesArgs[0].queries.length, 1);
    t.regex(resolveQueriesArgs[0].queries[0], /.*\/workflow-query$/);

    // Now check that the end result contains only the workflow query, and not the default one
    t.deepEqual(config.queries["javascript"].builtin.length, 0);
    t.deepEqual(config.queries["javascript"].custom.length, 1);
    t.regex(
      config.queries["javascript"].custom[0].queries[0],
      /.*\/workflow-query$/
    );
  });
});

test("Multiple queries can be specified in workflow file, no config file required", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    fs.mkdirSync(path.join(tmpDir, "override1"));
    fs.mkdirSync(path.join(tmpDir, "override2"));

    const testQueries = "./override1,./override2";

    const resolveQueriesArgs: Array<{
      queries: string[];
      extraSearchPath: string | undefined;
    }> = [];
    const codeQL = setCodeQL({
      async resolveQueries(
        queries: string[],
        extraSearchPath: string | undefined
      ) {
        resolveQueriesArgs.push({ queries, extraSearchPath });
        return queriesToResolvedQueryForm(queries);
      },
    });

    const languages = "javascript";

    const config = await configUtils.initConfig(
      languages,
      testQueries,
      undefined,
      undefined,
      undefined,
      false,
      "",
      "",
      { owner: "github", repo: "example " },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      getRunnerLogger(true)
    );

    // Check resolveQueries was called correctly:
    // It'll be called once for the default queries,
    // and then once for each of the two queries from the workflow
    t.deepEqual(resolveQueriesArgs.length, 3);
    t.deepEqual(resolveQueriesArgs[1].queries.length, 1);
    t.deepEqual(resolveQueriesArgs[2].queries.length, 1);
    t.regex(resolveQueriesArgs[1].queries[0], /.*\/override1$/);
    t.regex(resolveQueriesArgs[2].queries[0], /.*\/override2$/);

    // Now check that the end result contains both the queries from the workflow, as well as the defaults
    t.deepEqual(config.queries["javascript"].builtin.length, 1);
    t.deepEqual(config.queries["javascript"].custom.length, 2);
    t.regex(
      config.queries["javascript"].builtin[0],
      /javascript-code-scanning.qls$/
    );
    t.regex(
      config.queries["javascript"].custom[0].queries[0],
      /.*\/override1$/
    );
    t.regex(
      config.queries["javascript"].custom[1].queries[0],
      /.*\/override2$/
    );
  });
});

test("Queries in workflow file can be added to the set of queries without overriding config file", async (t) => {
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

    const resolveQueriesArgs: Array<{
      queries: string[];
      extraSearchPath: string | undefined;
    }> = [];
    const codeQL = setCodeQL({
      async resolveQueries(
        queries: string[],
        extraSearchPath: string | undefined
      ) {
        resolveQueriesArgs.push({ queries, extraSearchPath });
        return queriesToResolvedQueryForm(queries);
      },
    });

    const languages = "javascript";

    const config = await configUtils.initConfig(
      languages,
      testQueries,
      undefined,
      configFilePath,
      undefined,
      false,
      "",
      "",
      { owner: "github", repo: "example " },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      getRunnerLogger(true)
    );

    // Check resolveQueries was called correctly
    // It'll be called once for the default queries,
    // once for each of additional1 and additional2,
    // and once for './foo' from the config file
    t.deepEqual(resolveQueriesArgs.length, 4);
    t.deepEqual(resolveQueriesArgs[1].queries.length, 1);
    t.regex(resolveQueriesArgs[1].queries[0], /.*\/additional1$/);
    t.deepEqual(resolveQueriesArgs[2].queries.length, 1);
    t.regex(resolveQueriesArgs[2].queries[0], /.*\/additional2$/);
    t.deepEqual(resolveQueriesArgs[3].queries.length, 1);
    t.regex(resolveQueriesArgs[3].queries[0], /.*\/foo$/);

    // Now check that the end result contains all the queries
    t.deepEqual(config.queries["javascript"].builtin.length, 1);
    t.deepEqual(config.queries["javascript"].custom.length, 3);
    t.regex(
      config.queries["javascript"].builtin[0],
      /javascript-code-scanning.qls$/
    );
    t.regex(
      config.queries["javascript"].custom[0].queries[0],
      /.*\/additional1$/
    );
    t.regex(
      config.queries["javascript"].custom[1].queries[0],
      /.*\/additional2$/
    );
    t.regex(config.queries["javascript"].custom[2].queries[0], /.*\/foo$/);
  });
});

test("Invalid queries in workflow file handled correctly", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const queries = "foo/bar@v1@v3";
    const languages = "javascript";

    // This function just needs to be type-correct; it doesn't need to do anything,
    // since we're deliberately passing in invalid data
    const codeQL = setCodeQL({
      async resolveQueries() {
        return {
          byLanguage: {
            javascript: {},
          },
          noDeclaredLanguage: {},
          multipleDeclaredLanguages: {},
        };
      },
    });

    try {
      await configUtils.initConfig(
        languages,
        queries,
        undefined,
        undefined,
        undefined,
        false,
        "",
        "",
        { owner: "github", repo: "example " },
        tmpDir,
        tmpDir,
        codeQL,
        tmpDir,
        gitHubVersion,
        sampleApiDetails,
        createFeatureFlags([]),
        getRunnerLogger(true)
      );
      t.fail("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new Error(configUtils.getQueryUsesInvalid(undefined, "foo/bar@v1@v3"))
      );
    }
  });
});

test("API client used when reading remote config", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const codeQL = setCodeQL({
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

    await configUtils.initConfig(
      languages,
      undefined,
      undefined,
      configFile,
      undefined,
      false,
      "",
      "",
      { owner: "github", repo: "example " },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      getRunnerLogger(true)
    );
    t.assert(spyGetContents.called);
  });
});

test("Remote config handles the case where a directory is provided", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const dummyResponse = []; // directories are returned as arrays
    mockGetContents(dummyResponse);

    const repoReference = "octo-org/codeql-config/config.yaml@main";
    try {
      await configUtils.initConfig(
        undefined,
        undefined,
        undefined,
        repoReference,
        undefined,
        false,
        "",
        "",
        { owner: "github", repo: "example " },
        tmpDir,
        tmpDir,
        getCachedCodeQL(),
        tmpDir,
        gitHubVersion,
        sampleApiDetails,
        createFeatureFlags([]),
        getRunnerLogger(true)
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new Error(configUtils.getConfigFileDirectoryGivenMessage(repoReference))
      );
    }
  });
});

test("Invalid format of remote config handled correctly", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const dummyResponse = {
      // note no "content" property here
    };
    mockGetContents(dummyResponse);

    const repoReference = "octo-org/codeql-config/config.yaml@main";
    try {
      await configUtils.initConfig(
        undefined,
        undefined,
        undefined,
        repoReference,
        undefined,
        false,
        "",
        "",
        { owner: "github", repo: "example " },
        tmpDir,
        tmpDir,
        getCachedCodeQL(),
        tmpDir,
        gitHubVersion,
        sampleApiDetails,
        createFeatureFlags([]),
        getRunnerLogger(true)
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new Error(configUtils.getConfigFileFormatInvalidMessage(repoReference))
      );
    }
  });
});

test("No detected languages", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    mockListLanguages([]);
    const codeQL = setCodeQL({
      async resolveLanguages() {
        return {};
      },
    });

    try {
      await configUtils.initConfig(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        "",
        "",
        { owner: "github", repo: "example " },
        tmpDir,
        tmpDir,
        codeQL,
        tmpDir,
        gitHubVersion,
        sampleApiDetails,
        createFeatureFlags([]),
        getRunnerLogger(true)
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(err, new Error(configUtils.getNoLanguagesError()));
    }
  });
});

test("Unknown languages", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const languages = "rubbish,english";

    try {
      await configUtils.initConfig(
        languages,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        "",
        "",
        { owner: "github", repo: "example " },
        tmpDir,
        tmpDir,
        getCachedCodeQL(),
        tmpDir,
        gitHubVersion,
        sampleApiDetails,
        createFeatureFlags([]),
        getRunnerLogger(true)
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new Error(configUtils.getUnknownLanguagesError(["rubbish", "english"]))
      );
    }
  });
});

test("Config specifies packages", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const codeQL = setCodeQL({
      async resolveQueries() {
        return {
          byLanguage: {},
          noDeclaredLanguage: {},
          multipleDeclaredLanguages: {},
        };
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

    const { packs } = await configUtils.initConfig(
      languages,
      undefined,
      undefined,
      configFile,
      undefined,
      false,
      "",
      "",
      { owner: "github", repo: "example " },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      getRunnerLogger(true)
    );
    t.deepEqual(packs as unknown, {
      [Language.javascript]: ["a/b@1.2.3"],
    });
  });
});

test("Config specifies packages for multiple languages", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    const codeQL = setCodeQL({
      async resolveQueries() {
        return {
          byLanguage: {
            cpp: { "/foo/a.ql": {} },
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

    const { packs, queries } = await configUtils.initConfig(
      languages,
      undefined,
      undefined,
      configFile,
      undefined,
      false,
      "",
      "",
      { owner: "github", repo: "example" },
      tmpDir,
      tmpDir,
      codeQL,
      tmpDir,
      gitHubVersion,
      sampleApiDetails,
      createFeatureFlags([]),
      getRunnerLogger(true)
    );
    t.deepEqual(packs as unknown, {
      [Language.javascript]: ["a/b@1.2.3"],
      [Language.python]: ["c/d@1.2.3"],
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

function doInvalidInputTest(
  testName: string,
  inputFileContents: string,
  expectedErrorMessageGenerator: (configFile: string) => string
) {
  test(`load invalid input - ${testName}`, async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
      const codeQL = setCodeQL({
        async resolveQueries() {
          return {
            byLanguage: {},
            noDeclaredLanguage: {},
            multipleDeclaredLanguages: {},
          };
        },
      });

      const languages = "javascript";
      const configFile = "input";
      const inputFile = path.join(tmpDir, configFile);
      fs.writeFileSync(inputFile, inputFileContents, "utf8");

      try {
        await configUtils.initConfig(
          languages,
          undefined,
          undefined,
          configFile,
          undefined,
          false,
          "",
          "",
          { owner: "github", repo: "example " },
          tmpDir,
          tmpDir,
          codeQL,
          tmpDir,
          gitHubVersion,
          sampleApiDetails,
          createFeatureFlags([]),
          getRunnerLogger(true)
        );
        throw new Error("initConfig did not throw error");
      } catch (err) {
        t.deepEqual(err, new Error(expectedErrorMessageGenerator(inputFile)));
      }
    });
  });
}

doInvalidInputTest(
  "name invalid type",
  `
  name:
    - foo: bar`,
  configUtils.getNameInvalid
);

doInvalidInputTest(
  "disable-default-queries invalid type",
  `disable-default-queries: 42`,
  configUtils.getDisableDefaultQueriesInvalid
);

doInvalidInputTest(
  "queries invalid type",
  `queries: foo`,
  configUtils.getQueriesInvalid
);

doInvalidInputTest(
  "paths-ignore invalid type",
  `paths-ignore: bar`,
  configUtils.getPathsIgnoreInvalid
);

doInvalidInputTest(
  "paths invalid type",
  `paths: 17`,
  configUtils.getPathsInvalid
);

doInvalidInputTest(
  "queries uses invalid type",
  `
  queries:
  - uses:
      - hello: world`,
  configUtils.getQueryUsesInvalid
);

function doInvalidQueryUsesTest(
  input: string,
  expectedErrorMessageGenerator: (configFile: string) => string
) {
  // Invalid contents of a "queries.uses" field.
  // Should fail with the expected error message
  const inputFileContents = `
    name: my config
    queries:
      - name: foo
        uses: ${input}`;

  doInvalidInputTest(
    `queries uses "${input}"`,
    inputFileContents,
    expectedErrorMessageGenerator
  );
}

// Various "uses" fields, and the errors they should produce
doInvalidQueryUsesTest("''", (c) =>
  configUtils.getQueryUsesInvalid(c, undefined)
);
doInvalidQueryUsesTest("foo/bar", (c) =>
  configUtils.getQueryUsesInvalid(c, "foo/bar")
);
doInvalidQueryUsesTest("foo/bar@v1@v2", (c) =>
  configUtils.getQueryUsesInvalid(c, "foo/bar@v1@v2")
);
doInvalidQueryUsesTest("foo@master", (c) =>
  configUtils.getQueryUsesInvalid(c, "foo@master")
);
doInvalidQueryUsesTest("https://github.com/foo/bar@master", (c) =>
  configUtils.getQueryUsesInvalid(c, "https://github.com/foo/bar@master")
);
doInvalidQueryUsesTest("./foo", (c) =>
  configUtils.getLocalPathDoesNotExist(c, "foo")
);
doInvalidQueryUsesTest("./..", (c) =>
  configUtils.getLocalPathOutsideOfRepository(c, "..")
);

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
test("path validations", (t) => {
  // Dummy values to pass to validateAndSanitisePath
  const propertyName = "paths";
  const configFile = "./.github/codeql/config.yml";

  for (const validPath of validPaths) {
    t.truthy(
      configUtils.validateAndSanitisePath(
        validPath,
        propertyName,
        configFile,
        getRunnerLogger(true)
      )
    );
  }
  for (const invalidPath of invalidPaths) {
    t.throws(() =>
      configUtils.validateAndSanitisePath(
        invalidPath,
        propertyName,
        configFile,
        getRunnerLogger(true)
      )
    );
  }
});

test("path sanitisation", (t) => {
  // Dummy values to pass to validateAndSanitisePath
  const propertyName = "paths";
  const configFile = "./.github/codeql/config.yml";

  // Valid paths are not modified
  t.deepEqual(
    configUtils.validateAndSanitisePath(
      "foo/bar",
      propertyName,
      configFile,
      getRunnerLogger(true)
    ),
    "foo/bar"
  );

  // Trailing stars are stripped
  t.deepEqual(
    configUtils.validateAndSanitisePath(
      "foo/**",
      propertyName,
      configFile,
      getRunnerLogger(true)
    ),
    "foo/"
  );
});

/**
 * Test macro for ensuring the packs block is valid
 */
const parsePacksMacro = test.macro({
  exec: (
    t: ExecutionContext<unknown>,
    packsByLanguage: string[] | Record<string, string[]>,
    languages: Language[],
    expected: Partial<Record<Language, string[]>>
  ) =>
    t.deepEqual(
      configUtils.parsePacksFromConfig(
        packsByLanguage,
        languages,
        "/a/b",
        mockLogger
      ),
      expected
    ),

  title: (providedTitle = "") => `Parse Packs: ${providedTitle}`,
});

/**
 * Test macro for testing when the packs block is invalid
 */
const parsePacksErrorMacro = test.macro({
  exec: (
    t: ExecutionContext<unknown>,
    packsByLanguage: unknown,
    languages: Language[],
    expected: RegExp
  ) =>
    t.throws(
      () =>
        configUtils.parsePacksFromConfig(
          packsByLanguage as string[] | Record<string, string[]>,
          languages,
          "/a/b",
          {} as Logger
        ),
      {
        message: expected,
      }
    ),
  title: (providedTitle = "") => `Parse Packs Error: ${providedTitle}`,
});

/**
 * Test macro for testing when the packs block is invalid
 */
const invalidPackNameMacro = test.macro({
  exec: (t: ExecutionContext, name: string) =>
    parsePacksErrorMacro.exec(
      t,
      { [Language.cpp]: [name] },
      [Language.cpp],
      new RegExp(
        `The configuration file "/a/b" is invalid: property "packs" "${name}" is not a valid pack`
      )
    ),
  title: (_providedTitle: string | undefined, arg: string | undefined) =>
    `Invalid pack string: ${arg}`,
});

test("no packs", parsePacksMacro, {}, [], {});
test("two packs", parsePacksMacro, ["a/b", "c/d@1.2.3"], [Language.cpp], {
  [Language.cpp]: ["a/b", "c/d@1.2.3"],
});
test(
  "two packs with spaces",
  parsePacksMacro,
  [" a/b ", " c/d@1.2.3 "],
  [Language.cpp],
  {
    [Language.cpp]: ["a/b", "c/d@1.2.3"],
  }
);
test(
  "two packs with language",
  parsePacksMacro,
  {
    [Language.cpp]: ["a/b", "c/d@1.2.3"],
    [Language.java]: ["d/e", "f/g@1.2.3"],
  },
  [Language.cpp, Language.java, Language.csharp],
  {
    [Language.cpp]: ["a/b", "c/d@1.2.3"],
    [Language.java]: ["d/e", "f/g@1.2.3"],
  }
);

test(
  "two packs with unused language in config",
  parsePacksMacro,
  {
    [Language.cpp]: ["a/b", "c/d@1.2.3"],
    [Language.java]: ["d/e", "f/g@1.2.3"],
  },
  [Language.cpp, Language.csharp],
  {
    [Language.cpp]: ["a/b", "c/d@1.2.3"],
  }
);

test(
  "packs with other valid names",
  parsePacksMacro,
  [
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
  ],
  [Language.cpp],
  {
    [Language.cpp]: [
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
  }
);

test(
  "no language",
  parsePacksErrorMacro,
  ["a/b@1.2.3"],
  [Language.java, Language.python],
  /The configuration file "\/a\/b" is invalid: property "packs" must split packages by language/
);
test(
  "not an array",
  parsePacksErrorMacro,
  { [Language.cpp]: "c/d" },
  [Language.cpp],
  /The configuration file "\/a\/b" is invalid: property "packs" must be an array of non-empty strings/
);

test(invalidPackNameMacro, "c"); // all packs require at least a scope and a name
test(invalidPackNameMacro, "c-/d");
test(invalidPackNameMacro, "-c/d");
test(invalidPackNameMacro, "c/d_d");
test(invalidPackNameMacro, "c/d@@");
test(invalidPackNameMacro, "c/d@1.0.0:");
test(invalidPackNameMacro, "c/d:");
test(invalidPackNameMacro, "c/d:/a");
test(invalidPackNameMacro, "@1.0.0:a");
test(invalidPackNameMacro, "c/d@../a");
test(invalidPackNameMacro, "c/d@b/../a");
test(invalidPackNameMacro, "c/d:z@1");

/**
 * Test macro for testing the packs block and the packs input
 */
function parseInputAndConfigMacro(
  t: ExecutionContext<unknown>,
  packsFromConfig: string[] | Record<string, string[]>,
  packsFromInput: string | undefined,
  languages: Language[],
  expected
) {
  t.deepEqual(
    configUtils.parsePacks(
      packsFromConfig,
      packsFromInput,
      !!packsFromInput?.trim().startsWith("+"),
      languages,
      "/a/b",
      mockLogger
    ),
    expected
  );
}
parseInputAndConfigMacro.title = (providedTitle: string) =>
  `Parse Packs input and config: ${providedTitle}`;

const mockLogger = {
  info: (message: string) => {
    console.log(message);
  },
} as Logger;

function parseInputAndConfigErrorMacro(
  t: ExecutionContext<unknown>,
  packsFromConfig: string[] | Record<string, string[]>,
  packsFromInput: string | undefined,
  languages: Language[],
  packsFromInputOverride: boolean,
  expected: RegExp
) {
  t.throws(
    () => {
      configUtils.parsePacks(
        packsFromConfig,
        packsFromInput,
        packsFromInputOverride,
        languages,
        "/a/b",
        mockLogger
      );
    },
    {
      message: expected,
    }
  );
}
parseInputAndConfigErrorMacro.title = (providedTitle: string) =>
  `Parse Packs input and config Error: ${providedTitle}`;

test("input only", parseInputAndConfigMacro, {}, " c/d ", [Language.cpp], {
  [Language.cpp]: ["c/d"],
});

test(
  "input only with multiple",
  parseInputAndConfigMacro,
  {},
  "a/b , c/d@1.2.3",
  [Language.cpp],
  {
    [Language.cpp]: ["a/b", "c/d@1.2.3"],
  }
);

test(
  "input only with +",
  parseInputAndConfigMacro,
  {},
  "  +  a/b , c/d@1.2.3 ",
  [Language.cpp],
  {
    [Language.cpp]: ["a/b", "c/d@1.2.3"],
  }
);

test(
  "config only",
  parseInputAndConfigMacro,
  ["a/b", "c/d"],
  "  ",
  [Language.cpp],
  {
    [Language.cpp]: ["a/b", "c/d"],
  }
);

test(
  "input overrides",
  parseInputAndConfigMacro,
  ["a/b", "c/d"],
  " e/f, g/h@1.2.3 ",
  [Language.cpp],
  {
    [Language.cpp]: ["e/f", "g/h@1.2.3"],
  }
);

test(
  "input and config",
  parseInputAndConfigMacro,
  ["a/b", "c/d"],
  " +e/f, g/h@1.2.3 ",
  [Language.cpp],
  {
    [Language.cpp]: ["e/f", "g/h@1.2.3", "a/b", "c/d"],
  }
);

test(
  "input with no language",
  parseInputAndConfigErrorMacro,
  {},
  "c/d",
  [],
  false,
  /No languages specified/
);

test(
  "input with two languages",
  parseInputAndConfigErrorMacro,
  {},
  "c/d",
  [Language.cpp, Language.csharp],
  false,
  /multi-language analysis/
);

test(
  "input with + only",
  parseInputAndConfigErrorMacro,
  {},
  " + ",
  [Language.cpp],
  true,
  /remove the '\+'/
);

test(
  "input with invalid pack name",
  parseInputAndConfigErrorMacro,
  {},
  " xxx",
  [Language.cpp],
  false,
  /"xxx" is not a valid pack/
);

const mlPoweredQueriesMacro = test.macro({
  exec: async (
    t: ExecutionContext,
    codeQLVersion: string,
    isMlPoweredQueriesFlagEnabled: boolean,
    packsInput: string | undefined,
    queriesInput: string | undefined,
    expectedVersionString: string | undefined
  ) => {
    return await util.withTmpDir(async (tmpDir) => {
      const codeQL = setCodeQL({
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
      });

      const { packs } = await configUtils.initConfig(
        "javascript",
        queriesInput,
        packsInput,
        undefined,
        undefined,
        false,
        "",
        "",
        { owner: "github", repo: "example " },
        tmpDir,
        tmpDir,
        codeQL,
        tmpDir,
        gitHubVersion,
        sampleApiDetails,
        createFeatureFlags(
          isMlPoweredQueriesFlagEnabled
            ? [FeatureFlag.MlPoweredQueriesEnabled]
            : []
        ),
        getRunnerLogger(true)
      );
      if (expectedVersionString !== undefined) {
        t.deepEqual(packs as unknown, {
          [Language.javascript]: [
            `codeql/javascript-experimental-atm-queries@${expectedVersionString}`,
          ],
        });
      } else {
        t.deepEqual(packs as unknown, {});
      }
    });
  },
  title: (
    _providedTitle: string | undefined,
    codeQLVersion: string,
    isMlPoweredQueriesFlagEnabled: boolean,
    packsInput: string | undefined,
    queriesInput: string | undefined,
    expectedVersionString: string | undefined
  ) =>
    `ML-powered queries ${
      expectedVersionString !== undefined
        ? `${expectedVersionString} are`
        : "aren't"
    } loaded for packs: ${packsInput}, queries: ${queriesInput} using CLI v${codeQLVersion} when feature flag is ${
      isMlPoweredQueriesFlagEnabled ? "enabled" : "disabled"
    }`,
});

// macro, codeQLVersion, isMlPoweredQueriesFlagEnabled, packsInput, queriesInput, expectedVersionString
// Test that ML-powered queries aren't run on v2.7.4 of the CLI.
test(
  mlPoweredQueriesMacro,
  "2.7.4",
  true,
  undefined,
  "security-extended",
  undefined
);
// Test that ML-powered queries aren't run when the feature flag is off.
test(
  mlPoweredQueriesMacro,
  "2.7.5",
  false,
  undefined,
  "security-extended",
  undefined
);
// Test that the ~0.1.0 version of ML-powered queries is run on v2.8.3 of the CLI.
test(
  mlPoweredQueriesMacro,
  "2.8.3",
  true,
  undefined,
  "security-extended",
  process.platform === "win32" ? undefined : "~0.1.0"
);
// Test that ML-powered queries aren't run when the user hasn't specified that we should run the
// `security-extended` or `security-and-quality` query suite.
test(mlPoweredQueriesMacro, "2.7.5", true, undefined, undefined, undefined);
// Test that ML-powered queries are run on non-Windows platforms running `security-extended` on
// versions of the CodeQL CLI prior to 2.9.0.
test(
  mlPoweredQueriesMacro,
  "2.8.5",
  true,
  undefined,
  "security-extended",
  process.platform === "win32" ? undefined : "~0.2.0"
);
// Test that ML-powered queries are run on non-Windows platforms running `security-and-quality` on
// versions of the CodeQL CLI prior to 2.9.0.
test(
  mlPoweredQueriesMacro,
  "2.8.5",
  true,
  undefined,
  "security-and-quality",
  process.platform === "win32" ? undefined : "~0.2.0"
);
// Test that ML-powered queries are run on all platforms running `security-extended` on CodeQL CLI
// 2.9.0+.
test(
  mlPoweredQueriesMacro,
  "2.9.0",
  true,
  undefined,
  "security-extended",
  "~0.2.0"
);
// Test that ML-powered queries are run on all platforms running `security-and-quality` on CodeQL
// CLI 2.9.0+.
test(
  mlPoweredQueriesMacro,
  "2.9.0",
  true,
  undefined,
  "security-and-quality",
  "~0.2.0"
);
// Test that we don't inject an ML-powered query pack if the user has already specified one.
test(
  mlPoweredQueriesMacro,
  "2.9.0",
  true,
  "codeql/javascript-experimental-atm-queries@0.0.1",
  "security-and-quality",
  "0.0.1"
);
// Test that ML-powered queries are run on all platforms running `security-extended` on CodeQL
// CLI 2.9.3+.
test(
  mlPoweredQueriesMacro,
  "2.9.3",
  true,
  undefined,
  "security-extended",
  "~0.3.0"
);
// Test that ML-powered queries are run on all platforms running `security-and-quality` on CodeQL
// CLI 2.9.3+.
test(
  mlPoweredQueriesMacro,
  "2.9.3",
  true,
  undefined,
  "security-and-quality",
  "~0.3.0"
);

const calculateAugmentationMacro = test.macro({
  exec: async (
    t: ExecutionContext,
    _title: string,
    rawPacksInput: string | undefined,
    rawQueriesInput: string | undefined,
    languages: Language[],
    expectedAugmentationProperties: configUtils.AugmentationProperties
  ) => {
    const actualAugmentationProperties = configUtils.calculateAugmentation(
      rawPacksInput,
      rawQueriesInput,
      languages
    );
    t.deepEqual(actualAugmentationProperties, expectedAugmentationProperties);
  },
  title: (_, title) => `Calculate Augmentation: ${title}`,
});

test(
  calculateAugmentationMacro,
  "All empty",
  undefined,
  undefined,
  [Language.javascript],
  {
    queriesInputCombines: false,
    queriesInput: undefined,
    packsInputCombines: false,
    packsInput: undefined,
    injectedMlQueries: false,
  } as configUtils.AugmentationProperties
);

test(
  calculateAugmentationMacro,
  "With queries",
  undefined,
  " a, b , c, d",
  [Language.javascript],
  {
    queriesInputCombines: false,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
    packsInputCombines: false,
    packsInput: undefined,
    injectedMlQueries: false,
  } as configUtils.AugmentationProperties
);

test(
  calculateAugmentationMacro,
  "With queries combining",
  undefined,
  "   +   a, b , c, d ",
  [Language.javascript],
  {
    queriesInputCombines: true,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
    packsInputCombines: false,
    packsInput: undefined,
    injectedMlQueries: false,
  } as configUtils.AugmentationProperties
);

test(
  calculateAugmentationMacro,
  "With packs",
  "   codeql/a , codeql/b   , codeql/c  , codeql/d  ",
  undefined,
  [Language.javascript],
  {
    queriesInputCombines: false,
    queriesInput: undefined,
    packsInputCombines: false,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
    injectedMlQueries: false,
  } as configUtils.AugmentationProperties
);

test(
  calculateAugmentationMacro,
  "With packs combining",
  "   +   codeql/a, codeql/b, codeql/c, codeql/d",
  undefined,
  [Language.javascript],
  {
    queriesInputCombines: false,
    queriesInput: undefined,
    packsInputCombines: true,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
    injectedMlQueries: false,
  } as configUtils.AugmentationProperties
);

const calculateAugmentationErrorMacro = test.macro({
  exec: async (
    t: ExecutionContext,
    _title: string,
    rawPacksInput: string | undefined,
    rawQueriesInput: string | undefined,
    languages: Language[],
    expectedError: RegExp | string
  ) => {
    t.throws(
      () =>
        configUtils.calculateAugmentation(
          rawPacksInput,
          rawQueriesInput,
          languages
        ),
      { message: expectedError }
    );
  },
  title: (_, title) => `Calculate Augmentation Error: ${title}`,
});

test(
  calculateAugmentationErrorMacro,
  "Plus (+) with nothing else (queries)",
  undefined,
  "   +   ",
  [Language.javascript],
  /The workflow property "queries" is invalid/
);

test(
  calculateAugmentationErrorMacro,
  "Plus (+) with nothing else (packs)",
  "   +   ",
  undefined,
  [Language.javascript],
  /The workflow property "packs" is invalid/
);

test(
  calculateAugmentationErrorMacro,
  "Packs input with multiple languages",
  "   +  a/b, c/d ",
  undefined,
  [Language.javascript, Language.java],
  /Cannot specify a 'packs' input in a multi-language analysis/
);

test(
  calculateAugmentationErrorMacro,
  "Packs input with no languages",
  "   +  a/b, c/d ",
  undefined,
  [],
  /No languages specified/
);

test(
  calculateAugmentationErrorMacro,
  "Invalid packs",
  " a-pack-without-a-scope ",
  undefined,
  [Language.javascript],
  /"a-pack-without-a-scope" is not a valid pack/
);
