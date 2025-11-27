import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";

import * as yaml from "js-yaml";

import { getActionVersion, isAnalyzingPullRequest } from "./actions-util";
import {
  AnalysisConfig,
  AnalysisKind,
  CodeQuality,
  codeQualityQueries,
  CodeScanning,
} from "./analyses";
import * as api from "./api-client";
import { CachingKind, getCachingKind } from "./caching-utils";
import { type CodeQL } from "./codeql";
import {
  calculateAugmentation,
  ExcludeQueryFilter,
  generateCodeScanningConfig,
  parseUserConfig,
  UserConfig,
} from "./config/db-config";
import { shouldPerformDiffInformedAnalysis } from "./diff-informed-analysis-utils";
import * as errorMessages from "./error-messages";
import { Feature, FeatureEnablement } from "./feature-flags";
import { RepositoryProperties } from "./feature-flags/properties";
import { getGitRoot, isAnalyzingDefaultBranch } from "./git-utils";
import { KnownLanguage, Language } from "./languages";
import { Logger } from "./logging";
import {
  CODEQL_OVERLAY_MINIMUM_VERSION,
  OverlayDatabaseMode,
} from "./overlay-database-utils";
import { RepositoryNwo } from "./repository";
import { ToolsFeature } from "./tools-features";
import { downloadTrapCaches } from "./trap-caching";
import {
  GitHubVersion,
  ConfigurationError,
  BuildMode,
  codeQlVersionAtLeast,
  cloneObject,
  isDefined,
  checkDiskUsage,
  getMemoryFlagValue,
} from "./util";

export * from "./config/db-config";

/**
 * The minimum available disk space (in MB) required to perform overlay analysis.
 * If the available disk space on the runner is below the threshold when deciding
 * whether to perform overlay analysis, then the action will not perform overlay
 * analysis unless overlay analysis has been explicitly enabled via environment
 * variable.
 */
const OVERLAY_MINIMUM_AVAILABLE_DISK_SPACE_MB = 20000;
const OVERLAY_MINIMUM_AVAILABLE_DISK_SPACE_BYTES =
  OVERLAY_MINIMUM_AVAILABLE_DISK_SPACE_MB * 1_000_000;

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

  /** The keys of caches that we restored, if any. */
  dependencyCachingRestoredKeys: string[];

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

  /**
   * A partial mapping from repository properties that affect us to their values.
   */
  repositoryProperties: RepositoryProperties;
}

