import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";

import * as yaml from "js-yaml";
import * as semver from "semver";

import * as api from "./api-client";
import { CachingKind, getCachingKind } from "./caching-utils";
import { CodeQL } from "./codeql";
import { Feature, FeatureEnablement } from "./feature-flags";
import { Language, parseLanguage } from "./languages";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import { downloadTrapCaches } from "./trap-caching";
import {
  GitHubVersion,
  prettyPrintPack,
  ConfigurationError,
  BuildMode,
} from "./util";

// Property names from the user-supplied config file.

const PACKS_PROPERTY = "packs";

/**
 * Format of the config file supplied by the user.
 */
export interface UserConfig {
  name?: string;
  "disable-default-queries"?: boolean;
  queries?: Array<{
    name?: string;
    uses: string;
  }>;
  "paths-ignore"?: string[];
  paths?: string[];

  // If this is a multi-language analysis, then the packages must be split by
  // language. If this is a single language analysis, then no split by
  // language is necessary.
  packs?: Record<string, string[]> | string[];

  // Set of query filters to include and exclude extra queries based on
  // codeql query suite `include` and `exclude` properties
  "query-filters"?: QueryFilter[];
}

export type QueryFilter = ExcludeQueryFilter | IncludeQueryFilter;

export type RegistryConfigWithCredentials = RegistryConfigNoCredentials & {
  // Token to use when downloading packs from this registry.
  token: string;
};

/**
 * The list of registries and the associated pack globs that determine where each
 * pack can be downloaded from.
 */
export interface RegistryConfigNoCredentials {
  // URL of a package registry, eg- https://ghcr.io/v2/
  url: string;

  // List of globs that determine which packs are associated with this registry.
  packages: string[] | string;

  // Kind of registry, either "github" or "docker". Default is "docker".
  // "docker" refers specifically to the GitHub Container Registry, which is the usual way of sharing CodeQL packs.
  // "github" refers to packs published as content in a GitHub repository. This kind of registry is used in scenarios
  // where GHCR is not available, such as certain GHES environments.
  kind?: "github" | "docker";
}

interface ExcludeQueryFilter {
  exclude: Record<string, string[] | string>;
}

interface IncludeQueryFilter {
  include: Record<string, string[] | string>;
}

/**
 * Format of the parsed config file.
 */
export interface Config {
  /**
   * Set of languages to run analysis for.
   */
  languages: Language[];
  /**
   * Build mode, if set. Currently only a single build mode is supported per job.
   */
  buildMode: BuildMode | undefined;
  /**
   * A unaltered copy of the original user input.
   * Mainly intended to be used for status reporting.
   * If any field is useful for the actual processing
   * of the action then consider pulling it out to a
   * top-level field above.
   */
  originalUserInput: UserConfig;
  /**
   * Directory to use for temporary files that should be
   * deleted at the end of the job.
   */
  tempDir: string;
  /**
   * Path of the CodeQL executable.
   */
  codeQLCmd: string;
  /**
   * Version of GitHub we are talking to.
   */
  gitHubVersion: GitHubVersion;
  /**
   * The location where CodeQL databases should be stored.
   */
  dbLocation: string;
  /**
   * Specifies whether we are debugging mode and should try to produce extra
   * output for debugging purposes when possible.
   */
  debugMode: boolean;
  /**
   * Specifies the name of the debugging artifact if we are in debug mode.
   */
  debugArtifactName: string;
  /**
   * Specifies the name of the database in the debugging artifact.
   */
  debugDatabaseName: string;

  augmentationProperties: AugmentationProperties;

  /**
   * Partial map from languages to locations of TRAP caches for that language.
   * If a key is omitted, then TRAP caching should not be used for that language.
   */
  trapCaches: Partial<Record<Language, string>>;

  /**
   * Time taken to download TRAP caches. Used for status reporting.
   */
  trapCacheDownloadTime: number;

  /** A value indicating how dependency caching should be used. */
  dependencyCachingEnabled: CachingKind;
}

