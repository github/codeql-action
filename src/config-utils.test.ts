import * as fs from "fs";
import * as path from "path";

import * as github from "@actions/github";
import test, { ExecutionContext } from "ava";
import * as yaml from "js-yaml";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { AnalysisKind } from "./analyses";
import * as api from "./api-client";
import { CachingKind } from "./caching-utils";
import { createStubCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { Feature } from "./feature-flags";
import * as gitUtils from "./git-utils";
import { KnownLanguage, Language } from "./languages";
import { getRunnerLogger } from "./logging";
import {
  CODEQL_OVERLAY_MINIMUM_VERSION,
  OverlayDatabaseMode,
} from "./overlay-database-utils";
import { parseRepositoryNwo } from "./repository";
import {
  setupTests,
  mockLanguagesInRepo as mockLanguagesInRepo,
  createFeatures,
  getRecordingLogger,
  LoggedMessage,
  mockCodeQLVersion,
} from "./testing-utils";
import {
  GitHubVariant,
  GitHubVersion,
  prettyPrintPack,
  ConfigurationError,
  withTmpDir,
  BuildMode,
} from "./util";

setupTests(test);

const githubVersion = { type: GitHubVariant.DOTCOM } as GitHubVersion;

function createTestInitConfigInputs(
  overrides: Partial<configUtils.InitConfigInputs>,
): configUtils.InitConfigInputs {
  return Object.assign(
    {},
    {
      analysisKindsInput: "code-scanning",
      languagesInput: undefined,
      queriesInput: undefined,
      qualityQueriesInput: undefined,
      packsInput: undefined,
      configFile: undefined,
      dbLocation: undefined,
      configInput: undefined,
      buildModeInput: undefined,
      trapCachingEnabled: false,
      dependencyCachingEnabled: CachingKind.None,
      debugMode: false,
      debugArtifactName: "",
      debugDatabaseName: "",
      repository: { owner: "github", repo: "example" },
      tempDir: "",
      codeql: createStubCodeQL({
        async betterResolveLanguages() {
          return {
            extractors: {
              html: [{ extractor_root: "" }],
              javascript: [{ extractor_root: "" }],
            },
          };
        },
      }),
      workspacePath: "",
      sourceRoot: "",
      githubVersion,
      apiDetails: {
        auth: "token",
        externalRepoAuth: "token",
        url: "https://github.example.com",
        apiURL: undefined,
        registriesAuthTokens: undefined,
      },
      features: createFeatures([]),
      logger: getRunnerLogger(true),
    },
    overrides,
  );
}

// Returns the filepath of the newly-created file
function createConfigFile(inputFileContents: string, tmpDir: string): string {
  const configFilePath = path.join(tmpDir, "input");
  fs.writeFileSync(configFilePath, inputFileContents, "utf8");
  return configFilePath;
}

type GetContentsResponse = { content?: string } | object[];

function mockGetContents(
  content: GetContentsResponse,
): sinon.SinonStub<any, any> {
  // Passing an auth token is required, so we just use a dummy value
  const client = github.getOctokit("123");
  const response = {
    data: content,
  };
  const spyGetContents = sinon
    .stub(client.rest.repos, "getContent")
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    .resolves(response as any);
  sinon.stub(api, "getApiClient").value(() => client);
  sinon.stub(api, "getApiClientWithExternalAuth").value(() => client);
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  sinon.stub(client.rest.repos, "listLanguages").resolves(response as any);
  sinon.stub(api, "getApiClient").value(() => client);
}

test("load empty config", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const logger = getRunnerLogger(true);
    const languages = "javascript,python";

    const codeql = createStubCodeQL({
      async betterResolveLanguages() {
        return {
          extractors: {
            javascript: [{ extractor_root: "" }],
            python: [{ extractor_root: "" }],
          },
        };
      },
    });

    const config = await configUtils.initConfig(
      createTestInitConfigInputs({
        languagesInput: languages,
        repository: { owner: "github", repo: "example" },
        tempDir,
        codeql,
        logger,
      }),
    );

    const expectedConfig = await configUtils.initActionState(
      createTestInitConfigInputs({
        languagesInput: languages,
        tempDir,
        codeql,
        logger,
      }),
      {},
    );

    t.deepEqual(config, expectedConfig);
  });
});