async function getSupportedLanguageMap(
  codeql: CodeQL,
  logger: Logger,
): Promise<Record<string, string>> {
  const resolveSupportedLanguagesUsingCli = await codeql.supportsFeature(
    ToolsFeature.BuiltinExtractorsSpecifyDefaultQueries,
  );
  const resolveResult = await codeql.betterResolveLanguages({
    filterToLanguagesWithQueries: resolveSupportedLanguagesUsingCli,
  });
  if (resolveSupportedLanguagesUsingCli) {
    logger.debug(
      `The CodeQL CLI supports the following languages: ${Object.keys(resolveResult.extractors).join(", ")}`,
    );
  }
  const supportedLanguages: Record<string, string> = {};
  // Populate canonical language names
  for (const extractor of Object.keys(resolveResult.extractors)) {
    // If the CLI supports resolving languages with default queries, use these
    // as the set of supported languages. Otherwise, require the language to be
    // a known language.
    if (
      resolveSupportedLanguagesUsingCli ||
      KnownLanguage[extractor] !== undefined
    ) {
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
async function getRawLanguagesInRepo(
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

  const languageMap = await getSupportedLanguageMap(codeql, logger);
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
    throw new ConfigurationError(
      errorMessages.getUnknownLanguagesError(unknownLanguages),
    );
  }

  // If the languages parameter was not given and no languages were
  // detected then fail here as this is a workflow configuration error.
  if (languages.length === 0) {
    throw new ConfigurationError(errorMessages.getNoLanguagesError());
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
async function getRawLanguages(
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
  languagesInput: string | undefined;
  queriesInput: string | undefined;
  packsInput: string | undefined;
  configFile: string | undefined;
  dbLocation: string | undefined;
  configInput: string | undefined;
  buildModeInput: string | undefined;
  ramInput: string | undefined;
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
  repositoryProperties: RepositoryProperties;
  analysisKinds: AnalysisKind[];
  logger: Logger;
}

/**
 * Initialise the CodeQL Action state, which includes the base configuration for the Action
 * and computes the configuration for the CodeQL CLI.
 */
export async function initActionState(
  {
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
    sourceRoot,
    githubVersion,
    features,
    repositoryProperties,
    analysisKinds,
    logger,
  }: InitConfigInputs,
  userConfig: UserConfig,
): Promise<Config> {
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
    repositoryProperties,
    languages,
  );

  // If `code-quality` is the only enabled analysis kind, we don't support query customisation.
  // It would be a problem if queries that are configured in repository properties cause `code-quality`-only
  // analyses to break. We therefore ignore query customisations that are configured in repository properties
  // if `code-quality` is the only enabled analysis kind.
  if (
    analysisKinds.length === 1 &&
    analysisKinds.includes(AnalysisKind.CodeQuality) &&
    augmentationProperties.repoPropertyQueries.input
  ) {
    logger.info(
      `Ignoring queries configured in the repository properties, because query customisations are not supported for Code Quality analyses.`,
    );
    augmentationProperties.repoPropertyQueries = {
      combines: false,
      input: undefined,
    };
  }

  const { trapCaches, trapCacheDownloadTime } = await downloadCacheWithTime(
    trapCachingEnabled,
    codeql,
    languages,
    logger,
  );

  // Compute the full Code Scanning configuration that combines the configuration from the
  // configuration file / `config` input with other inputs, such as `queries`.
  const computedConfig = generateCodeScanningConfig(
    logger,
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
    dependencyCachingRestoredKeys: [],
    extraQueryExclusions: [],
    overlayDatabaseMode: OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
    repositoryProperties,
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
  logger: Logger,
  configFile: string,
  workspacePath: string,
  apiDetails: api.GitHubApiCombinedDetails,
  tempDir: string,
  validateConfig: boolean,
): Promise<UserConfig> {
  if (isLocal(configFile)) {
    if (configFile !== userConfigFromActionPath(tempDir)) {
      // If the config file is not generated by the Action, it should be relative to the workspace.
      configFile = path.resolve(workspacePath, configFile);
      // Error if the config file is now outside of the workspace
      if (!(configFile + path.sep).startsWith(workspacePath + path.sep)) {
        throw new ConfigurationError(
          errorMessages.getConfigFileOutsideWorkspaceErrorMessage(configFile),
        );
      }
    }
    return getLocalConfig(logger, configFile, validateConfig);
  } else {
    return await getRemoteConfig(
      logger,
      configFile,
      apiDetails,
      validateConfig,
    );
  }
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
  features: FeatureEnablement,
  codeql: CodeQL,
  languages: Language[],
  codeScanningConfig: UserConfig,
): Promise<boolean> {
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

async function runnerSupportsOverlayAnalysis(
  ramInput: string | undefined,
  logger: Logger,
): Promise<boolean> {
  const diskUsage = await checkDiskUsage(logger);
  if (
    diskUsage === undefined ||
    diskUsage.numAvailableBytes < OVERLAY_MINIMUM_AVAILABLE_DISK_SPACE_BYTES
  ) {
    const diskSpaceMb =
      diskUsage === undefined
        ? 0
        : Math.round(diskUsage.numAvailableBytes / 1_000_000);
    logger.info(
      `Setting overlay database mode to ${OverlayDatabaseMode.None} ` +
        `due to insufficient disk space (${diskSpaceMb} MB).`,
    );
    return false;
  }

  const memoryFlagValue = getMemoryFlagValue(ramInput, logger);
  if (memoryFlagValue < 5 * 1024) {
    logger.info(
      `Setting overlay database mode to ${OverlayDatabaseMode.None} ` +
        `due to insufficient memory for CodeQL analysis (${memoryFlagValue} MB).`,
    );
    return false;
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
  features: FeatureEnablement,
  languages: Language[],
  sourceRoot: string,
  buildMode: BuildMode | undefined,
  ramInput: string | undefined,
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
      features,
      codeql,
      languages,
      codeScanningConfig,
    )
  ) {
    const performResourceChecks = !(await features.getValue(
      Feature.OverlayAnalysisSkipResourceChecks,
      codeql,
    ));
    if (
      performResourceChecks &&
      !(await runnerSupportsOverlayAnalysis(ramInput, logger))
    ) {
      overlayDatabaseMode = OverlayDatabaseMode.None;
    } else if (isAnalyzingPullRequest()) {
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
        languages.map(
          async (l) =>
            l !== KnownLanguage.go && // Workaround to allow overlay analysis for Go with any build
            // mode, since it does not yet support BMN. The Go autobuilder and/or extractor will
            // ensure that overlay-base databases are only created for supported Go build setups,
            // and that we'll fall back to full databases in other cases.
            (await codeql.isTracedLanguage(l)),
        ),
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
export async function initConfig(
  features: FeatureEnablement,
  inputs: InitConfigInputs,
): Promise<Config> {
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
    const validateConfig = await features.getValue(Feature.ValidateDbConfig);
    userConfig = await loadUserConfig(
      logger,
      inputs.configFile,
      inputs.workspacePath,
      inputs.apiDetails,
      tempDir,
      validateConfig,
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
      inputs.features,
      config.languages,
      inputs.sourceRoot,
      config.buildMode,
      inputs.ramInput,
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

function getLocalConfig(
  logger: Logger,
  configFile: string,
  validateConfig: boolean,
): UserConfig {
  // Error if the file does not exist
  if (!fs.existsSync(configFile)) {
    throw new ConfigurationError(
      errorMessages.getConfigFileDoesNotExistErrorMessage(configFile),
    );
  }

  return parseUserConfig(
    logger,
    configFile,
    fs.readFileSync(configFile, "utf-8"),
    validateConfig,
  );
}

async function getRemoteConfig(
  logger: Logger,
  configFile: string,
  apiDetails: api.GitHubApiCombinedDetails,
  validateConfig: boolean,
): Promise<UserConfig> {
  // retrieve the various parts of the config location, and ensure they're present
  const format = new RegExp(
    "(?<owner>[^/]+)/(?<repo>[^/]+)/(?<path>[^@]+)@(?<ref>.*)",
  );
  const pieces = format.exec(configFile);
  // 5 = 4 groups + the whole expression
  if (pieces?.groups === undefined || pieces.length < 5) {
    throw new ConfigurationError(
      errorMessages.getConfigFileRepoFormatInvalidMessage(configFile),
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
      errorMessages.getConfigFileDirectoryGivenMessage(configFile),
    );
  } else {
    throw new ConfigurationError(
      errorMessages.getConfigFileFormatInvalidMessage(configFile),
    );
  }

  return parseUserConfig(
    logger,
    configFile,
    Buffer.from(fileContents, "base64").toString("binary"),
    validateConfig,
  );
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
export async function saveConfig(config: Config, logger: Logger) {
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
function getPrimaryAnalysisKind(config: Config): AnalysisKind {
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
