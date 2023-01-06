import * as fs from "fs";
import * as path from "path";
// We need to import `performance` on Node 12
import { performance } from "perf_hooks";

import * as yaml from "js-yaml";
import * as semver from "semver";

import * as api from "./api-client";
import {
  CodeQL,
  CODEQL_VERSION_GHES_PACK_DOWNLOAD,
  CODEQL_VERSION_ML_POWERED_QUERIES_WINDOWS,
  ResolveQueriesOutput,
} from "./codeql";
import * as externalQueries from "./external-queries";
import { Feature, FeatureEnablement } from "./feature-flags";
import {
  Language,
  LanguageOrAlias,
  parseLanguage,
  resolveAlias,
} from "./languages";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import { downloadTrapCaches } from "./trap-caching";
import {
  codeQlVersionAbove,
  getMlPoweredJsQueriesPack,
  GitHubVersion,
  logCodeScanningConfigInCli,
  ML_POWERED_JS_QUERIES_PACK_NAME,
  useCodeScanningConfigInCli,
} from "./util";

// Property names from the user-supplied config file.
const NAME_PROPERTY = "name";
const DISABLE_DEFAULT_QUERIES_PROPERTY = "disable-default-queries";
const QUERIES_PROPERTY = "queries";
const QUERIES_USES_PROPERTY = "uses";
const PATHS_IGNORE_PROPERTY = "paths-ignore";
const PATHS_PROPERTY = "paths";
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
}

interface ExcludeQueryFilter {
  exclude: Record<string, string[] | string>;
}

interface IncludeQueryFilter {
  include: Record<string, string[] | string>;
}

export type QuerySuitePackEntry = {
  version?: string;
} & (
  | {
      qlpack: string;
    }
  | {
      from?: string;
      query?: string;
      queries?: string;
      apply?: string;
    }
);

export type QuerySuiteEntry = QuerySuitePackEntry | QueryFilter;

/**
 * Lists of query files for each language.
 * Will only contain .ql files and not other kinds of files,
 * and all file paths will be absolute.
 *
 * The queries are split between ones from a builtin suite
 * and custom queries from unknown locations. This allows us to treat
 * them separately if we want to, for example to measure performance.
 */
type Queries = {
  [language: string]: {
    /** Queries from one of the builtin suites */
    builtin: string[];

    /** Custom queries, from a non-standard location */
    custom: QueriesWithSearchPath[];
  };
};

/**
 * Contains some information about a user-defined query.
 */
export interface QueriesWithSearchPath {
  /** Additional search path to use when running these queries. */
  searchPath: string;

  /** Array of absolute paths to a .ql file containing the queries. */
  queries: string[];
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
   * Map from language to query files.
   */
  queries: Queries;
  /**
   * List of paths to ignore from analysis.
   */
  pathsIgnore: string[];
  /**
   * List of paths to include in analysis.
   */
  paths: string[];
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
   * Version of GHES that we have determined that we are talking to, or undefined
   * if talking to github.com or GitHub AE.
   */
  gitHubVersion: GitHubVersion;
  /**
   * The location where CodeQL databases should be stored.
   */
  dbLocation: string;
  /**
   * List of packages, separated by language to download before any analysis.
   */
  packs: Packs;
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
  /**
   * Whether we injected ML queries into this configuration.
   */
  injectedMlQueries: boolean;
}

/**
 * The default, empty augmentation properties. This is most useeful
 * for tests.
 */
export const defaultAugmentationProperties: AugmentationProperties = {
  queriesInputCombines: false,
  packsInputCombines: false,
  injectedMlQueries: false,
  packsInput: undefined,
  queriesInput: undefined,
};
export type Packs = Partial<Record<Language, string[]>>;

export interface Pack {
  name: string;
  version?: string;
  path?: string;
}

/**
 * A list of queries from https://github.com/github/codeql that
 * we don't want to run. Disabling them here is a quicker alternative to
 * disabling them in the code scanning query suites. Queries should also
 * be disabled in the suites, and removed from this list here once the
 * bundle is updated to make those suite changes live.
 *
 * Format is a map from language to an array of path suffixes of .ql files.
 */
const DISABLED_BUILTIN_QUERIES: { [language: string]: string[] } = {
  csharp: [
    "ql/src/Security Features/CWE-937/VulnerablePackage.ql",
    "ql/src/Security Features/CWE-451/MissingXFrameOptions.ql",
  ],
};

function queryIsDisabled(language, query): boolean {
  return (DISABLED_BUILTIN_QUERIES[language] || []).some((disabledQuery) =>
    query.endsWith(disabledQuery)
  );
}

/**
 * Asserts that the noDeclaredLanguage and multipleDeclaredLanguages fields are
 * both empty and errors if they are not.
 */
function validateQueries(resolvedQueries: ResolveQueriesOutput) {
  const noDeclaredLanguage = resolvedQueries.noDeclaredLanguage;
  const noDeclaredLanguageQueries = Object.keys(noDeclaredLanguage);
  if (noDeclaredLanguageQueries.length !== 0) {
    throw new Error(
      `${
        "The following queries do not declare a language. " +
        "Their qlpack.yml files are either missing or is invalid.\n"
      }${noDeclaredLanguageQueries.join("\n")}`
    );
  }

  const multipleDeclaredLanguages = resolvedQueries.multipleDeclaredLanguages;
  const multipleDeclaredLanguagesQueries = Object.keys(
    multipleDeclaredLanguages
  );
  if (multipleDeclaredLanguagesQueries.length !== 0) {
    throw new Error(
      `${
        "The following queries declare multiple languages. " +
        "Their qlpack.yml files are either missing or is invalid.\n"
      }${multipleDeclaredLanguagesQueries.join("\n")}`
    );
  }
}