test("load code quality config", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const logger = getRunnerLogger(true);
    const languages = "actions";

    const codeql = createStubCodeQL({
      async betterResolveLanguages() {
        return {
          extractors: {
            actions: [{ extractor_root: "" }],
          },
        };
      },
    });

    const config = await configUtils.initConfig(
      createTestInitConfigInputs({
        analysisKindsInput: "code-quality",
        languagesInput: languages,
        repository: { owner: "github", repo: "example" },
        tempDir,
        codeql,
        logger,
      }),
    );

    // And the config we expect it to result in
    const expectedConfig: configUtils.Config = {
      version: actionsUtil.getActionVersion(),
      analysisKinds: [AnalysisKind.CodeQuality],
      languages: [KnownLanguage.actions],
      buildMode: undefined,
      originalUserInput: {},
      // This gets set because we only have `AnalysisKind.CodeQuality`
      computedConfig: {
        "disable-default-queries": true,
        queries: [{ uses: "code-quality" }],
        "query-filters": [],
      },
      tempDir,
      codeQLCmd: codeql.getPath(),
      gitHubVersion: githubVersion,
      dbLocation: path.resolve(tempDir, "codeql_databases"),
      debugMode: false,
      debugArtifactName: "",
      debugDatabaseName: "",
      trapCaches: {},
      trapCacheDownloadTime: 0,
      dependencyCachingEnabled: CachingKind.None,
      extraQueryExclusions: [],
      overlayDatabaseMode: OverlayDatabaseMode.None,
      useOverlayDatabaseCaching: false,
    };

    t.deepEqual(config, expectedConfig);
  });
});

test("loading config saves config", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const logger = getRunnerLogger(true);

    const codeql = createStubCodeQL({
      async betterResolveLanguages() {
        return {
          extractors: {
            javascript: [{ extractor_root: "" }],
            python: [{ extractor_root: "" }],
          },
        };
      },
    });

    // Sanity check the saved config file does not already exist
    t.false(fs.existsSync(configUtils.getPathToParsedConfigFile(tempDir)));

    // Sanity check that getConfig returns undefined before we have called initConfig
    t.deepEqual(await configUtils.getConfig(tempDir, logger), undefined);

    const config1 = await configUtils.initConfig(
      createTestInitConfigInputs({
        languagesInput: "javascript,python",
        tempDir,
        codeql,
        workspacePath: tempDir,
        logger,
      }),
    );

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

test("loading config with version mismatch throws", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const logger = getRunnerLogger(true);

    const codeql = createStubCodeQL({
      async betterResolveLanguages() {
        return {
          extractors: {
            javascript: [{ extractor_root: "" }],
            python: [{ extractor_root: "" }],
          },
        };
      },
    });

    // Sanity check the saved config file does not already exist
    t.false(fs.existsSync(configUtils.getPathToParsedConfigFile(tempDir)));

    // Sanity check that getConfig returns undefined before we have called initConfig
    t.deepEqual(await configUtils.getConfig(tempDir, logger), undefined);

    // Stub `getActionVersion` to return some nonsense.
    const getActionVersionStub = sinon
      .stub(actionsUtil, "getActionVersion")
      .returns("does-not-exist");

    await configUtils.initConfig(
      createTestInitConfigInputs({
        languagesInput: "javascript,python",
        tempDir,
        codeql,
        workspacePath: tempDir,
        logger,
      }),
    );

    // Restore `getActionVersion`.
    getActionVersionStub.restore();

    // The saved config file should now exist
    t.true(fs.existsSync(configUtils.getPathToParsedConfigFile(tempDir)));

    // Trying to read the configuration should now throw an error.
    await t.throwsAsync(configUtils.getConfig(tempDir, logger), {
      instanceOf: ConfigurationError,
    });
  });
});

test("load input outside of workspace", async (t) => {
  return await withTmpDir(async (tempDir) => {
    try {
      await configUtils.initConfig(
        createTestInitConfigInputs({
          configFile: "../input",
          tempDir,
          workspacePath: tempDir,
        }),
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new ConfigurationError(
          configUtils.getConfigFileOutsideWorkspaceErrorMessage(
            path.join(tempDir, "../input"),
          ),
        ),
      );
    }
  });
});

test("load non-local input with invalid repo syntax", async (t) => {
  return await withTmpDir(async (tempDir) => {
    // no filename given, just a repo
    const configFile = "octo-org/codeql-config@main";

    try {
      await configUtils.initConfig(
        createTestInitConfigInputs({
          configFile,
          tempDir,
          workspacePath: tempDir,
        }),
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new ConfigurationError(
          configUtils.getConfigFileRepoFormatInvalidMessage(
            "octo-org/codeql-config@main",
          ),
        ),
      );
    }
  });
});

test("load non-existent input", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const languagesInput = "javascript";
    const configFile = "input";
    t.false(fs.existsSync(path.join(tempDir, configFile)));

    try {
      await configUtils.initConfig(
        createTestInitConfigInputs({
          languagesInput,
          configFile,
          tempDir,
          workspacePath: tempDir,
        }),
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new ConfigurationError(
          configUtils.getConfigFileDoesNotExistErrorMessage(
            path.join(tempDir, "input"),
          ),
        ),
      );
    }
  });
});