/**
 * Describes how to augment the user config with inputs from the action.
 *
 * When running a CodeQL analysis, the user can supply a config file. When
 * running a CodeQL analysis from a GitHub action, the user can supply a
 * config file _and_ a set of inputs.
 *
 * The inputs from the action are used to augment the user config before
 * passing the user config to the CodeQL CLI invocation.
 */
export interface AugmentationProperties {
  /**
   * Whether or not the queries input combines with the queries in the config.
   */
  queriesInputCombines: boolean;

  /**
   * The queries input from the `with` block of the action declaration
   */
  queriesInput?: Array<{ uses: string }>;

  /**
   * Whether or not the packs input combines with the packs in the config.
   */
  packsInputCombines: boolean;
  /**
   * The packs input from the `with` block of the action declaration
   */
  packsInput?: string[];
}

/**
 * The default, empty augmentation properties. This is most useful
 * for tests.
 */
export const defaultAugmentationProperties: AugmentationProperties = {
  queriesInputCombines: false,
  packsInputCombines: false,
  packsInput: undefined,
  queriesInput: undefined,
};
export type Packs = Partial<Record<Language, string[]>>;

export interface Pack {
  name: string;
  version?: string;
  path?: string;
}

export function getPacksStrInvalid(
  packStr: string,
  configFile?: string,
): string {
  return configFile
    ? getConfigFilePropertyError(
        configFile,
        PACKS_PROPERTY,
        `"${packStr}" is not a valid pack`,
      )
    : `"${packStr}" is not a valid pack`;
}

export function getConfigFileOutsideWorkspaceErrorMessage(
  configFile: string,
): string {
  return `The configuration file "${configFile}" is outside of the workspace`;
}

export function getConfigFileDoesNotExistErrorMessage(
  configFile: string,
): string {
  return `The configuration file "${configFile}" does not exist`;
}

export function getConfigFileRepoFormatInvalidMessage(
  configFile: string,
): string {
  let error = `The configuration file "${configFile}" is not a supported remote file reference.`;
  error += " Expected format <owner>/<repository>/<file-path>@<ref>";

  return error;
}

export function getConfigFileFormatInvalidMessage(configFile: string): string {
  return `The configuration file "${configFile}" could not be read`;
}

export function getConfigFileDirectoryGivenMessage(configFile: string): string {
  return `The configuration file "${configFile}" looks like a directory, not a file`;
}

function getConfigFilePropertyError(
  configFile: string | undefined,
  property: string,
  error: string,
): string {
  if (configFile === undefined) {
    return `The workflow property "${property}" is invalid: ${error}`;
  } else {
    return `The configuration file "${configFile}" is invalid: property "${property}" ${error}`;
  }
}

export function getNoLanguagesError(): string {
  return (
    "Did not detect any languages to analyze. " +
    "Please update input in workflow or check that GitHub detects the correct languages in your repository."
  );
}

export function getUnknownLanguagesError(languages: string[]): string {
  return `Did not recognize the following languages: ${languages.join(", ")}`;
}

/**
 * Gets the set of languages in the current repository that are
 * scannable by CodeQL.
 */
export async function getLanguagesInRepo(
  repository: RepositoryNwo,
  logger: Logger,
): Promise<Language[]> {
  logger.debug(`GitHub repo ${repository.owner} ${repository.repo}`);
  const response = await api.getApiClient().rest.repos.listLanguages({
    owner: repository.owner,
    repo: repository.repo,
  });

  logger.debug(`Languages API response: ${JSON.stringify(response)}`);

  // The GitHub API is going to return languages in order of popularity,
  // When we pick a language to autobuild we want to pick the most popular traced language
  // Since sets in javascript maintain insertion order, using a set here and then splatting it
  // into an array gives us an array of languages ordered by popularity
  const languages: Set<Language> = new Set();
  for (const lang of Object.keys(response.data as Record<string, number>)) {
    const parsedLang = parseLanguage(lang);
    if (parsedLang !== undefined) {
      languages.add(parsedLang);
    }
  }
  return [...languages];
}

/**
 * Get the languages to analyse.
 *
 * The result is obtained from the action input parameter 'languages' if that
 * has been set, otherwise it is deduced as all languages in the repo that
 * can be analysed.
 *
 * If no languages could be detected from either the workflow or the repository
 * then throw an error.
 */
