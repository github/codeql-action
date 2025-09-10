import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";

import * as yaml from "js-yaml";
import * as semver from "semver";

import { getActionVersion, isAnalyzingPullRequest } from "./actions-util";
import {
  AnalysisConfig,
  AnalysisKind,
  CodeQuality,
  codeQualityQueries,
  CodeScanning,
  parseAnalysisKinds,
} from "./analyses";
import * as api from "./api-client";
import { CachingKind, getCachingKind } from "./caching-utils";
import { type CodeQL } from "./codeql";
import { shouldPerformDiffInformedAnalysis } from "./diff-informed-analysis-utils";
import { Feature, FeatureEnablement } from "./feature-flags";
import { getGitRoot, isAnalyzingDefaultBranch } from "./git-utils";
import { KnownLanguage, Language } from "./languages";
import { Logger } from "./logging";
import {
  CODEQL_OVERLAY_MINIMUM_VERSION,
  OverlayDatabaseMode,
} from "./overlay-database-utils";
import { RepositoryNwo } from "./repository";
import { downloadTrapCaches } from "./trap-caching";
import {
  GitHubVersion,
  prettyPrintPack,
  ConfigurationError,
  BuildMode,
  codeQlVersionAtLeast,
  cloneObject,
  isDefined,
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
   * The version of the CodeQL Action that the configuration is for.
   */
  version: string;
  /**
   * Set of analysis kinds that are enabled.
   */
  analysisKinds: AnalysisKind[];
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
  /**
   * The configuration we computed by combining `originalUserInput` with `augmentationProperties`,
   * as well as adjustments made to it based on unsupported or required options.
   */
  computedConfig: UserConfig;

  /**
   * Partial map from languages to locations of TRAP caches for that language.
   * If a key is omitted, then TRAP caching should not be used for that language.
   */
  trapCaches: { [language: Language]: string };

  /**
   * Time taken to download TRAP caches. Used for status reporting.
   */
  trapCacheDownloadTime: number;

  /** A value indicating how dependency caching should be used. */
  dependencyCachingEnabled: CachingKind;

  /**
   * Extra query exclusions to append to the config.
   */
  extraQueryExclusions: ExcludeQueryFilter[];

  /**
   * The overlay database mode to use.
   */
  overlayDatabaseMode: OverlayDatabaseMode;

  /**
   * Whether to use caching for overlay databases. If it is true, the action
   * will upload the created overlay-base database to the actions cache, and
   * download an overlay-base database from the actions cache before it creates
   * a new overlay database. If it is false, the action assumes that the
   * workflow will be responsible for managing database storage and retrieval.
   *
   * This property has no effect unless `overlayDatabaseMode` is `Overlay` or
   * `OverlayBase`.
   */
  useOverlayDatabaseCaching: boolean;
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

export async function getSupportedLanguageMap(
  codeql: CodeQL,
): Promise<Record<string, string>> {
  const resolveResult = await codeql.betterResolveLanguages();
  const supportedLanguages: Record<string, string> = {};
  // Populate canonical language names
  for (const extractor of Object.keys(resolveResult.extractors)) {
    // Require the language to be a known language.
    // This is a temporary workaround since we have extractors that are not
    // supported languages, such as `csv`, `html`, `properties`, `xml`, and
    // `yaml`. We should replace this with a more robust solution in the future.
    if (KnownLanguage[extractor] !== undefined) {
      supportedLanguages[extractor] = extractor;
    }
  }
  // Populate language aliases
  if (resolveResult.aliases) {
    for (const [alias, extractor] of Object.entries(resolveResult.aliases)) {
      supportedLanguages[alias] = extractor;
    }
  }
  return supportedLanguages;
}

const baseWorkflowsPath = ".github/workflows";

/**
 * Determines if there exists a `.github/workflows` directory with at least
 * one file in it, which we use as an indicator that there are Actions
 * workflows in the workspace. This doesn't perfectly detect whether there
 * are actually workflows, but should be a good approximation.
 *
 * Alternatively, we could check specifically for yaml files, or call the
 * API to check if it knows about workflows.
 *
 * @returns True if the non-empty directory exists, false if not.
 */
export function hasActionsWorkflows(sourceRoot: string): boolean {
  const workflowsPath = path.resolve(sourceRoot, baseWorkflowsPath);
  const stats = fs.lstatSync(workflowsPath, { throwIfNoEntry: false });
  return (
    stats !== undefined &&
    stats.isDirectory() &&
    fs.readdirSync(workflowsPath).length > 0
  );
}

/**
 * Gets the set of languages in the current repository.
 */
export async function getRawLanguagesInRepo(
  repository: RepositoryNwo,
  sourceRoot: string,
  logger: Logger,
): Promise<string[]> {
  logger.debug(
    `Automatically detecting languages (${repository.owner}/${repository.repo})`,
  );
  const response = await api.getApiClient().rest.repos.listLanguages({
    owner: repository.owner,
    repo: repository.repo,
  });

  logger.debug(`Languages API response: ${JSON.stringify(response)}`);
  const result = Object.keys(response.data as Record<string, number>).map(
    (language) => language.trim().toLowerCase(),
  );

  if (hasActionsWorkflows(sourceRoot)) {
    logger.debug(`Found a .github/workflows directory`);
    result.push("actions");
  }

  logger.debug(`Raw languages in repository: ${result.join(", ")}`);

  return result;
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
  codeql: CodeQL,
  languagesInput: string | undefined,
  repository: RepositoryNwo,
  sourceRoot: string,
  logger: Logger,
): Promise<Language[]> {
  // Obtain languages without filtering them.
  const { rawLanguages, autodetected } = await getRawLanguages(
    languagesInput,
    repository,
    sourceRoot,
    logger,
  );

  const languageMap = await getSupportedLanguageMap(codeql);
  const languagesSet = new Set<Language>();
  const unknownLanguages: string[] = [];

  // Make sure they are supported
  for (const language of rawLanguages) {
    const extractorName = languageMap[language];
    if (extractorName === undefined) {
      unknownLanguages.push(language);
    } else {
      languagesSet.add(extractorName);
    }
  }

  const languages = Array.from(languagesSet);

  if (!autodetected && unknownLanguages.length > 0) {
    throw new ConfigurationError(getUnknownLanguagesError(unknownLanguages));
  }

  // If the languages parameter was not given and no languages were
  // detected then fail here as this is a workflow configuration error.
  if (languages.length === 0) {
    throw new ConfigurationError(getNoLanguagesError());
  }

  if (autodetected) {
    logger.info(`Autodetected languages: ${languages.join(", ")}`);
  } else {
    logger.info(`Languages from configuration: ${languages.join(", ")}`);
  }

  return languages;
}

export function getRawLanguagesNoAutodetect(
  languagesInput: string | undefined,
): string[] {
  return (languagesInput || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0);
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
  sourceRoot: string,
  logger: Logger,
): Promise<{
  rawLanguages: string[];
  autodetected: boolean;
}> {
  // If the user has specified languages, use those.
  const languagesFromInput = getRawLanguagesNoAutodetect(languagesInput);
  if (languagesFromInput.length > 0) {
    return { rawLanguages: languagesFromInput, autodetected: false };
  }
  // Otherwise, autodetect languages in the repository.
  return {
    rawLanguages: await getRawLanguagesInRepo(repository, sourceRoot, logger),
    autodetected: true,
  };
}

/** Inputs required to initialize a configuration. */
export interface InitConfigInputs {
  analysisKindsInput: string;
  languagesInput: string | undefined;
  queriesInput: string | undefined;
  qualityQueriesInput: string | undefined;
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
  sourceRoot: string;
  githubVersion: GitHubVersion;
  apiDetails: api.GitHubApiCombinedDetails;
  features: FeatureEnablement;
  logger: Logger;
}

/**
 * Initialise the CodeQL Action state, which includes the base configuration for the Action
 * and computes the configuration for the CodeQL CLI.
 */
export async function initActionState(
  {
    analysisKindsInput,
    languagesInput,
    queriesInput,
    qualityQueriesInput,
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
    sourceRoot,
    githubVersion,
    features,
    logger,
  }: InitConfigInputs,
  userConfig: UserConfig,
): Promise<Config> {
  const analysisKinds = await parseAnalysisKinds(analysisKindsInput);

  // For backwards compatibility, add Code Quality to the enabled analysis kinds
  // if an input to `quality-queries` was specified. We should remove this once
  // `quality-queries` is no longer used.
  if (
    !analysisKinds.includes(AnalysisKind.CodeQuality) &&
    qualityQueriesInput !== undefined
  ) {
    analysisKinds.push(AnalysisKind.CodeQuality);
  }

  const languages = await getLanguages(
    codeql,
    languagesInput,
    repository,
    sourceRoot,
    logger,
  );

  const buildMode = await parseBuildModeInput(
    buildModeInput,
    languages,
    features,
    logger,
  );

  const augmentationProperties = await calculateAugmentation(
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

  // Compute the full Code Scanning configuration that combines the configuration from the
  // configuration file / `config` input with other inputs, such as `queries`.
  const computedConfig = generateCodeScanningConfig(
    userConfig,
    augmentationProperties,
  );

  return {
    version: getActionVersion(),
    analysisKinds,
    languages,
    buildMode,
    originalUserInput: userConfig,
    computedConfig,
    tempDir,
    codeQLCmd: codeql.getPath(),
    gitHubVersion: githubVersion,
    dbLocation: dbLocationOrDefault(dbLocation, tempDir),
    debugMode,
    debugArtifactName,
    debugDatabaseName,
    trapCaches,
    trapCacheDownloadTime,
    dependencyCachingEnabled: getCachingKind(dependencyCachingEnabled),
    extraQueryExclusions: [],
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  };
}

async function downloadCacheWithTime(
  trapCachingEnabled: boolean,
  codeQL: CodeQL,
  languages: Language[],
  logger: Logger,
): Promise<{
  trapCaches: { [language: string]: string };
  trapCacheDownloadTime: number;
}> {
  let trapCaches: { [language: string]: string } = {};
  let trapCacheDownloadTime = 0;
  if (trapCachingEnabled) {
    const start = performance.now();
    trapCaches = await downloadTrapCaches(codeQL, languages, logger);
    trapCacheDownloadTime = performance.now() - start;
  }
  return { trapCaches, trapCacheDownloadTime };
}

async function loadUserConfig(
  configFile: string,
  workspacePath: string,
  apiDetails: api.GitHubApiCombinedDetails,
  tempDir: string,
): Promise<UserConfig> {
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
    return getLocalConfig(configFile);
  } else {
    return await getRemoteConfig(configFile, apiDetails);
  }
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
export async function calculateAugmentation(
  rawPacksInput: string | undefined,
  rawQueriesInput: string | undefined,
  languages: Language[],
): Promise<AugmentationProperties> {
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

const OVERLAY_ANALYSIS_FEATURES: Record<Language, Feature> = {
  actions: Feature.OverlayAnalysisActions,
  cpp: Feature.OverlayAnalysisCpp,
  csharp: Feature.OverlayAnalysisCsharp,
  go: Feature.OverlayAnalysisGo,
  java: Feature.OverlayAnalysisJava,
  javascript: Feature.OverlayAnalysisJavascript,
  python: Feature.OverlayAnalysisPython,
  ruby: Feature.OverlayAnalysisRuby,
  rust: Feature.OverlayAnalysisRust,
  swift: Feature.OverlayAnalysisSwift,
};

const OVERLAY_ANALYSIS_CODE_SCANNING_FEATURES: Record<Language, Feature> = {
  actions: Feature.OverlayAnalysisCodeScanningActions,
  cpp: Feature.OverlayAnalysisCodeScanningCpp,
  csharp: Feature.OverlayAnalysisCodeScanningCsharp,
  go: Feature.OverlayAnalysisCodeScanningGo,
  java: Feature.OverlayAnalysisCodeScanningJava,
  javascript: Feature.OverlayAnalysisCodeScanningJavascript,
  python: Feature.OverlayAnalysisCodeScanningPython,
  ruby: Feature.OverlayAnalysisCodeScanningRuby,
  rust: Feature.OverlayAnalysisCodeScanningRust,
  swift: Feature.OverlayAnalysisCodeScanningSwift,
};

async function isOverlayAnalysisFeatureEnabled(
  repository: RepositoryNwo,
  features: FeatureEnablement,
  codeql: CodeQL,
  languages: Language[],
  codeScanningConfig: UserConfig,
): Promise<boolean> {
  // TODO: Remove the repository owner check once support for overlay analysis
  // stabilizes, and no more backward-incompatible changes are expected.
  if (!["github", "dsp-testing"].includes(repository.owner)) {
    return false;
  }
  if (!(await features.getValue(Feature.OverlayAnalysis, codeql))) {
    return false;
  }
  let enableForCodeScanningOnly = false;
  for (const language of languages) {
    const feature = OVERLAY_ANALYSIS_FEATURES[language];
    if (feature && (await features.getValue(feature, codeql))) {
      continue;
    }
    const codeScanningFeature =
      OVERLAY_ANALYSIS_CODE_SCANNING_FEATURES[language];
    if (
      codeScanningFeature &&
      (await features.getValue(codeScanningFeature, codeql))
    ) {
      enableForCodeScanningOnly = true;
      continue;
    }
    return false;
  }
  if (enableForCodeScanningOnly) {
    // A code-scanning configuration runs only the (default) code-scanning suite
    // if the default queries are not disabled, and no packs, queries, or
    // query-filters are specified.
    return (
      codeScanningConfig["disable-default-queries"] !== true &&
      codeScanningConfig.packs === undefined &&
      codeScanningConfig.queries === undefined &&
      codeScanningConfig["query-filters"] === undefined
    );
  }
  return true;
}

/**
 * Calculate and validate the overlay database mode and caching to use.
 *
 * - If the environment variable `CODEQL_OVERLAY_DATABASE_MODE` is set, use it.
 *   In this case, the workflow is responsible for managing database storage and
 *   retrieval, and the action will not perform overlay database caching. Think
 *   of it as a "manual control" mode where the calling workflow is responsible
 *   for making sure that everything is set up correctly.
 * - Otherwise, if `Feature.OverlayAnalysis` is enabled, calculate the mode
 *   based on what we are analyzing. Think of it as a "automatic control" mode
 *   where the action will do the right thing by itself.
 *   - If we are analyzing a pull request, use `Overlay` with caching.
 *   - If we are analyzing the default branch, use `OverlayBase` with caching.
 * - Otherwise, use `None`.
 *
 * For `Overlay` and `OverlayBase`, the function performs further checks and
 * reverts to `None` if any check should fail.
 *
 * @returns An object containing the overlay database mode and whether the
 * action should perform overlay-base database caching.
 */
export async function getOverlayDatabaseMode(
  codeql: CodeQL,
  repository: RepositoryNwo,
  features: FeatureEnablement,
  languages: Language[],
  sourceRoot: string,
  buildMode: BuildMode | undefined,
  codeScanningConfig: UserConfig,
  logger: Logger,
): Promise<{
  overlayDatabaseMode: OverlayDatabaseMode;
  useOverlayDatabaseCaching: boolean;
}> {
  let overlayDatabaseMode = OverlayDatabaseMode.None;
  let useOverlayDatabaseCaching = false;

  const modeEnv = process.env.CODEQL_OVERLAY_DATABASE_MODE;
  // Any unrecognized CODEQL_OVERLAY_DATABASE_MODE value will be ignored and
  // treated as if the environment variable was not set.
  if (
    modeEnv === OverlayDatabaseMode.Overlay ||
    modeEnv === OverlayDatabaseMode.OverlayBase ||
    modeEnv === OverlayDatabaseMode.None
  ) {
    overlayDatabaseMode = modeEnv;
    logger.info(
      `Setting overlay database mode to ${overlayDatabaseMode} ` +
        "from the CODEQL_OVERLAY_DATABASE_MODE environment variable.",
    );
  } else if (
    await isOverlayAnalysisFeatureEnabled(
      repository,
      features,
      codeql,
      languages,
      codeScanningConfig,
    )
  ) {
    if (isAnalyzingPullRequest()) {
      overlayDatabaseMode = OverlayDatabaseMode.Overlay;
      useOverlayDatabaseCaching = true;
      logger.info(
        `Setting overlay database mode to ${overlayDatabaseMode} ` +
          "with caching because we are analyzing a pull request.",
      );
    } else if (await isAnalyzingDefaultBranch()) {
      overlayDatabaseMode = OverlayDatabaseMode.OverlayBase;
      useOverlayDatabaseCaching = true;
      logger.info(
        `Setting overlay database mode to ${overlayDatabaseMode} ` +
          "with caching because we are analyzing the default branch.",
      );
    }
  }

  const nonOverlayAnalysis = {
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
  };

  if (overlayDatabaseMode === OverlayDatabaseMode.None) {
    return nonOverlayAnalysis;
  }

  if (
    buildMode !== BuildMode.None &&
    (
      await Promise.all(
        languages.map(async (l) => await codeql.isTracedLanguage(l)),
      )
    ).some(Boolean)
  ) {
    logger.warning(
      `Cannot build an ${overlayDatabaseMode} database because ` +
        `build-mode is set to "${buildMode}" instead of "none". ` +
        "Falling back to creating a normal full database instead.",
    );
    return nonOverlayAnalysis;
  }
  if (!(await codeQlVersionAtLeast(codeql, CODEQL_OVERLAY_MINIMUM_VERSION))) {
    logger.warning(
      `Cannot build an ${overlayDatabaseMode} database because ` +
        `the CodeQL CLI is older than ${CODEQL_OVERLAY_MINIMUM_VERSION}. ` +
        "Falling back to creating a normal full database instead.",
    );
    return nonOverlayAnalysis;
  }
  if ((await getGitRoot(sourceRoot)) === undefined) {
    logger.warning(
      `Cannot build an ${overlayDatabaseMode} database because ` +
        `the source root "${sourceRoot}" is not inside a git repository. ` +
        "Falling back to creating a normal full database instead.",
    );
    return nonOverlayAnalysis;
  }

  return {
    overlayDatabaseMode,
    useOverlayDatabaseCaching,
  };
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
 * Checks whether the given `UserConfig` contains any query customisations.
 *
 * @returns Returns `true` if the `UserConfig` customises which queries are run.
 */
function hasQueryCustomisation(userConfig: UserConfig): boolean {
  return (
    isDefined(userConfig["disable-default-queries"]) ||
    isDefined(userConfig.queries) ||
    isDefined(userConfig["query-filters"])
  );
}

/**
 * Load and return the config.
 *
 * This will parse the config from the user input if present, or generate
 * a default config. The parsed config is then stored to a known location.
 */
export async function initConfig(inputs: InitConfigInputs): Promise<Config> {
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

  let userConfig: UserConfig = {};
  if (!inputs.configFile) {
    logger.debug("No configuration file was provided");
  } else {
    logger.debug(`Using configuration file: ${inputs.configFile}`);
    userConfig = await loadUserConfig(
      inputs.configFile,
      inputs.workspacePath,
      inputs.apiDetails,
      tempDir,
    );
  }

  const config = await initActionState(inputs, userConfig);

  // If Code Quality analysis is the only enabled analysis kind, then we will initialise
  // the database for Code Quality. That entails disabling the default queries and only
  // running quality queries. We do not currently support query customisations in that case.
  if (config.analysisKinds.length === 1 && isCodeQualityEnabled(config)) {
    // Warn if any query customisations are present in the computed configuration.
    if (hasQueryCustomisation(config.computedConfig)) {
      throw new ConfigurationError(
        "Query customizations are unsupported, because only `code-quality` analysis is enabled.",
      );
    }

    const queries = codeQualityQueries.map((v) => ({ uses: v }));

    // Set the query customisation options for Code Quality only analysis.
    config.computedConfig["disable-default-queries"] = true;
    config.computedConfig.queries = queries;
    config.computedConfig["query-filters"] = [];
  }

  // The choice of overlay database mode depends on the selection of languages
  // and queries, which in turn depends on the user config and the augmentation
  // properties. So we need to calculate the overlay database mode after the
  // rest of the config has been populated.
  const { overlayDatabaseMode, useOverlayDatabaseCaching } =
    await getOverlayDatabaseMode(
      inputs.codeql,
      inputs.repository,
      inputs.features,
      config.languages,
      inputs.sourceRoot,
      config.buildMode,
      config.computedConfig,
      logger,
    );
  logger.info(
    `Using overlay database mode: ${overlayDatabaseMode} ` +
      `${useOverlayDatabaseCaching ? "with" : "without"} caching.`,
  );
  config.overlayDatabaseMode = overlayDatabaseMode;
  config.useOverlayDatabaseCaching = useOverlayDatabaseCaching;

  if (
    overlayDatabaseMode === OverlayDatabaseMode.Overlay ||
    (await shouldPerformDiffInformedAnalysis(
      inputs.codeql,
      inputs.features,
      logger,
    ))
  ) {
    config.extraQueryExclusions.push({
      exclude: { tags: "exclude-from-incremental" },
    });
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

  const config = JSON.parse(configString) as Partial<Config>;

  if (config.version === undefined) {
    throw new ConfigurationError(
      `Loaded configuration file, but it does not contain the expected 'version' field.`,
    );
  }
  if (config.version !== getActionVersion()) {
    throw new ConfigurationError(
      `Loaded a configuration file for version '${config.version}', but running version '${getActionVersion()}'`,
    );
  }

  return config as Config;
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
    languages.includes(KnownLanguage.csharp) &&
    (await features.getValue(Feature.DisableCsharpBuildless))
  ) {
    logger.warning(
      "Scanning C# code without a build is temporarily unavailable. Falling back to 'autobuild' build mode.",
    );
    return BuildMode.Autobuild;
  }

  if (
    languages.includes(KnownLanguage.java) &&
    (await features.getValue(Feature.DisableJavaBuildlessEnabled))
  ) {
    logger.warning(
      "Scanning Java code without a build is temporarily unavailable. Falling back to 'autobuild' build mode.",
    );
    return BuildMode.Autobuild;
  }
  return input as BuildMode;
}

export function generateCodeScanningConfig(
  originalUserInput: UserConfig,
  augmentationProperties: AugmentationProperties,
): UserConfig {
  // make a copy so we can modify it
  const augmentedConfig = cloneObject(originalUserInput);

  // Inject the queries from the input
  if (augmentationProperties.queriesInput) {
    if (augmentationProperties.queriesInputCombines) {
      augmentedConfig.queries = (augmentedConfig.queries || []).concat(
        augmentationProperties.queriesInput,
      );
    } else {
      augmentedConfig.queries = augmentationProperties.queriesInput;
    }
  }
  if (augmentedConfig.queries?.length === 0) {
    delete augmentedConfig.queries;
  }

  // Inject the packs from the input
  if (augmentationProperties.packsInput) {
    if (augmentationProperties.packsInputCombines) {
      // At this point, we already know that this is a single-language analysis
      if (Array.isArray(augmentedConfig.packs)) {
        augmentedConfig.packs = (augmentedConfig.packs || []).concat(
          augmentationProperties.packsInput,
        );
      } else if (!augmentedConfig.packs) {
        augmentedConfig.packs = augmentationProperties.packsInput;
      } else {
        // At this point, we know there is only one language.
        // If there were more than one language, an error would already have been thrown.
        const language = Object.keys(augmentedConfig.packs)[0];
        augmentedConfig.packs[language] = augmentedConfig.packs[
          language
        ].concat(augmentationProperties.packsInput);
      }
    } else {
      augmentedConfig.packs = augmentationProperties.packsInput;
    }
  }
  if (Array.isArray(augmentedConfig.packs) && !augmentedConfig.packs.length) {
    delete augmentedConfig.packs;
  }

  return augmentedConfig;
}

/**
 * Appends `extraQueryExclusions` to `cliConfig`'s `query-filters`.
 *
 * @param extraQueryExclusions The extra query exclusions to append to the `query-filters`.
 * @param cliConfig The CodeQL CLI configuration to extend.
 * @returns Returns `cliConfig` if there are no extra query exclusions
 *          or a copy of `cliConfig` where the extra query exclusions
 *          have been appended to `query-filters`.
 */
export function appendExtraQueryExclusions(
  extraQueryExclusions: ExcludeQueryFilter[],
  cliConfig: UserConfig,
): Readonly<UserConfig> {
  // make a copy so we can modify it and so that modifications to the input
  // object do not affect the result that is marked as `Readonly`.
  const augmentedConfig = cloneObject(cliConfig);

  if (extraQueryExclusions.length === 0) {
    return augmentedConfig;
  }

  augmentedConfig["query-filters"] = [
    // Ordering matters. If the first filter is an inclusion, it implicitly
    // excludes all queries that are not included. If it is an exclusion,
    // it implicitly includes all queries that are not excluded. So user
    // filters (if any) should always be first to preserve intent.
    ...(augmentedConfig["query-filters"] || []),
    ...extraQueryExclusions,
  ];
  if (augmentedConfig["query-filters"]?.length === 0) {
    delete augmentedConfig["query-filters"];
  }

  return augmentedConfig;
}

/**
 * Returns `true` if Code Scanning analysis is enabled, or `false` if not.
 */
export function isCodeScanningEnabled(config: Config): boolean {
  return config.analysisKinds.includes(AnalysisKind.CodeScanning);
}

/**
 * Returns `true` if Code Quality analysis is enabled, or `false` if not.
 */
export function isCodeQualityEnabled(config: Config): boolean {
  return config.analysisKinds.includes(AnalysisKind.CodeQuality);
}

/**
 * Returns the primary analysis kind that the Action is initialised with. This is
 * always `AnalysisKind.CodeScanning` unless `AnalysisKind.CodeScanning` is not enabled.
 *
 * @returns Returns `AnalysisKind.CodeScanning` if `AnalysisKind.CodeScanning` is enabled;
 * otherwise `AnalysisKind.CodeQuality`.
 */
export function getPrimaryAnalysisKind(config: Config): AnalysisKind {
  return isCodeScanningEnabled(config)
    ? AnalysisKind.CodeScanning
    : AnalysisKind.CodeQuality;
}

/**
 * Returns the primary analysis configuration that the Action is initialised with. This is
 * always `CodeScanning` unless `CodeScanning` is not enabled.
 *
 * @returns Returns `CodeScanning` if `AnalysisKind.CodeScanning` is enabled; otherwise `CodeQuality`.
 */
export function getPrimaryAnalysisConfig(config: Config): AnalysisConfig {
  return getPrimaryAnalysisKind(config) === AnalysisKind.CodeScanning
    ? CodeScanning
    : CodeQuality;
}