/**
 * Run 'codeql resolve queries' and add the results to resultMap
 *
 * If a checkout path is given then the queries are assumed to be custom queries
 * and an error will be thrown if there is anything invalid about the queries.
 * If a checkout path is not given then the queries are assumed to be builtin
 * queries, and error checking will be suppressed.
 */
async function runResolveQueries(
  codeQL: CodeQL,
  resultMap: Queries,
  toResolve: string[],
  extraSearchPath: string | undefined
) {
  const resolvedQueries = await codeQL.resolveQueries(
    toResolve,
    extraSearchPath
  );

  if (extraSearchPath !== undefined) {
    validateQueries(resolvedQueries);
  }

  for (const [language, queryPaths] of Object.entries(
    resolvedQueries.byLanguage
  )) {
    if (resultMap[language] === undefined) {
      resultMap[language] = {
        builtin: [],
        custom: [],
      };
    }
    const queries = Object.keys(queryPaths).filter(
      (q) => !queryIsDisabled(language, q)
    );
    if (extraSearchPath !== undefined) {
      resultMap[language].custom.push({
        searchPath: extraSearchPath,
        queries,
      });
    } else {
      resultMap[language].builtin.push(...queries);
    }
  }
}

/**
 * Get the set of queries included by default.
 */
async function addDefaultQueries(
  codeQL: CodeQL,
  languages: string[],
  resultMap: Queries
) {
  const suites = languages.map((l) => `${l}-code-scanning.qls`);
  await runResolveQueries(codeQL, resultMap, suites, undefined);
}

// The set of acceptable values for built-in suites from the codeql bundle
const builtinSuites = ["security-extended", "security-and-quality"] as const;

/**
 * Determine the set of queries associated with suiteName's suites and add them to resultMap.
 * Throws an error if suiteName is not a valid builtin suite.
 * May inject ML queries, and the return value will declare if this was done.
 */
async function addBuiltinSuiteQueries(
  languages: string[],
  codeQL: CodeQL,
  resultMap: Queries,
  packs: Packs,
  suiteName: string,
  featureEnablement: FeatureEnablement,
  configFile?: string
): Promise<boolean> {
  let injectedMlQueries = false;
  const found = builtinSuites.find((suite) => suite === suiteName);
  if (!found) {
    throw new Error(getQueryUsesInvalid(configFile, suiteName));
  }

  // If we're running the JavaScript security-extended analysis (or a superset of it), the repo is
  // opted into the ML-powered queries beta, and a user hasn't already added the ML-powered query
  // pack, then add the ML-powered query pack so that we run ML-powered queries.
  if (
    // Only run ML-powered queries on Windows if we have a CLI that supports it.
    (process.platform !== "win32" ||
      (await codeQlVersionAbove(
        codeQL,
        CODEQL_VERSION_ML_POWERED_QUERIES_WINDOWS
      ))) &&
    languages.includes("javascript") &&
    (found === "security-extended" || found === "security-and-quality") &&
    !packs.javascript?.some(isMlPoweredJsQueriesPack) &&
    (await featureEnablement.getValue(Feature.MlPoweredQueriesEnabled, codeQL))
  ) {
    if (!packs.javascript) {
      packs.javascript = [];
    }
    packs.javascript.push(await getMlPoweredJsQueriesPack(codeQL));
    injectedMlQueries = true;
  }

  const suites = languages.map((l) => `${l}-${suiteName}.qls`);
  await runResolveQueries(codeQL, resultMap, suites, undefined);
  return injectedMlQueries;
}

function isMlPoweredJsQueriesPack(pack: string) {
  return parsePacksSpecification(pack).name === ML_POWERED_JS_QUERIES_PACK_NAME;
}

/**
 * Retrieve the set of queries at localQueryPath and add them to resultMap.
 */
async function addLocalQueries(
  codeQL: CodeQL,
  resultMap: Queries,
  localQueryPath: string,
  workspacePath: string,
  configFile?: string
) {
  // Resolve the local path against the workspace so that when this is
  // passed to codeql it resolves to exactly the path we expect it to resolve to.
  let absoluteQueryPath = path.join(workspacePath, localQueryPath);

  // Check the file exists
  if (!fs.existsSync(absoluteQueryPath)) {
    throw new Error(getLocalPathDoesNotExist(configFile, localQueryPath));
  }

  // Call this after checking file exists, because it'll fail if file doesn't exist
  absoluteQueryPath = fs.realpathSync(absoluteQueryPath);

  // Check the local path doesn't jump outside the repo using '..' or symlinks
  if (
    !(absoluteQueryPath + path.sep).startsWith(
      fs.realpathSync(workspacePath) + path.sep
    )
  ) {
    throw new Error(
      getLocalPathOutsideOfRepository(configFile, localQueryPath)
    );
  }

  const extraSearchPath = workspacePath;

  await runResolveQueries(
    codeQL,
    resultMap,
    [absoluteQueryPath],
    extraSearchPath
  );
}

/**
 * Retrieve the set of queries at the referenced remote repo and add them to resultMap.
 */
async function addRemoteQueries(
  codeQL: CodeQL,
  resultMap: Queries,
  queryUses: string,
  tempDir: string,
  apiDetails: api.GitHubApiExternalRepoDetails,
  logger: Logger,
  configFile?: string
) {
  let tok = queryUses.split("@");
  if (tok.length !== 2) {
    throw new Error(getQueryUsesInvalid(configFile, queryUses));
  }

  const ref = tok[1];

  tok = tok[0].split("/");
  // The first token is the owner
  // The second token is the repo
  // The rest is a path, if there is more than one token combine them to form the full path
  if (tok.length < 2) {
    throw new Error(getQueryUsesInvalid(configFile, queryUses));
  }
  // Check none of the parts of the repository name are empty
  if (tok[0].trim() === "" || tok[1].trim() === "") {
    throw new Error(getQueryUsesInvalid(configFile, queryUses));
  }
  const nwo = `${tok[0]}/${tok[1]}`;

  // Checkout the external repository
  const checkoutPath = await externalQueries.checkoutExternalRepository(
    nwo,
    ref,
    apiDetails,
    tempDir,
    logger
  );

  const queryPath =
    tok.length > 2
      ? path.join(checkoutPath, tok.slice(2).join("/"))
      : checkoutPath;

  await runResolveQueries(codeQL, resultMap, [queryPath], checkoutPath);
}