export async function getLanguages(
  codeQL: CodeQL,
  languagesInput: string | undefined,
  repository: RepositoryNwo,
  logger: Logger,
): Promise<Language[]> {
  // Obtain languages without filtering them.
  const { rawLanguages, autodetected } = await getRawLanguages(
    languagesInput,
    repository,
    logger,
  );

  let languages = rawLanguages;
  if (autodetected) {
    const supportedLanguages = Object.keys(await codeQL.resolveLanguages());

    languages = languages
      .map(parseLanguage)
      .filter((value) => value && supportedLanguages.includes(value))
      .map((value) => value as Language);

    logger.info(`Automatically detected languages: ${languages.join(", ")}`);
  } else {
    const aliases = (await codeQL.betterResolveLanguages()).aliases;
    if (aliases) {
      languages = languages.map((lang) => aliases[lang] || lang);
    }

    logger.info(`Languages from configuration: ${languages.join(", ")}`);
  }

  // If the languages parameter was not given and no languages were
  // detected then fail here as this is a workflow configuration error.
  if (languages.length === 0) {
    throw new ConfigurationError(getNoLanguagesError());
  }

  // Make sure they are supported
  const parsedLanguages: Language[] = [];
  const unknownLanguages: string[] = [];
  for (const language of languages) {
    const parsedLanguage = parseLanguage(language) as Language;
    if (parsedLanguage === undefined) {
      unknownLanguages.push(language);
    } else if (!parsedLanguages.includes(parsedLanguage)) {
      parsedLanguages.push(parsedLanguage);
    }
  }

  // Any unknown languages here would have come directly from the input
  // since we filter unknown languages coming from the GitHub API.
  if (unknownLanguages.length > 0) {
    throw new ConfigurationError(getUnknownLanguagesError(unknownLanguages));
  }

  return parsedLanguages;
}

/**
 * Gets the set of languages in the current repository without checking to
 * see if these languages are actually supported by CodeQL.
 *
 * @param languagesInput The languages from the workflow input
 * @param repository the owner/name of the repository
 * @param logger a logger
 * @returns A tuple containing a list of languages in this repository that might be
 * analyzable and whether or not this list was determined automatically.
 */
export async function getRawLanguages(
  languagesInput: string | undefined,
  repository: RepositoryNwo,
  logger: Logger,
) {
  // Obtain from action input 'languages' if set
  let rawLanguages = (languagesInput || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0);
  let autodetected: boolean;
  if (rawLanguages.length) {
    autodetected = false;
  } else {
    autodetected = true;

    // Obtain all languages in the repo that can be analysed
    rawLanguages = (await getLanguagesInRepo(repository, logger)) as string[];
  }
  return { rawLanguages, autodetected };
}

/** Inputs required to initialize a configuration. */
export interface InitConfigInputs {
  languagesInput: string | undefined;
  queriesInput: string | undefined;
  packsInput: string | undefined;
  configFile: string | undefined;
  dbLocation: string | undefined;
  configInput: string | undefined;
  buildModeInput: string | undefined;
  trapCachingEnabled: boolean;
  dependencyCachingEnabled: string | undefined;
  debugMode: boolean;
  debugArtifactName: string;
  debugDatabaseName: string;
  repository: RepositoryNwo;
  tempDir: string;
  codeql: CodeQL;
  workspacePath: string;
  githubVersion: GitHubVersion;
  apiDetails: api.GitHubApiCombinedDetails;
  features: FeatureEnablement;
  logger: Logger;
}

type GetDefaultConfigInputs = Omit<
  InitConfigInputs,
  "configFile" | "configInput"
>;

type LoadConfigInputs = Omit<InitConfigInputs, "configInput"> & {
  configFile: string;
};

/**
 * Get the default config for when the user has not supplied one.
 */
