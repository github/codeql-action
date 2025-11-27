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
import * as errorMessages from "./error-messages";
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
  createTestConfig,
} from "./testing-utils";
import {
  GitHubVariant,
  GitHubVersion,
  ConfigurationError,
  withTmpDir,
  BuildMode,
  DiskUsage,
} from "./util";
import * as util from "./util";

setupTests(test);

const githubVersion = { type: GitHubVariant.DOTCOM } as GitHubVersion;

function createTestInitConfigInputs(
  overrides: Partial<configUtils.InitConfigInputs>,
): configUtils.InitConfigInputs {
  return Object.assign(
    {},
    {
      analysisKinds: [AnalysisKind.CodeScanning],
      languagesInput: undefined,
      queriesInput: undefined,
      packsInput: undefined,
      configFile: undefined,
      dbLocation: undefined,
      configInput: undefined,
      buildModeInput: undefined,
      ramInput: undefined,
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
      },
      features: createFeatures([]),
      repositoryProperties: {},
      logger: getRunnerLogger(true),
    } satisfies configUtils.InitConfigInputs,
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
      createFeatures([]),
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
      createFeatures([]),
      createTestInitConfigInputs({
        analysisKinds: [AnalysisKind.CodeQuality],
        languagesInput: languages,
        repository: { owner: "github", repo: "example" },
        tempDir,
        codeql,
        logger,
      }),
    );

    // And the config we expect it to result in
    const expectedConfig = createTestConfig({
      analysisKinds: [AnalysisKind.CodeQuality],
      languages: [KnownLanguage.actions],
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
    });

    t.deepEqual(config, expectedConfig);
  });
});

test("initActionState doesn't throw if there are queries configured in the repository properties", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const logger = getRunnerLogger(true);
    const languages = "javascript";

    const codeql = createStubCodeQL({
      async betterResolveLanguages() {
        return {
          extractors: {
            javascript: [{ extractor_root: "" }],
          },
        };
      },
    });

    // This should be ignored and no error should be thrown.
    const repositoryProperties = {
      "github-codeql-extra-queries": "+foo",
    };

    // Expected configuration for a CQ-only analysis.
    const computedConfig: configUtils.UserConfig = {
      "disable-default-queries": true,
      queries: [{ uses: "code-quality" }],
      "query-filters": [],
    };

    const expectedConfig = createTestConfig({
      analysisKinds: [AnalysisKind.CodeQuality],
      languages: [KnownLanguage.javascript],
      codeQLCmd: codeql.getPath(),
      computedConfig,
      dbLocation: path.resolve(tempDir, "codeql_databases"),
      debugArtifactName: "",
      debugDatabaseName: "",
      tempDir,
      repositoryProperties,
    });

    await t.notThrowsAsync(async () => {
      const config = await configUtils.initConfig(
        createFeatures([]),
        createTestInitConfigInputs({
          analysisKinds: [AnalysisKind.CodeQuality],
          languagesInput: languages,
          repository: { owner: "github", repo: "example" },
          tempDir,
          codeql,
          repositoryProperties,
          logger,
        }),
      );

      t.deepEqual(config, expectedConfig);
    });
  });
});

test("loading a saved config produces the same config", async (t) => {
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
      createFeatures([]),
      createTestInitConfigInputs({
        languagesInput: "javascript,python",
        tempDir,
        codeql,
        workspacePath: tempDir,
        logger,
      }),
    );
    await configUtils.saveConfig(config1, logger);

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

    const config = await configUtils.initConfig(
      createFeatures([]),
      createTestInitConfigInputs({
        languagesInput: "javascript,python",
        tempDir,
        codeql,
        workspacePath: tempDir,
        logger,
      }),
    );
    // initConfig does not save the config, so we do it here.
    await configUtils.saveConfig(config, logger);

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
        createFeatures([]),
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
          errorMessages.getConfigFileOutsideWorkspaceErrorMessage(
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
        createFeatures([]),
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
          errorMessages.getConfigFileRepoFormatInvalidMessage(
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
        createFeatures([]),
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
          errorMessages.getConfigFileDoesNotExistErrorMessage(
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
    const expectedConfig = createTestConfig({
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
    });

    const languagesInput = "javascript";
    const configFilePath = createConfigFile(inputFileContents, tempDir);

    const actualConfig = await configUtils.initConfig(
      createFeatures([]),
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
      createFeatures([]),
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
      createFeatures([]),
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
        createFeatures([]),
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
          errorMessages.getConfigFileDirectoryGivenMessage(repoReference),
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
        createFeatures([]),
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
          errorMessages.getConfigFileFormatInvalidMessage(repoReference),
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
        createFeatures([]),
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
        new ConfigurationError(errorMessages.getNoLanguagesError()),
      );
    }
  });
});

test("Unknown languages", async (t) => {
  return await withTmpDir(async (tempDir) => {
    const languagesInput = "rubbish,english";

    try {
      await configUtils.initConfig(
        createFeatures([]),
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
          errorMessages.getUnknownLanguagesError(["rubbish", "english"]),
        ),
      );
    }
  });
});