/**
 * Parse a query 'uses' field to a discrete set of query files and update resultMap.
 *
 * The logic for parsing the string is based on what actions does for
 * parsing the 'uses' actions in the workflow file. So it can handle
 * local paths starting with './', or references to remote repos, or
 * a finite set of hardcoded terms for builtin suites.
 *
 * This may inject ML queries into the packs to use, and the return value will
 * declare if this was done.
 *
 * @returns whether or not we injected ML queries into the packs
 */
async function parseQueryUses(
  languages: string[],
  codeQL: CodeQL,
  resultMap: Queries,
  packs: Packs,
  queryUses: string,
  tempDir: string,
  workspacePath: string,
  apiDetails: api.GitHubApiExternalRepoDetails,
  featureEnablement: FeatureEnablement,
  logger: Logger,
  configFile?: string
): Promise<boolean> {
  queryUses = queryUses.trim();
  if (queryUses === "") {
    throw new Error(getQueryUsesInvalid(configFile));
  }

  // Check for the local path case before we start trying to parse the repository name
  if (queryUses.startsWith("./")) {
    await addLocalQueries(
      codeQL,
      resultMap,
      queryUses.slice(2),
      workspacePath,
      configFile
    );
    return false;
  }

  // Check for one of the builtin suites
  if (queryUses.indexOf("/") === -1 && queryUses.indexOf("@") === -1) {
    return await addBuiltinSuiteQueries(
      languages,
      codeQL,
      resultMap,
      packs,
      queryUses,
      featureEnablement,
      configFile
    );
  }

  // Otherwise, must be a reference to another repo.
  // If config parsing is handled in CLI, then this repo will be downloaded
  // later by the CLI.
  if (!(await useCodeScanningConfigInCli(codeQL, featureEnablement))) {
    await addRemoteQueries(
      codeQL,
      resultMap,
      queryUses,
      tempDir,
      apiDetails,
      logger,
      configFile
    );
  }
  return false;
}

// Regex validating stars in paths or paths-ignore entries.
// The intention is to only allow ** to appear when immediately
// preceded and followed by a slash.
const pathStarsRegex = /.*(?:\*\*[^/].*|\*\*$|[^/]\*\*.*)/;

// Characters that are supported by filters in workflows, but not by us.
// See https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions#filter-pattern-cheat-sheet
const filterPatternCharactersRegex = /.*[?+[\]!].*/;

// Checks that a paths of paths-ignore entry is valid, possibly modifying it
// to make it valid, or if not possible then throws an error.
export function validateAndSanitisePath(
  originalPath: string,
  propertyName: string,
  configFile: string,
  logger: Logger
): string {
  // Take a copy so we don't modify the original path, so we can still construct error messages
  let newPath = originalPath;

  // All paths are relative to the src root, so strip off leading slashes.
  while (newPath.charAt(0) === "/") {
    newPath = newPath.substring(1);
  }

  // Trailing ** are redundant, so strip them off
  if (newPath.endsWith("/**")) {
    newPath = newPath.substring(0, newPath.length - 2);
  }

  // An empty path is not allowed as it's meaningless
  if (newPath === "") {
    throw new Error(
      getConfigFilePropertyError(
        configFile,
        propertyName,
        `"${originalPath}" is not an invalid path. ` +
          `It is not necessary to include it, and it is not allowed to exclude it.`
      )
    );
  }

  // Check for illegal uses of **
  if (newPath.match(pathStarsRegex)) {
    throw new Error(
      getConfigFilePropertyError(
        configFile,
        propertyName,
        `"${originalPath}" contains an invalid "**" wildcard. ` +
          `They must be immediately preceded and followed by a slash as in "/**/", or come at the start or end.`
      )
    );
  }

  // Check for other regex characters that we don't support.
  // Output a warning so the user knows, but otherwise continue normally.
  if (newPath.match(filterPatternCharactersRegex)) {
    logger.warning(
      getConfigFilePropertyError(
        configFile,
        propertyName,
        `"${originalPath}" contains an unsupported character. ` +
          `The filter pattern characters ?, +, [, ], ! are not supported and will be matched literally.`
      )
    );
  }

  // Ban any uses of backslash for now.
  // This may not play nicely with project layouts.
  // This restriction can be lifted later if we determine they are ok.
  if (newPath.indexOf("\\") !== -1) {
    throw new Error(
      getConfigFilePropertyError(
        configFile,
        propertyName,
        `"${originalPath}" contains an "\\" character. These are not allowed in filters. ` +
          `If running on windows we recommend using "/" instead for path filters.`
      )
    );
  }

  return newPath;
}

// An undefined configFile in some of these functions indicates that
// the property was in a workflow file, not a config file

export function getNameInvalid(configFile: string): string {
  return getConfigFilePropertyError(
    configFile,
    NAME_PROPERTY,
    "must be a non-empty string"
  );
}

export function getDisableDefaultQueriesInvalid(configFile: string): string {
  return getConfigFilePropertyError(
    configFile,
    DISABLE_DEFAULT_QUERIES_PROPERTY,
    "must be a boolean"
  );
}

export function getQueriesInvalid(configFile: string): string {
  return getConfigFilePropertyError(
    configFile,
    QUERIES_PROPERTY,
    "must be an array"
  );
}

export function getQueriesMissingUses(configFile: string): string {
  return getConfigFilePropertyError(
    configFile,
    QUERIES_PROPERTY,
    "must be an array, with each entry having a 'uses' property"
  );
}