export async function getDefaultConfig({
  languagesInput,
  queriesInput,
  packsInput,
  buildModeInput,
  dbLocation,
  trapCachingEnabled,
  dependencyCachingEnabled,
  debugMode,
  debugArtifactName,
  debugDatabaseName,
  repository,
  tempDir,
  codeql,
  githubVersion,
  features,
  logger,
}: GetDefaultConfigInputs): Promise<Config> {
  const languages = await getLanguages(
    codeql,
    languagesInput,
    repository,
    logger,
  );

  const buildMode = await parseBuildModeInput(
    buildModeInput,
    languages,
    features,
    logger,
  );

  const augmentationProperties = calculateAugmentation(
    packsInput,
    queriesInput,
    languages,
  );

  const { trapCaches, trapCacheDownloadTime } = await downloadCacheWithTime(
    trapCachingEnabled,
    codeql,
    languages,
    logger,
  );

  return {
    languages,
    buildMode,
    originalUserInput: {},
    tempDir,
    codeQLCmd: codeql.getPath(),
    gitHubVersion: githubVersion,
    dbLocation: dbLocationOrDefault(dbLocation, tempDir),
    debugMode,
    debugArtifactName,
    debugDatabaseName,
    augmentationProperties,
    trapCaches,
    trapCacheDownloadTime,
    dependencyCachingEnabled: getCachingKind(dependencyCachingEnabled),
  };
}

async function downloadCacheWithTime(
  trapCachingEnabled: boolean,
  codeQL: CodeQL,
  languages: Language[],
  logger: Logger,
): Promise<{
  trapCaches: Partial<Record<Language, string>>;
  trapCacheDownloadTime: number;
}> {
  let trapCaches = {};
  let trapCacheDownloadTime = 0;
  if (trapCachingEnabled) {
    const start = performance.now();
    trapCaches = await downloadTrapCaches(codeQL, languages, logger);
    trapCacheDownloadTime = performance.now() - start;
  }
  return { trapCaches, trapCacheDownloadTime };
}

/**
 * Load the config from the given file.
 */
async function loadConfig({
  languagesInput,
  queriesInput,
  packsInput,
  buildModeInput,
  configFile,
  dbLocation,
  trapCachingEnabled,
  dependencyCachingEnabled,
  debugMode,
  debugArtifactName,
  debugDatabaseName,
  repository,
  tempDir,
  codeql,
  workspacePath,
  githubVersion,
  apiDetails,
  features,
  logger,
}: LoadConfigInputs): Promise<Config> {
  let parsedYAML: UserConfig;

  if (isLocal(configFile)) {
    if (configFile !== userConfigFromActionPath(tempDir)) {
      // If the config file is not generated by the Action, it should be relative to the workspace.
      configFile = path.resolve(workspacePath, configFile);
      // Error if the config file is now outside of the workspace
      if (!(configFile + path.sep).startsWith(workspacePath + path.sep)) {
        throw new ConfigurationError(
          getConfigFileOutsideWorkspaceErrorMessage(configFile),
        );
      }
    }
    parsedYAML = getLocalConfig(configFile);
  } else {
    parsedYAML = await getRemoteConfig(configFile, apiDetails);
  }

  const languages = await getLanguages(
    codeql,
    languagesInput,
    repository,
    logger,
  );

  const buildMode = await parseBuildModeInput(
    buildModeInput,
    languages,
    features,
    logger,
  );

  const augmentationProperties = calculateAugmentation(
    packsInput,
    queriesInput,
    languages,
  );

  const { trapCaches, trapCacheDownloadTime } = await downloadCacheWithTime(
    trapCachingEnabled,
    codeql,
    languages,
    logger,
  );

  return {
    languages,
    buildMode,
    originalUserInput: parsedYAML,
    tempDir,
    codeQLCmd: codeql.getPath(),
    gitHubVersion: githubVersion,
    dbLocation: dbLocationOrDefault(dbLocation, tempDir),
    debugMode,
    debugArtifactName,
    debugDatabaseName,
    augmentationProperties,
    trapCaches,
    trapCacheDownloadTime,
    dependencyCachingEnabled: getCachingKind(dependencyCachingEnabled),
  };
}