test("load non-empty input", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const codeql = createStubCodeQL({
      async betterResolveLanguages() {
        return {
          extractors: {
            javascript: [{ extractor_root: "" }],
          },
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

    fs.mkdirSync(path.join(tempDir, "foo"));

    const userConfig: configUtils.UserConfig = {
      name: "my config",
      "disable-default-queries": true,
      queries: [{ uses: "./foo" }],
      "paths-ignore": ["a", "b"],
      paths: ["c/d"],
    };

    // And the config we expect it to parse to
    const expectedConfig: configUtils.Config = {
      version: actionsUtil.getActionVersion(),
      analysisKinds: [AnalysisKind.CodeScanning],
      languages: [KnownLanguage.javascript],
      buildMode: BuildMode.None,
      originalUserInput: userConfig,
      computedConfig: userConfig,
      tempDir,
      codeQLCmd: codeql.getPath(),
      gitHubVersion: githubVersion,
      dbLocation: path.resolve(tempDir, "codeql_databases"),
      debugMode: false,
      debugArtifactName: "my-artifact",
      debugDatabaseName: "my-db",
      trapCaches: {},
      trapCacheDownloadTime: 0,
      dependencyCachingEnabled: CachingKind.None,
      extraQueryExclusions: [],
      overlayDatabaseMode: OverlayDatabaseMode.None,
      useOverlayDatabaseCaching: false,
    };

    const languagesInput = "javascript";
    const configFilePath = createConfigFile(inputFileContents, tempDir);

    const actualConfig = await configUtils.initConfig(
      createTestInitConfigInputs({
        languagesInput,
        buildModeInput: "none",
        configFile: configFilePath,
        debugArtifactName: "my-artifact",
        debugDatabaseName: "my-db",
        tempDir,
        codeql,
        workspacePath: tempDir,
      }),
    );

    // Should exactly equal the object we constructed earlier
    t.deepEqual(actualConfig, expectedConfig);
  });
});

test("Using config input and file together, config input should be used.", async (t) => {
  return await withTmpDir(async (tempDir) => {
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

    const codeql = createStubCodeQL({
      async betterResolveLanguages() {
        return {
          extractors: {
            javascript: [{ extractor_root: "" }],
            python: [{ extractor_root: "" }],
          },
        };
      },
    });

    // Only JS, python packs will be ignored
    const languagesInput = "javascript";

    const config = await configUtils.initConfig(
      createTestInitConfigInputs({
        languagesInput,
        configFile: configFilePath,
        configInput,
        tempDir,
        codeql,
        workspacePath: tempDir,
      }),
    );

    t.deepEqual(config.originalUserInput, yaml.load(configInput));
  });
});

test("API client used when reading remote config", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const codeql = createStubCodeQL({
      async betterResolveLanguages() {
        return {
          extractors: {
            javascript: [{ extractor_root: "" }],
          },
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
    fs.mkdirSync(path.join(tempDir, "foo/bar/dev"), { recursive: true });

    const configFile = "octo-org/codeql-config/config.yaml@main";
    const languagesInput = "javascript";

    await configUtils.initConfig(
      createTestInitConfigInputs({
        languagesInput,
        configFile,
        tempDir,
        codeql,
        workspacePath: tempDir,
      }),
    );
    t.assert(spyGetContents.called);
  });
});

test("Remote config handles the case where a directory is provided", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const dummyResponse = []; // directories are returned as arrays
    mockGetContents(dummyResponse);

    const repoReference = "octo-org/codeql-config/config.yaml@main";
    try {
      await configUtils.initConfig(
        createTestInitConfigInputs({
          configFile: repoReference,
          tempDir,
          workspacePath: tempDir,
        }),
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new ConfigurationError(
          configUtils.getConfigFileDirectoryGivenMessage(repoReference),
        ),
      );
    }
  });
});

test("Invalid format of remote config handled correctly", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const dummyResponse = {
      // note no "content" property here
    };
    mockGetContents(dummyResponse);

    const repoReference = "octo-org/codeql-config/config.yaml@main";
    try {
      await configUtils.initConfig(
        createTestInitConfigInputs({
          configFile: repoReference,
          tempDir,
          workspacePath: tempDir,
        }),
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new ConfigurationError(
          configUtils.getConfigFileFormatInvalidMessage(repoReference),
        ),
      );
    }
  });
});

test("No detected languages", async (t) => {
  return await withTmpDir(async (tempDir) => {
    mockListLanguages([]);
    const codeql = createStubCodeQL({
      async resolveLanguages() {
        return {};
      },
    });

    try {
      await configUtils.initConfig(
        createTestInitConfigInputs({
          tempDir,
          codeql,
          workspacePath: tempDir,
        }),
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new ConfigurationError(configUtils.getNoLanguagesError()),
      );
    }
  });
});