export function getQueryUsesInvalid(
  configFile: string | undefined,
  queryUses?: string
): string {
  return getConfigFilePropertyError(
    configFile,
    `${QUERIES_PROPERTY}.${QUERIES_USES_PROPERTY}`,
    `must be a built-in suite (${builtinSuites.join(
      " or "
    )}), a relative path, or be of the form "owner/repo[/path]@ref"${
      queryUses !== undefined ? `\n Found: ${queryUses}` : ""
    }`
  );
}

export function getPathsIgnoreInvalid(configFile: string): string {
  return getConfigFilePropertyError(
    configFile,
    PATHS_IGNORE_PROPERTY,
    "must be an array of non-empty strings"
  );
}

export function getPathsInvalid(configFile: string): string {
  return getConfigFilePropertyError(
    configFile,
    PATHS_PROPERTY,
    "must be an array of non-empty strings"
  );
}

function getPacksRequireLanguage(lang: string, configFile: string): string {
  return getConfigFilePropertyError(
    configFile,
    PACKS_PROPERTY,
    `has "${lang}", but it is not a valid language.`
  );
}

export function getPacksInvalidSplit(configFile: string): string {
  return getConfigFilePropertyError(
    configFile,
    PACKS_PROPERTY,
    "must split packages by language"
  );
}

export function getPacksInvalid(configFile: string): string {
  return getConfigFilePropertyError(
    configFile,
    PACKS_PROPERTY,
    "must be an array of non-empty strings"
  );
}

export function getPacksStrInvalid(
  packStr: string,
  configFile?: string
): string {
  return configFile
    ? getConfigFilePropertyError(
        configFile,
        PACKS_PROPERTY,
        `"${packStr}" is not a valid pack`
      )
    : `"${packStr}" is not a valid pack`;
}

export function getLocalPathOutsideOfRepository(
  configFile: string | undefined,
  localPath: string
): string {
  return getConfigFilePropertyError(
    configFile,
    `${QUERIES_PROPERTY}.${QUERIES_USES_PROPERTY}`,
    `is invalid as the local path "${localPath}" is outside of the repository`
  );
}

export function getLocalPathDoesNotExist(
  configFile: string | undefined,
  localPath: string
): string {
  return getConfigFilePropertyError(
    configFile,
    `${QUERIES_PROPERTY}.${QUERIES_USES_PROPERTY}`,
    `is invalid as the local path "${localPath}" does not exist in the repository`
  );
}

export function getConfigFileOutsideWorkspaceErrorMessage(
  configFile: string
): string {
  return `The configuration file "${configFile}" is outside of the workspace`;
}

export function getConfigFileDoesNotExistErrorMessage(
  configFile: string
): string {
  return `The configuration file "${configFile}" does not exist`;
}

export function getConfigFileRepoFormatInvalidMessage(
  configFile: string
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
  error: string
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
  return `Did not recognise the following languages: ${languages.join(", ")}`;
}

/**
 * Gets the set of languages in the current repository that are
 * scannable by CodeQL.
 */