/**
 * Calculates how the codeql config file needs to be augmented before passing
 * it to the CLI. The reason this is necessary is the codeql-action can be called
 * with extra inputs from the workflow. These inputs are not part of the config
 * and the CLI does not know about these inputs so we need to inject them into
 * the config file sent to the CLI.
 *
 * @param rawPacksInput The packs input from the action configuration.
 * @param rawQueriesInput The queries input from the action configuration.
 * @param languages The languages that the config file is for. If the packs input
 *    is non-empty, then there must be exactly one language. Otherwise, an
 *    error is thrown.
 *
 * @returns The properties that need to be augmented in the config file.
 *
 * @throws An error if the packs input is non-empty and the languages input does
 *     not have exactly one language.
 */
// exported for testing.
export function calculateAugmentation(
  rawPacksInput: string | undefined,
  rawQueriesInput: string | undefined,
  languages: Language[],
): AugmentationProperties {
  const packsInputCombines = shouldCombine(rawPacksInput);
  const packsInput = parsePacksFromInput(
    rawPacksInput,
    languages,
    packsInputCombines,
  );
  const queriesInputCombines = shouldCombine(rawQueriesInput);
  const queriesInput = parseQueriesFromInput(
    rawQueriesInput,
    queriesInputCombines,
  );

  return {
    packsInputCombines,
    packsInput: packsInput?.[languages[0]],
    queriesInput,
    queriesInputCombines,
  };
}

function parseQueriesFromInput(
  rawQueriesInput: string | undefined,
  queriesInputCombines: boolean,
) {
  if (!rawQueriesInput) {
    return undefined;
  }

  const trimmedInput = queriesInputCombines
    ? rawQueriesInput.trim().slice(1).trim()
    : (rawQueriesInput?.trim() ?? "");
  if (queriesInputCombines && trimmedInput.length === 0) {
    throw new ConfigurationError(
      getConfigFilePropertyError(
        undefined,
        "queries",
        "A '+' was used in the 'queries' input to specify that you wished to add some packs to your CodeQL analysis. However, no packs were specified. Please either remove the '+' or specify some packs.",
      ),
    );
  }
  return trimmedInput.split(",").map((query) => ({ uses: query.trim() }));
}

/**
 * Pack names must be in the form of `scope/name`, with only alpha-numeric characters,
 * and `-` allowed as long as not the first or last char.
 **/
const PACK_IDENTIFIER_PATTERN = (function () {
  const alphaNumeric = "[a-z0-9]";
  const alphaNumericDash = "[a-z0-9-]";
  const component = `${alphaNumeric}(${alphaNumericDash}*${alphaNumeric})?`;
  return new RegExp(`^${component}/${component}$`);
})();

// Exported for testing
export function parsePacksFromInput(
  rawPacksInput: string | undefined,
  languages: Language[],
  packsInputCombines: boolean,
): Packs | undefined {
  if (!rawPacksInput?.trim()) {
    return undefined;
  }

  if (languages.length > 1) {
    throw new ConfigurationError(
      "Cannot specify a 'packs' input in a multi-language analysis. Use a codeql-config.yml file instead and specify packs by language.",
    );
  } else if (languages.length === 0) {
    throw new ConfigurationError(
      "No languages specified. Cannot process the packs input.",
    );
  }

  rawPacksInput = rawPacksInput.trim();
  if (packsInputCombines) {
    rawPacksInput = rawPacksInput.trim().substring(1).trim();
    if (!rawPacksInput) {
      throw new ConfigurationError(
        getConfigFilePropertyError(
          undefined,
          "packs",
          "A '+' was used in the 'packs' input to specify that you wished to add some packs to your CodeQL analysis. However, no packs were specified. Please either remove the '+' or specify some packs.",
        ),
      );
    }
  }

  return {
    [languages[0]]: rawPacksInput.split(",").reduce((packs, pack) => {
      packs.push(validatePackSpecification(pack));
      return packs;
    }, [] as string[]),
  };
}

/**
 * Validates that this package specification is syntactically correct.
 * It may not point to any real package, but after this function returns
 * without throwing, we are guaranteed that the package specification
 * is roughly correct.
 *
 * The CLI itself will do a more thorough validation of the package
 * specification.
 *
 * A package specification looks like this:
 *
 * `scope/name@version:path`
 *
 * Version and path are optional.
 *
 * @param packStr the package specification to verify.
 * @param configFile Config file to use for error reporting
 */