const mockLogger = getRunnerLogger(true);

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
    name: "unsupported languages from github api",
    languagesInput: "",
    languagesInRepository: ["html"],
    expectedApiCall: true,
    expectedError: errorMessages.getNoLanguagesError(),
  },
  {
    name: "no languages",
    languagesInput: "",
    languagesInRepository: [],
    expectedApiCall: true,
    expectedError: errorMessages.getNoLanguagesError(),
  },
  {
    name: "unrecognized languages from input",
    languagesInput: "a, b, c, javascript",
    languagesInRepository: [],
    expectedApiCall: false,
    expectedError: errorMessages.getUnknownLanguagesError(["a", "b"]),
  },
  {
    name: "extractors that aren't languages aren't included (specified)",
    languagesInput: "html",
    languagesInRepository: [],
    expectedApiCall: false,
    expectedError: errorMessages.getUnknownLanguagesError(["html"]),
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
      betterResolveLanguages: (options) =>
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
            ...(options?.filterToLanguagesWithQueries
              ? {}
              : {
                  html: [stubExtractorEntry],
                }),
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
  buildMode: BuildMode | undefined;
  languages: Language[];
  codeqlVersion: string;
  gitRoot: string | undefined;
  codeScanningConfig: configUtils.UserConfig;
  diskUsage: DiskUsage | undefined;
  memoryFlagValue: number;
}

const defaultOverlayDatabaseModeTestSetup: OverlayDatabaseModeTestSetup = {
  overlayDatabaseEnvVar: undefined,
  features: [],
  isPullRequest: false,
  isDefaultBranch: false,
  buildMode: BuildMode.None,
  languages: [KnownLanguage.javascript],
  codeqlVersion: CODEQL_OVERLAY_MINIMUM_VERSION,
  gitRoot: "/some/git/root",
  codeScanningConfig: {},
  diskUsage: {
    numAvailableBytes: 50_000_000_000,
    numTotalBytes: 100_000_000_000,
  },
  memoryFlagValue: 6920,
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

        sinon.stub(util, "checkDiskUsage").resolves(setup.diskUsage);

        // Mock feature flags
        const features = createFeatures(setup.features);

        // Mock isAnalyzingPullRequest function
        sinon
          .stub(actionsUtil, "isAnalyzingPullRequest")
          .returns(setup.isPullRequest);

        sinon.stub(util, "getMemoryFlagValue").returns(setup.memoryFlagValue);

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
          features,
          setup.languages,
          tempDir, // sourceRoot
          setup.buildMode,
          undefined,
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
  "No overlay-base database on default branch if runner disk space is too low",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    isDefaultBranch: true,
    diskUsage: {
      numAvailableBytes: 1_000_000_000,
      numTotalBytes: 100_000_000_000,
    },
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay-base database on default branch if we can't determine runner disk space",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    isDefaultBranch: true,
    diskUsage: undefined,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay-base database on default branch if runner disk space is too low and skip resource checks flag is enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
      Feature.OverlayAnalysisSkipResourceChecks,
    ],
    isDefaultBranch: true,
    diskUsage: {
      numAvailableBytes: 1_000_000_000,
      numTotalBytes: 100_000_000_000,
    },
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.OverlayBase,
    useOverlayDatabaseCaching: true,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay-base database on default branch if memory flag is too low",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    isDefaultBranch: true,
    memoryFlagValue: 3072,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay-base database on default branch if memory flag is too low and skip resource checks flag is enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
      Feature.OverlayAnalysisSkipResourceChecks,
    ],
    isDefaultBranch: true,
    memoryFlagValue: 3072,
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
  "No overlay analysis on PR if runner disk space is too low",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    isPullRequest: true,
    diskUsage: {
      numAvailableBytes: 1_000_000_000,
      numTotalBytes: 100_000_000_000,
    },
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay analysis on PR if runner disk space is too low and skip resource checks flag is enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
      Feature.OverlayAnalysisSkipResourceChecks,
    ],
    isPullRequest: true,
    diskUsage: {
      numAvailableBytes: 1_000_000_000,
      numTotalBytes: 100_000_000_000,
    },
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.Overlay,
    useOverlayDatabaseCaching: true,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay analysis on PR if we can't determine runner disk space",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    isPullRequest: true,
    diskUsage: undefined,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "No overlay analysis on PR if memory flag is too low",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
    ],
    isPullRequest: true,
    memoryFlagValue: 3072,
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay analysis on PR if memory flag is too low and skip resource checks flag is enabled",
  {
    languages: [KnownLanguage.javascript],
    features: [
      Feature.OverlayAnalysis,
      Feature.OverlayAnalysisCodeScanningJavascript,
      Feature.OverlayAnalysisSkipResourceChecks,
    ],
    isPullRequest: true,
    memoryFlagValue: 3072,
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
  "Overlay PR analysis by env",
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
  "Overlay PR analysis by env on a runner with low disk space",
  {
    overlayDatabaseEnvVar: "overlay",
    diskUsage: { numAvailableBytes: 0, numTotalBytes: 100_000_000_000 },
  },
  {
    overlayDatabaseMode: OverlayDatabaseMode.Overlay,
    useOverlayDatabaseCaching: false,
  },
);

test(
  getOverlayDatabaseModeMacro,
  "Overlay PR analysis by feature flag",
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