test("Unknown languages", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const languagesInput = "rubbish,english";

    try {
      await configUtils.initConfig(
        createTestInitConfigInputs({
          languagesInput,
          tempDir,
          workspacePath: tempDir,
        }),
      );
      throw new Error("initConfig did not throw error");
    } catch (err) {
      t.deepEqual(
        err,
        new ConfigurationError(
          configUtils.getUnknownLanguagesError(["rubbish", "english"]),
        ),
      );
    }
  });
});

/**
 * Test macro for ensuring the packs block is valid
 */
const parsePacksMacro = test.macro({
  exec: (
    t: ExecutionContext<unknown>,
    packsInput: string,
    languages: Language[],
    expected: configUtils.Packs | undefined,
  ) =>
    t.deepEqual(
      configUtils.parsePacksFromInput(packsInput, languages, false),
      expected,
    ),

  title: (providedTitle = "") => `Parse Packs: ${providedTitle}`,
});

/**
 * Test macro for testing when the packs block is invalid
 */
const parsePacksErrorMacro = test.macro({
  exec: (
    t: ExecutionContext<unknown>,
    packsInput: string,
    languages: Language[],
    expected: RegExp,
  ) =>
    t.throws(
      () => configUtils.parsePacksFromInput(packsInput, languages, false),
      {
        message: expected,
      },
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
      name,
      [KnownLanguage.cpp],
      new RegExp(`^"${name}" is not a valid pack$`),
    ),
  title: (_providedTitle: string | undefined, arg: string | undefined) =>
    `Invalid pack string: ${arg}`,
});