export async function getLanguagesInRepo(
  repository: RepositoryNwo,
  logger: Logger
): Promise<LanguageOrAlias[]> {
  logger.debug(`GitHub repo ${repository.owner} ${repository.repo}`);
  const response = await api.getApiClient().repos.listLanguages({
    owner: repository.owner,
    repo: repository.repo,
  });

  logger.debug(`Languages API response: ${JSON.stringify(response)}`);

  // The GitHub API is going to return languages in order of popularity,
  // When we pick a language to autobuild we want to pick the most popular traced language
  // Since sets in javascript maintain insertion order, using a set here and then splatting it
  // into an array gives us an array of languages ordered by popularity
  const languages: Set<LanguageOrAlias> = new Set();
  for (const lang of Object.keys(response.data)) {
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
  logger: Logger
): Promise<Language[]> {
  // Obtain languages without filtering them.
  const { rawLanguages, autodetected } = await getRawLanguages(
    languagesInput,
    repository,
    logger
  );

  let languages = rawLanguages.map(resolveAlias);

  if (autodetected) {
    const availableLanguages = await codeQL.resolveLanguages();
    languages = languages.filter((value) => value in availableLanguages);
    logger.info(`Automatically detected languages: ${languages.join(", ")}`);
  } else {
    logger.info(`Languages from configuration: ${languages.join(", ")}`);
  }

  // If the languages parameter was not given and no languages were
  // detected then fail here as this is a workflow configuration error.
  if (languages.length === 0) {
    throw new Error(getNoLanguagesError());
  }

  // Make sure they are supported
  const parsedLanguages: Language[] = [];
  const unknownLanguages: string[] = [];
  for (const language of languages) {
    // We know this is not an alias since we resolved it above.
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
    throw new Error(getUnknownLanguagesError(unknownLanguages));
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
  logger: Logger
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

async function addQueriesAndPacksFromWorkflow(
  codeQL: CodeQL,
  queriesInput: string,
  languages: string[],
  resultMap: Queries,
  packs: Packs,
  tempDir: string,
  workspacePath: string,
  apiDetails: api.GitHubApiExternalRepoDetails,
  featureEnablement: FeatureEnablement,
  logger: Logger
): Promise<boolean> {
  let injectedMlQueries = false;
  queriesInput = queriesInput.trim();
  // "+" means "don't override config file" - see shouldAddConfigFileQueries
  queriesInput = queriesInput.replace(/^\+/, "");

  for (const query of queriesInput.split(",")) {
    const didInject = await parseQueryUses(
      languages,
      codeQL,
      resultMap,
      packs,
      query,
      tempDir,
      workspacePath,
      apiDetails,
      featureEnablement,
      logger
    );
    injectedMlQueries = injectedMlQueries || didInject;
  }

  return injectedMlQueries;
}

// Returns true if either no queries were provided in the workflow.
// or if the queries in the workflow were provided in "additive" mode,
// indicating that they shouldn't override the config queries but
// should instead be added in addition
function shouldAddConfigFileQueries(queriesInput: string | undefined): boolean {
  if (queriesInput) {
    return queriesInput.trimStart().slice(0, 1) === "+";
  }

  return true;
}

/**
 * Get the default config for when the user has not supplied one.
 */
export async function getDefaultConfig(
  languagesInput: string | undefined,
  rawQueriesInput: string | undefined,
  rawPacksInput: string | undefined,
  dbLocation: string | undefined,
  trapCachingEnabled: boolean,
  debugMode: boolean,
  debugArtifactName: string,
  debugDatabaseName: string,
  repository: RepositoryNwo,
  tempDir: string,
  codeQL: CodeQL,
  workspacePath: string,
  gitHubVersion: GitHubVersion,
  apiDetails: api.GitHubApiCombinedDetails,
  featureEnablement: FeatureEnablement,
  logger: Logger
): Promise<Config> {
  const languages = await getLanguages(
    codeQL,
    languagesInput,
    repository,
    logger
  );
  const queries: Queries = {};
  for (const language of languages) {
    queries[language] = {
      builtin: [],
      custom: [],
    };
  }
  await addDefaultQueries(codeQL, languages, queries);
  const augmentationProperties = calculateAugmentation(
    rawPacksInput,
    rawQueriesInput,
    languages
  );
  const packs = augmentationProperties.packsInput
    ? {
        [languages[0]]: augmentationProperties.packsInput,
      }
    : {};
  if (rawQueriesInput) {
    augmentationProperties.injectedMlQueries =
      await addQueriesAndPacksFromWorkflow(
        codeQL,
        rawQueriesInput,
        languages,
        queries,
        packs,
        tempDir,
        workspacePath,
        apiDetails,
        featureEnablement,
        logger
      );
  }

  const { trapCaches, trapCacheDownloadTime } = await downloadCacheWithTime(
    trapCachingEnabled,
    codeQL,
    languages,
    logger
  );

  return {
    languages,
    queries,
    pathsIgnore: [],
    paths: [],
    packs,
    originalUserInput: {},
    tempDir,
    codeQLCmd: codeQL.getPath(),
    gitHubVersion,
    dbLocation: dbLocationOrDefault(dbLocation, tempDir),
    debugMode,
    debugArtifactName,
    debugDatabaseName,
    augmentationProperties,
    trapCaches,
    trapCacheDownloadTime,
  };
}

async function downloadCacheWithTime(
  trapCachingEnabled: boolean,
  codeQL: CodeQL,
  languages: Language[],
  logger: Logger
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
async function loadConfig(
  languagesInput: string | undefined,
  rawQueriesInput: string | undefined,
  rawPacksInput: string | undefined,
  configFile: string,
  dbLocation: string | undefined,
  trapCachingEnabled: boolean,
  debugMode: boolean,
  debugArtifactName: string,
  debugDatabaseName: string,
  repository: RepositoryNwo,
  tempDir: string,
  codeQL: CodeQL,
  workspacePath: string,
  gitHubVersion: GitHubVersion,
  apiDetails: api.GitHubApiCombinedDetails,
  featureEnablement: FeatureEnablement,
  logger: Logger
): Promise<Config> {
  let parsedYAML: UserConfig;

  if (isLocal(configFile)) {
    // Treat the config file as relative to the workspace
    configFile = path.resolve(workspacePath, configFile);
    parsedYAML = getLocalConfig(configFile, workspacePath);
  } else {
    parsedYAML = await getRemoteConfig(configFile, apiDetails);
  }

  // Validate that the 'name' property is syntactically correct,
  // even though we don't use the value yet.
  if (NAME_PROPERTY in parsedYAML) {
    if (typeof parsedYAML[NAME_PROPERTY] !== "string") {
      throw new Error(getNameInvalid(configFile));
    }
    if (parsedYAML[NAME_PROPERTY]!.length === 0) {
      throw new Error(getNameInvalid(configFile));
    }
  }

  const languages = await getLanguages(
    codeQL,
    languagesInput,
    repository,
    logger
  );

  const queries: Queries = {};
  for (const language of languages) {
    queries[language] = {
      builtin: [],
      custom: [],
    };
  }
  const pathsIgnore: string[] = [];
  const paths: string[] = [];

  let disableDefaultQueries = false;
  if (DISABLE_DEFAULT_QUERIES_PROPERTY in parsedYAML) {
    if (typeof parsedYAML[DISABLE_DEFAULT_QUERIES_PROPERTY] !== "boolean") {
      throw new Error(getDisableDefaultQueriesInvalid(configFile));
    }
    disableDefaultQueries = parsedYAML[DISABLE_DEFAULT_QUERIES_PROPERTY]!;
  }
  if (!disableDefaultQueries) {
    await addDefaultQueries(codeQL, languages, queries);
  }
  const augmentationProperties = calculateAugmentation(
    rawPacksInput,
    rawQueriesInput,
    languages
  );
  const packs = parsePacks(
    parsedYAML[PACKS_PROPERTY] ?? {},
    rawPacksInput,
    augmentationProperties.packsInputCombines,
    languages,
    configFile,
    logger
  );

  // If queries were provided using `with` in the action configuration,
  // they should take precedence over the queries in the config file
  // unless they're prefixed with "+", in which case they supplement those
  // in the config file.
  if (rawQueriesInput) {
    augmentationProperties.injectedMlQueries =
      await addQueriesAndPacksFromWorkflow(
        codeQL,
        rawQueriesInput,
        languages,
        queries,
        packs,
        tempDir,
        workspacePath,
        apiDetails,
        featureEnablement,
        logger
      );
  }
  if (
    shouldAddConfigFileQueries(rawQueriesInput) &&
    QUERIES_PROPERTY in parsedYAML
  ) {
    const queriesArr = parsedYAML[QUERIES_PROPERTY];
    if (!Array.isArray(queriesArr)) {
      throw new Error(getQueriesInvalid(configFile));
    }
    for (const query of queriesArr) {
      if (typeof query[QUERIES_USES_PROPERTY] !== "string") {
        throw new Error(getQueriesMissingUses(configFile));
      }
      await parseQueryUses(
        languages,
        codeQL,
        queries,
        packs,
        query[QUERIES_USES_PROPERTY],
        tempDir,
        workspacePath,
        apiDetails,
        featureEnablement,
        logger,
        configFile
      );
    }
  }

  if (PATHS_IGNORE_PROPERTY in parsedYAML) {
    if (!Array.isArray(parsedYAML[PATHS_IGNORE_PROPERTY])) {
      throw new Error(getPathsIgnoreInvalid(configFile));
    }
    for (const ignorePath of parsedYAML[PATHS_IGNORE_PROPERTY]!) {
      if (typeof ignorePath !== "string" || ignorePath === "") {
        throw new Error(getPathsIgnoreInvalid(configFile));
      }
      pathsIgnore.push(
        validateAndSanitisePath(
          ignorePath,
          PATHS_IGNORE_PROPERTY,
          configFile,
          logger
        )
      );
    }
  }

  if (PATHS_PROPERTY in parsedYAML) {
    if (!Array.isArray(parsedYAML[PATHS_PROPERTY])) {
      throw new Error(getPathsInvalid(configFile));
    }
    for (const includePath of parsedYAML[PATHS_PROPERTY]!) {
      if (typeof includePath !== "string" || includePath === "") {
        throw new Error(getPathsInvalid(configFile));
      }
      paths.push(
        validateAndSanitisePath(includePath, PATHS_PROPERTY, configFile, logger)
      );
    }
  }

  const { trapCaches, trapCacheDownloadTime } = await downloadCacheWithTime(
    trapCachingEnabled,
    codeQL,
    languages,
    logger
  );

  return {
    languages,
    queries,
    pathsIgnore,
    paths,
    packs,
    originalUserInput: parsedYAML,
    tempDir,
    codeQLCmd: codeQL.getPath(),
    gitHubVersion,
    dbLocation: dbLocationOrDefault(dbLocation, tempDir),
    debugMode,
    debugArtifactName,
    debugDatabaseName,
    augmentationProperties,
    trapCaches,
    trapCacheDownloadTime,
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
  languages: Language[]
): AugmentationProperties {
  const packsInputCombines = shouldCombine(rawPacksInput);
  const packsInput = parsePacksFromInput(
    rawPacksInput,
    languages,
    packsInputCombines
  );
  const queriesInputCombines = shouldCombine(rawQueriesInput);
  const queriesInput = parseQueriesFromInput(
    rawQueriesInput,
    queriesInputCombines
  );

  return {
    injectedMlQueries: false, // filled in later
    packsInputCombines,
    packsInput: packsInput?.[languages[0]],
    queriesInput,
    queriesInputCombines,
  };
}

function parseQueriesFromInput(
  rawQueriesInput: string | undefined,
  queriesInputCombines: boolean
) {
  if (!rawQueriesInput) {
    return undefined;
  }

  const trimmedInput = queriesInputCombines
    ? rawQueriesInput.trim().slice(1).trim()
    : rawQueriesInput?.trim();
  if (queriesInputCombines && trimmedInput.length === 0) {
    throw new Error(
      getConfigFilePropertyError(
        undefined,
        "queries",
        "A '+' was used in the 'queries' input to specify that you wished to add some packs to your CodeQL analysis. However, no packs were specified. Please either remove the '+' or specify some packs."
      )
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
export function parsePacksFromConfig(
  packsByLanguage: string[] | Record<string, string[]>,
  languages: Language[],
  configFile: string,
  logger: Logger
): Packs {
  const packs = {};

  if (Array.isArray(packsByLanguage)) {
    if (languages.length === 1) {
      // single language analysis, so language is implicit
      packsByLanguage = {
        [languages[0]]: packsByLanguage,
      };
    } else {
      // this is an error since multi-language analysis requires
      // packs split by language
      throw new Error(getPacksInvalidSplit(configFile));
    }
  }

  for (const [lang, packsArr] of Object.entries(packsByLanguage)) {
    if (!Array.isArray(packsArr)) {
      throw new Error(getPacksInvalid(configFile));
    }
    if (!languages.includes(lang as Language)) {
      // This particular language is not being analyzed in this run.
      if (Language[lang as Language]) {
        logger.info(
          `Ignoring packs for ${lang} since this language is not being analyzed in this run.`
        );
        continue;
      } else {
        // This language is invalid, probably a misspelling
        throw new Error(getPacksRequireLanguage(configFile, lang));
      }
    }

    packs[lang] = packsArr.map((packStr) =>
      validatePackSpecification(packStr, configFile)
    );
  }
  return packs;
}

function parsePacksFromInput(
  rawPacksInput: string | undefined,
  languages: Language[],
  packsInputCombines: boolean
): Packs | undefined {
  if (!rawPacksInput?.trim()) {
    return undefined;
  }

  if (languages.length > 1) {
    throw new Error(
      "Cannot specify a 'packs' input in a multi-language analysis. Use a codeql-config.yml file instead and specify packs by language."
    );
  } else if (languages.length === 0) {
    throw new Error("No languages specified. Cannot process the packs input.");
  }

  rawPacksInput = rawPacksInput.trim();
  if (packsInputCombines) {
    rawPacksInput = rawPacksInput.trim().substring(1).trim();
    if (!rawPacksInput) {
      throw new Error(
        getConfigFilePropertyError(
          undefined,
          "packs",
          "A '+' was used in the 'packs' input to specify that you wished to add some packs to your CodeQL analysis. However, no packs were specified. Please either remove the '+' or specify some packs."
        )
      );
    }
  }

  return {
    [languages[0]]: rawPacksInput.split(",").reduce((packs, pack) => {
      packs.push(validatePackSpecification(pack, ""));
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
export function parsePacksSpecification(
  packStr: string,
  configFile?: string
): Pack {
  if (typeof packStr !== "string") {
    throw new Error(getPacksStrInvalid(packStr, configFile));
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
    packStr.length
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
    throw new Error(getPacksStrInvalid(packStr, configFile));
  }
  if (version) {
    try {
      new semver.Range(version);
    } catch (e) {
      // The range string is invalid. OK to ignore the caught error
      throw new Error(getPacksStrInvalid(packStr, configFile));
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
    throw new Error(getPacksStrInvalid(packStr, configFile));
  }

  if (!packPath && pathStart) {
    // 0 length path
    throw new Error(getPacksStrInvalid(packStr, configFile));
  }

  return {
    name: packName,
    version,
    path: packPath,
  };
}

export function prettyPrintPack(pack: Pack) {
  return `${pack.name}${pack.version ? `@${pack.version}` : ""}${
    pack.path ? `:${pack.path}` : ""
  }`;
}

export function validatePackSpecification(pack: string, configFile?: string) {
  return prettyPrintPack(parsePacksSpecification(pack, configFile));
}

// exported for testing
export function parsePacks(
  rawPacksFromConfig: string[] | Record<string, string[]>,
  rawPacksFromInput: string | undefined,
  packsInputCombines: boolean,
  languages: Language[],
  configFile: string,
  logger: Logger
): Packs {
  const packsFomConfig = parsePacksFromConfig(
    rawPacksFromConfig,
    languages,
    configFile,
    logger
  );

  const packsFromInput = parsePacksFromInput(
    rawPacksFromInput,
    languages,
    packsInputCombines
  );
  if (!packsFromInput) {
    return packsFomConfig;
  }
  if (!packsInputCombines) {
    if (!packsFromInput) {
      throw new Error(getPacksInvalid(configFile));
    }
    return packsFromInput;
  }

  return combinePacks(packsFromInput, packsFomConfig);
}

/**
 * The convention in this action is that an input value that is prefixed with a '+' will
 * be combined with the corresponding value in the config file.
 *
 * Without a '+', an input value will override the corresponding value in the config file.
 *
 * @param inputValue The input value to process.
 * @returns true if the input value should replace the corresponding value in the config file, false if it should be appended.
 */
function shouldCombine(inputValue?: string): boolean {
  return !!inputValue?.trim().startsWith("+");
}

function combinePacks(packs1: Packs, packs2: Packs): Packs {
  const packs = {};
  for (const lang of Object.keys(packs1)) {
    packs[lang] = packs1[lang].concat(packs2[lang] || []);
  }
  for (const lang of Object.keys(packs2)) {
    if (!packs[lang]) {
      packs[lang] = packs2[lang];
    }
  }
  return packs;
}

function dbLocationOrDefault(
  dbLocation: string | undefined,
  tempDir: string
): string {
  return dbLocation || path.resolve(tempDir, "codeql_databases");
}

/**
 * Load and return the config.
 *
 * This will parse the config from the user input if present, or generate
 * a default config. The parsed config is then stored to a known location.
 */
export async function initConfig(
  languagesInput: string | undefined,
  queriesInput: string | undefined,
  packsInput: string | undefined,
  registriesInput: string | undefined,
  configFile: string | undefined,
  dbLocation: string | undefined,
  trapCachingEnabled: boolean,
  debugMode: boolean,
  debugArtifactName: string,
  debugDatabaseName: string,
  repository: RepositoryNwo,
  tempDir: string,
  codeQL: CodeQL,
  workspacePath: string,
  gitHubVersion: GitHubVersion,
  apiDetails: api.GitHubApiCombinedDetails,
  featureEnablement: FeatureEnablement,
  logger: Logger
): Promise<Config> {
  let config: Config;

  // If no config file was provided create an empty one
  if (!configFile) {
    logger.debug("No configuration file was provided");
    config = await getDefaultConfig(
      languagesInput,
      queriesInput,
      packsInput,
      dbLocation,
      trapCachingEnabled,
      debugMode,
      debugArtifactName,
      debugDatabaseName,
      repository,
      tempDir,
      codeQL,
      workspacePath,
      gitHubVersion,
      apiDetails,
      featureEnablement,
      logger
    );
  } else {
    config = await loadConfig(
      languagesInput,
      queriesInput,
      packsInput,
      configFile,
      dbLocation,
      trapCachingEnabled,
      debugMode,
      debugArtifactName,
      debugDatabaseName,
      repository,
      tempDir,
      codeQL,
      workspacePath,
      gitHubVersion,
      apiDetails,
      featureEnablement,
      logger
    );
  }

  // When using the codescanning config in the CLI, pack downloads
  // happen in the CLI during the `database init` command, so no need
  // to download them here.
  await logCodeScanningConfigInCli(codeQL, featureEnablement, logger);

  if (!(await useCodeScanningConfigInCli(codeQL, featureEnablement))) {
    // The list of queries should not be empty for any language. If it is then
    // it is a user configuration error.
    // This check occurs in the CLI when it parses the config file.
    for (const language of config.languages) {
      const hasBuiltinQueries = config.queries[language]?.builtin.length > 0;
      const hasCustomQueries = config.queries[language]?.custom.length > 0;
      const hasPacks = (config.packs[language]?.length || 0) > 0;
      if (!hasPacks && !hasBuiltinQueries && !hasCustomQueries) {
        throw new Error(
          `Did not detect any queries to run for ${language}. ` +
            "Please make sure that the default queries are enabled, or you are specifying queries to run."
        );
      }
    }

    const registries = parseRegistries(registriesInput);
    await downloadPacks(
      codeQL,
      config.languages,
      config.packs,
      registries,
      apiDetails,
      config.tempDir,
      logger
    );
  }

  // Save the config so we can easily access it again in the future
  await saveConfig(config, logger);
  return config;
}

function parseRegistries(
  registriesInput: string | undefined
): RegistryConfigWithCredentials[] | undefined {
  try {
    return registriesInput
      ? (yaml.load(registriesInput) as RegistryConfigWithCredentials[])
      : undefined;
  } catch (e) {
    throw new Error("Invalid registries input. Must be a YAML string.");
  }
}

function isLocal(configPath: string): boolean {
  // If the path starts with ./, look locally
  if (configPath.indexOf("./") === 0) {
    return true;
  }

  return configPath.indexOf("@") === -1;
}

function getLocalConfig(configFile: string, workspacePath: string): UserConfig {
  // Error if the config file is now outside of the workspace
  if (!(configFile + path.sep).startsWith(workspacePath + path.sep)) {
    throw new Error(getConfigFileOutsideWorkspaceErrorMessage(configFile));
  }

  // Error if the file does not exist
  if (!fs.existsSync(configFile)) {
    throw new Error(getConfigFileDoesNotExistErrorMessage(configFile));
  }

  return yaml.load(fs.readFileSync(configFile, "utf8")) as UserConfig;
}

async function getRemoteConfig(
  configFile: string,
  apiDetails: api.GitHubApiCombinedDetails
): Promise<UserConfig> {
  // retrieve the various parts of the config location, and ensure they're present
  const format = new RegExp(
    "(?<owner>[^/]+)/(?<repo>[^/]+)/(?<path>[^@]+)@(?<ref>.*)"
  );
  const pieces = format.exec(configFile);
  // 5 = 4 groups + the whole expression
  if (pieces === null || pieces.groups === undefined || pieces.length < 5) {
    throw new Error(getConfigFileRepoFormatInvalidMessage(configFile));
  }

  const response = await api
    .getApiClientWithExternalAuth(apiDetails)
    .repos.getContent({
      owner: pieces.groups.owner,
      repo: pieces.groups.repo,
      path: pieces.groups.path,
      ref: pieces.groups.ref,
    });

  let fileContents: string;
  if ("content" in response.data && response.data.content !== undefined) {
    fileContents = response.data.content;
  } else if (Array.isArray(response.data)) {
    throw new Error(getConfigFileDirectoryGivenMessage(configFile));
  } else {
    throw new Error(getConfigFileFormatInvalidMessage(configFile));
  }

  return yaml.load(
    Buffer.from(fileContents, "base64").toString("binary")
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
  logger: Logger
): Promise<Config | undefined> {
  const configFile = getPathToParsedConfigFile(tempDir);
  if (!fs.existsSync(configFile)) {
    return undefined;
  }
  const configString = fs.readFileSync(configFile, "utf8");
  logger.debug("Loaded config:");
  logger.debug(configString);
  return JSON.parse(configString);
}

export async function downloadPacks(
  codeQL: CodeQL,
  languages: Language[],
  packs: Packs,
  registries: RegistryConfigWithCredentials[] | undefined,
  apiDetails: api.GitHubApiDetails,
  tmpDir: string,
  logger: Logger
) {
  let qlconfigFile: string | undefined;
  let registriesAuthTokens: string | undefined;
  if (registries) {
    if (
      !(await codeQlVersionAbove(codeQL, CODEQL_VERSION_GHES_PACK_DOWNLOAD))
    ) {
      throw new Error(
        `'registries' input is not supported on CodeQL versions less than ${CODEQL_VERSION_GHES_PACK_DOWNLOAD}.`
      );
    }

    // generate a qlconfig.yml file to hold the registry configs.
    const qlconfig = createRegistriesBlock(registries);
    qlconfigFile = path.join(tmpDir, "qlconfig.yml");
    fs.writeFileSync(qlconfigFile, yaml.dump(qlconfig), "utf8");

    registriesAuthTokens = registries
      .map((registry) => `${registry.url}=${registry.token}`)
      .join(",");
  }

  await wrapEnvironment(
    {
      GITHUB_TOKEN: apiDetails.auth,
      CODEQL_REGISTRIES_AUTH: registriesAuthTokens,
    },
    async () => {
      let numPacksDownloaded = 0;
      logger.startGroup("Downloading packs");
      for (const language of languages) {
        const packsWithVersion = packs[language];
        if (packsWithVersion?.length) {
          logger.info(`Downloading custom packs for ${language}`);
          const results = await codeQL.packDownload(
            packsWithVersion,
            qlconfigFile
          );
          numPacksDownloaded += results.packs.length;
          logger.info(
            `Downloaded: ${results.packs
              .map((r) => `${r.name}@${r.version || "latest"}`)
              .join(", ")}`
          );
        }
      }
      if (numPacksDownloaded > 0) {
        logger.info(
          `Downloaded ${numPacksDownloaded} ${packs === 1 ? "pack" : "packs"}`
        );
      } else {
        logger.info("No packs to download");
      }
      logger.endGroup();
    }
  );
}

function createRegistriesBlock(registries: RegistryConfigWithCredentials[]): {
  registries: RegistryConfigNoCredentials[];
} {
  if (
    !Array.isArray(registries) ||
    registries.some((r) => !r.url || !r.packages)
  ) {
    throw new Error(
      "Invalid 'registries' input. Must be an array of objects with 'url' and 'packages' properties."
    );
  }

  // be sure to remove the `token` field from the registry before writing it to disk.
  const safeRegistries = registries.map((registry) => ({
    // ensure the url ends with a slash to avoid a bug in the CLI 2.10.4
    url: !registry?.url.endsWith("/") ? `${registry.url}/` : registry.url,
    packages: registry.packages,
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
async function wrapEnvironment(
  env: Record<string, string | undefined>,
  operation: Function
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