export function parsePacksSpecification(packStr: string): Pack {
  if (typeof packStr !== "string") {
    throw new ConfigurationError(getPacksStrInvalid(packStr));
  }

  packStr = packStr.trim();
  const atIndex = packStr.indexOf("@");
  const colonIndex = packStr.indexOf(":", atIndex);
  const packStart = 0;
  const versionStart = atIndex + 1 || undefined;
  const pathStart = colonIndex + 1 || undefined;
  const packEnd = Math.min(
    atIndex > 0 ? atIndex : Infinity,
    colonIndex > 0 ? colonIndex : Infinity,
    packStr.length,
  );
  const versionEnd = versionStart
    ? Math.min(colonIndex > 0 ? colonIndex : Infinity, packStr.length)
    : undefined;
  const pathEnd = pathStart ? packStr.length : undefined;

  const packName = packStr.slice(packStart, packEnd).trim();
  const version = versionStart
    ? packStr.slice(versionStart, versionEnd).trim()
    : undefined;
  const packPath = pathStart
    ? packStr.slice(pathStart, pathEnd).trim()
    : undefined;

  if (!PACK_IDENTIFIER_PATTERN.test(packName)) {
    throw new ConfigurationError(getPacksStrInvalid(packStr));
  }
  if (version) {
    try {
      new semver.Range(version);
    } catch {
      // The range string is invalid. OK to ignore the caught error
      throw new ConfigurationError(getPacksStrInvalid(packStr));
    }
  }

  if (
    packPath &&
    (path.isAbsolute(packPath) ||
      // Permit using "/" instead of "\" on Windows
      // Use `x.split(y).join(z)` as a polyfill for `x.replaceAll(y, z)` since
      // if we used a regex we'd need to escape the path separator on Windows
      // which seems more awkward.
      path.normalize(packPath).split(path.sep).join("/") !==
        packPath.split(path.sep).join("/"))
  ) {
    throw new ConfigurationError(getPacksStrInvalid(packStr));
  }

  if (!packPath && pathStart) {
    // 0 length path
    throw new ConfigurationError(getPacksStrInvalid(packStr));
  }

  return {
    name: packName,
    version,
    path: packPath,
  };
}

export function validatePackSpecification(pack: string) {
  return prettyPrintPack(parsePacksSpecification(pack));
}

/**
 * The convention in this action is that an input value that is prefixed with a '+' will
 * be combined with the corresponding value in the config file.
 *
 * Without a '+', an input value will override the corresponding value in the config file.
 *
 * @param inputValue The input value to process.
 * @returns true if the input value should replace the corresponding value in the config file,
 *          false if it should be appended.
 */
function shouldCombine(inputValue?: string): boolean {
  return !!inputValue?.trim().startsWith("+");
}

function dbLocationOrDefault(
  dbLocation: string | undefined,
  tempDir: string,
): string {
  return dbLocation || path.resolve(tempDir, "codeql_databases");
}

function userConfigFromActionPath(tempDir: string): string {
  return path.resolve(tempDir, "user-config-from-action.yml");
}

/**
 * Load and return the config.
 *
 * This will parse the config from the user input if present, or generate
 * a default config. The parsed config is then stored to a known location.
 */
export async function initConfig(inputs: InitConfigInputs): Promise<Config> {
  let config: Config;

  const { logger, tempDir } = inputs;

  // if configInput is set, it takes precedence over configFile
  if (inputs.configInput) {
    if (inputs.configFile) {
      logger.warning(
        `Both a config file and config input were provided. Ignoring config file.`,
      );
    }
    inputs.configFile = userConfigFromActionPath(tempDir);
    fs.writeFileSync(inputs.configFile, inputs.configInput);
    logger.debug(`Using config from action input: ${inputs.configFile}`);
  }

  // If no config file was provided create an empty one
  if (!inputs.configFile) {
    logger.debug("No configuration file was provided");
    config = await getDefaultConfig(inputs);
  } else {
    // Convince the type checker that inputs.configFile is defined.
    config = await loadConfig({ ...inputs, configFile: inputs.configFile });
  }

  // Save the config so we can easily access it again in the future
  await saveConfig(config, logger);
  return config;
}