test("no packs", parsePacksMacro, "", [], undefined);
test("two packs", parsePacksMacro, "a/b,c/d@1.2.3", [KnownLanguage.cpp], {
  [KnownLanguage.cpp]: ["a/b", "c/d@1.2.3"],
});
test(
  "two packs with spaces",
  parsePacksMacro,
  " a/b , c/d@1.2.3 ",
  [KnownLanguage.cpp],
  {
    [KnownLanguage.cpp]: ["a/b", "c/d@1.2.3"],
  },
);
test(
  "two packs with language",
  parsePacksErrorMacro,
  "a/b,c/d@1.2.3",
  [KnownLanguage.cpp, KnownLanguage.java],
  new RegExp(
    "Cannot specify a 'packs' input in a multi-language analysis. " +
      "Use a codeql-config.yml file instead and specify packs by language.",
  ),
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
  ].join(","),
  [KnownLanguage.cpp],
  {
    [KnownLanguage.cpp]: [
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
  },
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
 * Test macro for pretty printing pack specs
 */
const packSpecPrettyPrintingMacro = test.macro({
  exec: (t: ExecutionContext, packStr: string, packObj: configUtils.Pack) => {
    const parsed = configUtils.parsePacksSpecification(packStr);
    t.deepEqual(parsed, packObj, "parsed pack spec is correct");
    const stringified = prettyPrintPack(packObj);
    t.deepEqual(
      stringified,
      packStr.trim(),
      "pretty-printed pack spec is correct",
    );

    t.deepEqual(
      configUtils.validatePackSpecification(packStr),
      packStr.trim(),
      "pack spec is valid",
    );
  },
  title: (
    _providedTitle: string | undefined,
    packStr: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _packObj: configUtils.Pack,
  ) => `Prettyprint pack spec: '${packStr}'`,
});

test(packSpecPrettyPrintingMacro, "a/b", {
  name: "a/b",
  version: undefined,
  path: undefined,
});
test(packSpecPrettyPrintingMacro, "a/b@~1.2.3", {
  name: "a/b",
  version: "~1.2.3",
  path: undefined,
});
test(packSpecPrettyPrintingMacro, "a/b@~1.2.3:abc/def", {
  name: "a/b",
  version: "~1.2.3",
  path: "abc/def",
});
test(packSpecPrettyPrintingMacro, "a/b:abc/def", {
  name: "a/b",
  version: undefined,
  path: "abc/def",
});
test(packSpecPrettyPrintingMacro, "    a/b:abc/def    ", {
  name: "a/b",
  version: undefined,
  path: "abc/def",
});

const mockLogger = getRunnerLogger(true);

const calculateAugmentationMacro = test.macro({
  exec: async (
    t: ExecutionContext,
    _title: string,
    rawPacksInput: string | undefined,
    rawQueriesInput: string | undefined,
    languages: Language[],
    expectedAugmentationProperties: configUtils.AugmentationProperties,
  ) => {
    const actualAugmentationProperties =
      await configUtils.calculateAugmentation(
        rawPacksInput,
        rawQueriesInput,
        languages,
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
  [KnownLanguage.javascript],
  {
    ...configUtils.defaultAugmentationProperties,
  },
);

test(
  calculateAugmentationMacro,
  "With queries",
  undefined,
  " a, b , c, d",
  [KnownLanguage.javascript],
  {
    ...configUtils.defaultAugmentationProperties,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
  },
);

test(
  calculateAugmentationMacro,
  "With queries combining",
  undefined,
  "   +   a, b , c, d ",
  [KnownLanguage.javascript],
  {
    ...configUtils.defaultAugmentationProperties,
    queriesInputCombines: true,
    queriesInput: [{ uses: "a" }, { uses: "b" }, { uses: "c" }, { uses: "d" }],
  },
);

test(
  calculateAugmentationMacro,
  "With packs",
  "   codeql/a , codeql/b   , codeql/c  , codeql/d  ",
  undefined,
  [KnownLanguage.javascript],
  {
    ...configUtils.defaultAugmentationProperties,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
  },
);

test(
  calculateAugmentationMacro,
  "With packs combining",
  "   +   codeql/a, codeql/b, codeql/c, codeql/d",
  undefined,
  [KnownLanguage.javascript],
  {
    ...configUtils.defaultAugmentationProperties,
    packsInputCombines: true,
    packsInput: ["codeql/a", "codeql/b", "codeql/c", "codeql/d"],
  },
);

const calculateAugmentationErrorMacro = test.macro({
  exec: async (
    t: ExecutionContext,
    _title: string,
    rawPacksInput: string | undefined,
    rawQueriesInput: string | undefined,
    languages: Language[],
    expectedError: RegExp | string,
  ) => {
    await t.throwsAsync(
      () =>
        configUtils.calculateAugmentation(
          rawPacksInput,
          rawQueriesInput,
          languages,
        ),
      { message: expectedError },
    );
  },
  title: (_, title) => `Calculate Augmentation Error: ${title}`,
});

test(
  calculateAugmentationErrorMacro,
  "Plus (+) with nothing else (queries)",
  undefined,
  "   +   ",
  [KnownLanguage.javascript],
  /The workflow property "queries" is invalid/,
);

test(
  calculateAugmentationErrorMacro,
  "Plus (+) with nothing else (packs)",
  "   +   ",
  undefined,
  [KnownLanguage.javascript],
  /The workflow property "packs" is invalid/,
);

test(
  calculateAugmentationErrorMacro,
  "Packs input with multiple languages",
  "   +  a/b, c/d ",
  undefined,
  [KnownLanguage.javascript, KnownLanguage.java],
  /Cannot specify a 'packs' input in a multi-language analysis/,
);

test(
  calculateAugmentationErrorMacro,
  "Packs input with no languages",
  "   +  a/b, c/d ",
  undefined,
  [],
  /No languages specified/,
);

test(
  calculateAugmentationErrorMacro,
  "Invalid packs",
  " a-pack-without-a-scope ",
  undefined,
  [KnownLanguage.javascript],
  /"a-pack-without-a-scope" is not a valid pack/,
);

test("no generateRegistries when registries is undefined", async (t) => {
  return await withTmpDir(async (tmpDir) => {
    const registriesInput = undefined;
    const logger = getRunnerLogger(true);
    const { registriesAuthTokens, qlconfigFile } =
      await configUtils.generateRegistries(registriesInput, tmpDir, logger);

    t.is(registriesAuthTokens, undefined);
    t.is(qlconfigFile, undefined);
  });
});

test("generateRegistries prefers original CODEQL_REGISTRIES_AUTH", async (t) => {
  return await withTmpDir(async (tmpDir) => {
    process.env.CODEQL_REGISTRIES_AUTH = "original";
    const registriesInput = yaml.dump([
      {
        url: "http://ghcr.io",
        packages: ["codeql/*", "codeql-testing/*"],
        token: "not-a-token",
      },
    ]);
    const logger = getRunnerLogger(true);
    const { registriesAuthTokens, qlconfigFile } =
      await configUtils.generateRegistries(registriesInput, tmpDir, logger);

    t.is(registriesAuthTokens, "original");
    t.is(qlconfigFile, path.join(tmpDir, "qlconfig.yml"));
  });
});

// getLanguages

const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
// eslint-disable-next-line github/array-foreach
[
  {
    name: "languages from input",
    languagesInput: "jAvAscript, \n jaVa",
    languagesInRepository: ["SwiFt", "other"],
    expectedLanguages: ["javascript", "java"],
    expectedApiCall: false,
  },
  {
    name: "languages from github api",
    languagesInput: "",
    languagesInRepository: ["  jAvAscript\n \t", " jaVa", "SwiFt", "other"],
    expectedLanguages: ["javascript", "java"],
    expectedApiCall: true,
  },
  {
    name: "aliases from input",
    languagesInput: "  typEscript\n \t, C#, c , KoTlin",
    languagesInRepository: ["SwiFt", "other"],
    expectedLanguages: ["javascript", "csharp", "cpp", "java"],
    expectedApiCall: false,
  },
  {
    name: "duplicate languages from input",
    languagesInput: "jAvAscript, \n jaVa, kotlin, typescript",
    languagesInRepository: ["SwiFt", "other"],
    expectedLanguages: ["javascript", "java"],
    expectedApiCall: false,
  },
  {
    name: "aliases from github api",
    languagesInput: "",
    languagesInRepository: ["  typEscript\n \t", " C#", "c", "other"],
    expectedLanguages: ["javascript", "csharp", "cpp"],
    expectedApiCall: true,
  },
  {
    name: "no languages",
    languagesInput: "",
    languagesInRepository: [],
    expectedApiCall: true,
    expectedError: configUtils.getNoLanguagesError(),
  },
  {
    name: "unrecognized languages from input",
    languagesInput: "a, b, c, javascript",
    languagesInRepository: [],
    expectedApiCall: false,
    expectedError: configUtils.getUnknownLanguagesError(["a", "b"]),
  },
  {
    name: "extractors that aren't languages aren't included (specified)",
    languagesInput: "html",
    languagesInRepository: [],
    expectedApiCall: false,
    expectedError: configUtils.getUnknownLanguagesError(["html"]),
  },
  {
    name: "extractors that aren't languages aren't included (autodetected)",
    languagesInput: "",
    languagesInRepository: ["html", "javascript"],
    expectedApiCall: true,
    expectedLanguages: ["javascript"],
  },
].forEach((args) => {
  test(`getLanguages: ${args.name}`, async (t) => {
    const mockRequest = mockLanguagesInRepo(args.languagesInRepository);
    const stubExtractorEntry = {
      extractor_root: "",
    };
    const codeQL = createStubCodeQL({
      betterResolveLanguages: () =>
        Promise.resolve({
          aliases: {
            "c#": KnownLanguage.csharp,
            c: KnownLanguage.cpp,
            kotlin: KnownLanguage.java,
            typescript: KnownLanguage.javascript,
          },
          extractors: {
            cpp: [stubExtractorEntry],
            csharp: [stubExtractorEntry],
            java: [stubExtractorEntry],
            javascript: [stubExtractorEntry],
            python: [stubExtractorEntry],
          },
        }),
    });

    if (args.expectedLanguages) {
      // happy path
      const actualLanguages = await configUtils.getLanguages(
        codeQL,
        args.languagesInput,
        mockRepositoryNwo,
        ".",
        mockLogger,
      );

      t.deepEqual(actualLanguages.sort(), args.expectedLanguages.sort());
    } else {
      // there is an error
      await t.throwsAsync(
        async () =>
          await configUtils.getLanguages(
            codeQL,
            args.languagesInput,
            mockRepositoryNwo,
            ".",
            mockLogger,
          ),
        { message: args.expectedError },
      );
    }
    t.deepEqual(mockRequest.called, args.expectedApiCall);
  });
});

for (const { displayName, language, feature } of [
  {
    displayName: "Java",
    language: KnownLanguage.java,
    feature: Feature.DisableJavaBuildlessEnabled,
  },
  {
    displayName: "C#",
    language: KnownLanguage.csharp,
    feature: Feature.DisableCsharpBuildless,
  },
]) {
  test(`Build mode not overridden when disable ${displayName} buildless feature flag disabled`, async (t) => {
    const messages: LoggedMessage[] = [];
    const buildMode = await configUtils.parseBuildModeInput(
      "none",
      [language],
      createFeatures([]),
      getRecordingLogger(messages),
    );
    t.is(buildMode, BuildMode.None);
    t.deepEqual(messages, []);
  });

  test(`Build mode not overridden for other languages when disable ${displayName} buildless feature flag enabled`, async (t) => {
    const messages: LoggedMessage[] = [];
    const buildMode = await configUtils.parseBuildModeInput(
      "none",
      [KnownLanguage.python],
      createFeatures([feature]),
      getRecordingLogger(messages),
    );
    t.is(buildMode, BuildMode.None);
    t.deepEqual(messages, []);
  });

  test(`Build mode overridden when analyzing ${displayName} and disable ${displayName} buildless feature flag enabled`, async (t) => {
    const messages: LoggedMessage[] = [];
    const buildMode = await configUtils.parseBuildModeInput(
      "none",
      [language],
      createFeatures([feature]),
      getRecordingLogger(messages),
    );
    t.is(buildMode, BuildMode.Autobuild);
    t.deepEqual(messages, [
      {
        message: `Scanning ${displayName} code without a build is temporarily unavailable. Falling back to 'autobuild' build mode.`,
        type: "warning",
      },
    ]);
  });
}

interface OverlayDatabaseModeTestSetup {
  overlayDatabaseEnvVar: string | undefined;
  features: Feature[];
  isPullRequest: boolean;
  isDefaultBranch: boolean;
  repositoryOwner: string;
  buildMode: BuildMode | undefined;
  languages: Language[];
  codeqlVersion: string;
  gitRoot: string | undefined;
  codeScanningConfig: configUtils.UserConfig;
}

const defaultOverlayDatabaseModeTestSetup: OverlayDatabaseModeTestSetup = {
  overlayDatabaseEnvVar: undefined,
  features: [],
  isPullRequest: false,
  isDefaultBranch: false,
  repositoryOwner: "github",
  buildMode: BuildMode.None,
  languages: [KnownLanguage.javascript],
  codeqlVersion: CODEQL_OVERLAY_MINIMUM_VERSION,
  gitRoot: "/some/git/root",
  codeScanningConfig: {},
};

const getOverlayDatabaseModeMacro = test.macro({
  exec: async (
    t: ExecutionContext,
    _title: string,
    setupOverrides: Partial<OverlayDatabaseModeTestSetup>,
    expected: {
      overlayDatabaseMode: OverlayDatabaseMode;
      useOverlayDatabaseCaching: boolean;
    },
  ) => {
    return await withTmpDir(async (tempDir) => {
      const messages: LoggedMessage[] = [];
      const logger = getRecordingLogger(messages);

      // Save the original environment
      const originalEnv = { ...process.env };

      try {
        const setup = {
          ...defaultOverlayDatabaseModeTestSetup,
          ...setupOverrides,
        };

        // Set up environment variable if specified
        delete process.env.CODEQL_OVERLAY_DATABASE_MODE;
        if (setup.overlayDatabaseEnvVar !== undefined) {
          process.env.CODEQL_OVERLAY_DATABASE_MODE =
            setup.overlayDatabaseEnvVar;
        }

        // Mock feature flags
        const features = createFeatures(setup.features);

        // Mock isAnalyzingPullRequest function
        sinon
          .stub(actionsUtil, "isAnalyzingPullRequest")
          .returns(setup.isPullRequest);

        // Mock repository owner
        const repository = {
          owner: setup.repositoryOwner,
          repo: "test-repo",
        };

        // Set up CodeQL mock
        const codeql = mockCodeQLVersion(setup.codeqlVersion);

        // Mock traced languages
        sinon
          .stub(codeql, "isTracedLanguage")
          .callsFake(async (lang: Language) => {
            return [KnownLanguage.java].includes(lang as KnownLanguage);
          });

        // Mock git root detection
        if (setup.gitRoot !== undefined) {
          sinon.stub(gitUtils, "getGitRoot").resolves(setup.gitRoot);
        }

        // Mock default branch detection
        sinon
          .stub(gitUtils, "isAnalyzingDefaultBranch")
          .resolves(setup.isDefaultBranch);

        const result = await configUtils.getOverlayDatabaseMode(
          codeql,
          repository,
          features,
          setup.languages,
          tempDir, // sourceRoot
          setup.buildMode,
          setup.codeScanningConfig,
          logger,
        );

        t.deepEqual(result, expected);
      } finally {
        // Restore the original environment
        process.env = originalEnv;
      }
    });
  },
  title: (_, title) => `getOverlayDatabaseMode: ${title}`,
});

test(
  getOverlayDatabaseModeMacro,
  "Environment variable override - Overlay",
  {
    overlayDatabaseEnvVar: "overlay",
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.Overlay,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Environment variable override - OverlayBase",
  {
    overlayDatabaseEnvVar: "overlay-base",
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.OverlayBase,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Environment variable override - None",
  {
    overlayDatabaseEnvVar: "none",
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Ignore invalid environment variable",
  {
    overlayDatabaseEnvVar: "invalid-mode",
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Ignore feature flag when analyzing non-default branch",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysis, Feature.OverlayAnalysisJavascript],
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay-base database on default branch when feature enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysis, Feature.OverlayAnalysisJavascript],
    isDefaultBranch: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.OverlayBase,
    useOverlayDatabaseCaching: true,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay-base database on default branch when feature enabled with custom analysis",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysis, Feature.OverlayAnalysisJavascript],
    codeScanningConfig: {
      packs: ["some-custom-pack@1.0.0"],
    } as configUtils.UserConfig,
    isDefaultBranch: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.OverlayBase,
    useOverlayDatabaseCaching: true,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay-base database on default branch when code-scanning feature enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    isDefaultBranch: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.OverlayBase,
    useOverlayDatabaseCaching: true,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay-base database on default branch when code-scanning feature enabled with disable-default-queries",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    codeScanningConfig: {
      "disable-default-queries": true,
    } as configUtils.UserConfig,
    isDefaultBranch: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay-base database on default branch when code-scanning feature enabled with packs",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    codeScanningConfig: {
      packs: ["some-custom-pack@1.0.0"],
    } as configUtils.UserConfig,
    isDefaultBranch: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay-base database on default branch when code-scanning feature enabled with queries",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    codeScanningConfig: {
      queries: [{ uses: "some-query.ql" }],
    } as configUtils.UserConfig,
    isDefaultBranch: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay-base database on default branch when code-scanning feature enabled with query-filters",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    codeScanningConfig: {
      "query-filters": [{ include: { "security-severity": "high" } }],
    } as configUtils.UserConfig,
    isDefaultBranch: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay-base database on default branch when only language-specific feature enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysisJavascript],
    isDefaultBranch: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay-base database on default branch when only code-scanning feature enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysisCodeScanningJavascript],
    isDefaultBranch: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay-base database on default branch when language-specific feature disabled",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysis],
    isDefaultBranch: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay analysis on PR when feature enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysis, Feature.OverlayAnalysisJavascript],
    isPullRequest: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.Overlay,
    useOverlayDatabaseCaching: true,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay analysis on PR when feature enabled with custom analysis",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysis, Feature.OverlayAnalysisJavascript],
    codeScanningConfig: {
      packs: ["some-custom-pack@1.0.0"],
    } as configUtils.UserConfig,
    isPullRequest: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.Overlay,
    useOverlayDatabaseCaching: true,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay analysis on PR when code-scanning feature enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    isPullRequest: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.Overlay,
    useOverlayDatabaseCaching: true,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay analysis on PR when code-scanning feature enabled with disable-default-queries",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    codeScanningConfig: {
      "disable-default-queries": true,
    } as configUtils.UserConfig,
    isPullRequest: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay analysis on PR when code-scanning feature enabled with packs",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    codeScanningConfig: {
      packs: ["some-custom-pack@1.0.0"],
    } as configUtils.UserConfig,
    isPullRequest: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay analysis on PR when code-scanning feature enabled with queries",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    codeScanningConfig: {
      queries: [{ uses: "some-query.ql" }],
    } as configUtils.UserConfig,
    isPullRequest: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay analysis on PR when code-scanning feature enabled with query-filters",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    codeScanningConfig: {
      "query-filters": [{ include: { "security-severity": "high" } }],
    } as configUtils.UserConfig,
    isPullRequest: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay analysis on PR when only language-specific feature enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysisJavascript],
    isPullRequest: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay analysis on PR when only code-scanning feature enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysisCodeScanningJavascript],
    isPullRequest: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay analysis on PR when language-specific feature disabled",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysis],
    isPullRequest: true,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay PR analysis by env for dsp-testing",
  {
    overlayDatabaseEnvVar: "overlay",
    repositoryOwner: "dsp-testing",
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.Overlay,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay PR analysis by env for other-org",
  {
    overlayDatabaseEnvVar: "overlay",
    repositoryOwner: "other-org",
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.Overlay,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay PR analysis by feature flag for dsp-testing",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysis, Feature.OverlayAnalysisJavascript],
    isPullRequest: true,
    repositoryOwner: "dsp-testing",
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.Overlay,
    useOverlayDatabaseCaching: true,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay PR analysis by feature flag for other-org",
  {
    languages: [KnownLanguage.javascript],
    features: [Feature.OverlayAnalysis, Feature.OverlayAnalysisJavascript],
    isPullRequest: true,
    repositoryOwner: "other-org",
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Fallback due to autobuild with traced language",
  {
    overlayDatabaseEnvVar: "overlay",
    buildMode: BuildMode.Autobuild,
    languages: [KnownLanguage.java],
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Fallback due to no build mode with traced language",
  {
    overlayDatabaseEnvVar: "overlay",
    buildMode: undefined,
    languages: [KnownLanguage.java],
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Fallback due to old CodeQL version",
  {
    overlayDatabaseEnvVar: "overlay",
    codeqlVersion: "2.14.0",
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Fallback due to missing git root",
  {
    overlayDatabaseEnvVar: "overlay",
    gitRoot: undefined,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

// Exercise language-specific overlay analysis features code paths
for (const language in KnownLanguage) {
  test(
    getOverlayDatabaseModeMacro,
    `Check default overlay analysis feature for ${language}`,
    {
      languages: [language],
      features: [Feature.OverlayAnalysis],
      isPullRequest: true,
    },
    {
      overlayDatabaseMode: OverlayDatabaseMode.None,
      useOverlayDatabaseCaching: false,
    },
  );
}

test("hasActionsWorkflows doesn't throw if workflows folder doesn't exist", async (t) => {
  return withTmpDir(async (tmpDir) => {
    t.notThrows(() => configUtils.hasActionsWorkflows(tmpDir));
  });
});