function parseRegistries(
  registriesInput: string | undefined,
): RegistryConfigWithCredentials[] | undefined {
  try {
    return registriesInput
      ? (yaml.load(registriesInput) as RegistryConfigWithCredentials[])
      : undefined;
  } catch {
    throw new ConfigurationError(
      "Invalid registries input. Must be a YAML string.",
    );
  }
}

export function parseRegistriesWithoutCredentials(
  registriesInput?: string,
): RegistryConfigNoCredentials[] | undefined {
  return parseRegistries(registriesInput)?.map((r) => {
    const { url, packages, kind } = r;
    return { url, packages, kind };
  });
}

function isLocal(configPath: string): boolean {
  // If the path starts with ./, look locally
  if (configPath.indexOf("./") === 0) {
    return true;
  }

  return configPath.indexOf("@") === -1;
}

function getLocalConfig(configFile: string): UserConfig {
  // Error if the file does not exist
  if (!fs.existsSync(configFile)) {
    throw new ConfigurationError(
      getConfigFileDoesNotExistErrorMessage(configFile),
    );
  }

  return yaml.load(fs.readFileSync(configFile, "utf8")) as UserConfig;
}

async function getRemoteConfig(
  configFile: string,
  apiDetails: api.GitHubApiCombinedDetails,
): Promise<UserConfig> {
  // retrieve the various parts of the config location, and ensure they're present
  const format = new RegExp(
    "(?<owner>[^/]+)/(?<repo>[^/]+)/(?<path>[^@]+)@(?<ref>.*)",
  );
  const pieces = format.exec(configFile);
  // 5 = 4 groups + the whole expression
  if (pieces === null || pieces.groups === undefined || pieces.length < 5) {
    throw new ConfigurationError(
      getConfigFileRepoFormatInvalidMessage(configFile),
    );
  }

  const response = await api
    .getApiClientWithExternalAuth(apiDetails)
    .rest.repos.getContent({
      owner: pieces.groups.owner,
      repo: pieces.groups.repo,
      path: pieces.groups.path,
      ref: pieces.groups.ref,
    });

  let fileContents: string;
  if ("content" in response.data && response.data.content !== undefined) {
    fileContents = response.data.content;
  } else if (Array.isArray(response.data)) {
    throw new ConfigurationError(
      getConfigFileDirectoryGivenMessage(configFile),
    );
  } else {
    throw new ConfigurationError(getConfigFileFormatInvalidMessage(configFile));
  }

  return yaml.load(
    Buffer.from(fileContents, "base64").toString("binary"),
  ) as UserConfig;
}

/**
 * Get the file path where the parsed config will be stored.
 */
export function getPathToParsedConfigFile(tempDir: string): string {
  return path.join(tempDir, "config");
}

/**
 * Store the given config to the path returned from getPathToParsedConfigFile.
 */
async function saveConfig(config: Config, logger: Logger) {
  const configString = JSON.stringify(config);
  const configFile = getPathToParsedConfigFile(config.tempDir);
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, configString, "utf8");
  logger.debug("Saved config:");
  logger.debug(configString);
}

/**
 * Get the config that has been saved to the given temp dir.
 * If the config could not be found then returns undefined.
 */
export async function getConfig(
  tempDir: string,
  logger: Logger,
): Promise<Config | undefined> {
  const configFile = getPathToParsedConfigFile(tempDir);
  if (!fs.existsSync(configFile)) {
    return undefined;
  }
  const configString = fs.readFileSync(configFile, "utf8");
  logger.debug("Loaded config:");
  logger.debug(configString);
  return JSON.parse(configString) as Config;
}

/**
 * Generate a `qlconfig.yml` file from the `registries` input.
 * This file is used by the CodeQL CLI to list the registries to use for each
 * pack.
 *
 * @param registriesInput The value of the `registries` input.
 * @param codeQL a codeQL object, used only for checking the version of CodeQL.
 * @param tempDir a temporary directory to store the generated qlconfig.yml file.
 * @param logger a logger object.
 * @returns The path to the generated `qlconfig.yml` file and the auth tokens to
 *        use for each registry.
 */
export async function generateRegistries(
  registriesInput: string | undefined,
  tempDir: string,
  logger: Logger,
) {
  const registries = parseRegistries(registriesInput);
  let registriesAuthTokens: string | undefined;
  let qlconfigFile: string | undefined;
  if (registries) {
    // generate a qlconfig.yml file to hold the registry configs.
    const qlconfig = createRegistriesBlock(registries);
    qlconfigFile = path.join(tempDir, "qlconfig.yml");
    const qlconfigContents = yaml.dump(qlconfig);
    fs.writeFileSync(qlconfigFile, qlconfigContents, "utf8");

    logger.debug("Generated qlconfig.yml:");
    logger.debug(qlconfigContents);
    registriesAuthTokens = registries
      .map((registry) => `${registry.url}=${registry.token}`)
      .join(",");
  }

  if (typeof process.env.CODEQL_REGISTRIES_AUTH === "string") {
    logger.debug(
      "Using CODEQL_REGISTRIES_AUTH environment variable to authenticate with registries.",
    );
  }

  return {
    registriesAuthTokens:
      // if the user has explicitly set the CODEQL_REGISTRIES_AUTH env var then use that
      process.env.CODEQL_REGISTRIES_AUTH ?? registriesAuthTokens,
    qlconfigFile,
  };
}

function createRegistriesBlock(registries: RegistryConfigWithCredentials[]): {
  registries: RegistryConfigNoCredentials[];
} {
  if (
    !Array.isArray(registries) ||
    registries.some((r) => !r.url || !r.packages)
  ) {
    throw new ConfigurationError(
      "Invalid 'registries' input. Must be an array of objects with 'url' and 'packages' properties.",
    );
  }

  // be sure to remove the `token` field from the registry before writing it to disk.
  const safeRegistries = registries.map((registry) => ({
    // ensure the url ends with a slash to avoid a bug in the CLI 2.10.4
    url: !registry?.url.endsWith("/") ? `${registry.url}/` : registry.url,
    packages: registry.packages,
    kind: registry.kind,
  }));
  const qlconfig = {
    registries: safeRegistries,
  };
  return qlconfig;
}

/**
 * Create a temporary environment based on the existing environment and overridden
 * by the given environment variables that are passed in as arguments.
 *
 * Use this new environment in the context of the given operation. After completing
 * the operation, restore the original environment.
 *
 * This function does not support un-setting environment variables.
 *
 * @param env
 * @param operation
 */
export async function wrapEnvironment(
  env: Record<string, string | undefined>,
  operation: () => Promise<void>,
) {
  // Remember the original env
  const oldEnv = { ...process.env };

  // Set the new env
  for (const [key, value] of Object.entries(env)) {
    // Ignore undefined keys
    if (value !== undefined) {
      process.env[key] = value;
    }
  }

  try {
    // Run the operation
    await operation();
  } finally {
    // Restore the old env
    for (const [key, value] of Object.entries(oldEnv)) {
      process.env[key] = value;
    }
  }
}

// Exported for testing
export async function parseBuildModeInput(
  input: string | undefined,
  languages: Language[],
  features: FeatureEnablement,
  logger: Logger,
): Promise<BuildMode | undefined> {
  if (input === undefined) {
    return undefined;
  }

  if (!Object.values(BuildMode).includes(input as BuildMode)) {
    throw new ConfigurationError(
      `Invalid build mode: '${input}'. Supported build modes are: ${Object.values(
        BuildMode,
      ).join(", ")}.`,
    );
  }

  if (
    languages.includes(Language.csharp) &&
    (await features.getValue(Feature.DisableCsharpBuildless))
  ) {
    logger.warning(
      "Scanning C# code without a build is temporarily unavailable. Falling back to 'autobuild' build mode.",
    );
    return BuildMode.Autobuild;
  }

  if (
    languages.includes(Language.java) &&
    (await features.getValue(Feature.DisableJavaBuildlessEnabled))
  ) {
    logger.warning(
      "Scanning Java code without a build is temporarily unavailable. Falling back to 'autobuild' build mode.",
    );
    return BuildMode.Autobuild;
  }
  return input as BuildMode;
}
