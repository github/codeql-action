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
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultAugmentationProperties = void 0;
exports.getPacksStrInvalid = getPacksStrInvalid;
exports.getConfigFileOutsideWorkspaceErrorMessage = getConfigFileOutsideWorkspaceErrorMessage;
exports.getConfigFileDoesNotExistErrorMessage = getConfigFileDoesNotExistErrorMessage;
exports.getConfigFileRepoFormatInvalidMessage = getConfigFileRepoFormatInvalidMessage;
exports.getConfigFileFormatInvalidMessage = getConfigFileFormatInvalidMessage;
exports.getConfigFileDirectoryGivenMessage = getConfigFileDirectoryGivenMessage;
exports.getNoLanguagesError = getNoLanguagesError;
exports.getUnknownLanguagesError = getUnknownLanguagesError;
exports.getLanguagesInRepo = getLanguagesInRepo;
exports.getLanguages = getLanguages;
exports.getRawLanguages = getRawLanguages;
exports.getDefaultConfig = getDefaultConfig;
exports.calculateAugmentation = calculateAugmentation;
exports.getOverlayDatabaseMode = getOverlayDatabaseMode;
exports.parsePacksFromInput = parsePacksFromInput;
exports.parsePacksSpecification = parsePacksSpecification;
exports.validatePackSpecification = validatePackSpecification;
exports.initConfig = initConfig;
exports.parseRegistriesWithoutCredentials = parseRegistriesWithoutCredentials;
exports.getPathToParsedConfigFile = getPathToParsedConfigFile;
exports.getConfig = getConfig;
exports.generateRegistries = generateRegistries;
exports.wrapEnvironment = wrapEnvironment;
exports.parseBuildModeInput = parseBuildModeInput;
exports.generateCodeScanningConfig = generateCodeScanningConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const perf_hooks_1 = require("perf_hooks");
const yaml = __importStar(require("js-yaml"));
const semver = __importStar(require("semver"));
const actions_util_1 = require("./actions-util");
const api = __importStar(require("./api-client"));
const caching_utils_1 = require("./caching-utils");
const diff_informed_analysis_utils_1 = require("./diff-informed-analysis-utils");
const feature_flags_1 = require("./feature-flags");
const git_utils_1 = require("./git-utils");
const languages_1 = require("./languages");
const overlay_database_utils_1 = require("./overlay-database-utils");
const trap_caching_1 = require("./trap-caching");
const util_1 = require("./util");
// Property names from the user-supplied config file.
const PACKS_PROPERTY = "packs";
/**
 * The default, empty augmentation properties. This is most useful
 * for tests.
 */
exports.defaultAugmentationProperties = {
    queriesInputCombines: false,
    packsInputCombines: false,
    packsInput: undefined,
    queriesInput: undefined,
    qualityQueriesInput: undefined,
    extraQueryExclusions: [],
    overlayDatabaseMode: overlay_database_utils_1.OverlayDatabaseMode.None,
    useOverlayDatabaseCaching: false,
};
function getPacksStrInvalid(packStr, configFile) {
    return configFile
        ? getConfigFilePropertyError(configFile, PACKS_PROPERTY, `"${packStr}" is not a valid pack`)
        : `"${packStr}" is not a valid pack`;
}
function getConfigFileOutsideWorkspaceErrorMessage(configFile) {
    return `The configuration file "${configFile}" is outside of the workspace`;
}
function getConfigFileDoesNotExistErrorMessage(configFile) {
    return `The configuration file "${configFile}" does not exist`;
}
function getConfigFileRepoFormatInvalidMessage(configFile) {
    let error = `The configuration file "${configFile}" is not a supported remote file reference.`;
    error += " Expected format <owner>/<repository>/<file-path>@<ref>";
    return error;
}
function getConfigFileFormatInvalidMessage(configFile) {
    return `The configuration file "${configFile}" could not be read`;
}
function getConfigFileDirectoryGivenMessage(configFile) {
    return `The configuration file "${configFile}" looks like a directory, not a file`;
}
function getConfigFilePropertyError(configFile, property, error) {
    if (configFile === undefined) {
        return `The workflow property "${property}" is invalid: ${error}`;
    }
    else {
        return `The configuration file "${configFile}" is invalid: property "${property}" ${error}`;
    }
}
function getNoLanguagesError() {
    return ("Did not detect any languages to analyze. " +
        "Please update input in workflow or check that GitHub detects the correct languages in your repository.");
}
function getUnknownLanguagesError(languages) {
    return `Did not recognize the following languages: ${languages.join(", ")}`;
}
/**
 * Gets the set of languages in the current repository that are
 * scannable by CodeQL.
 */
async function getLanguagesInRepo(repository, logger) {
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
    const languages = new Set();
    for (const lang of Object.keys(response.data)) {
        const parsedLang = (0, languages_1.parseLanguage)(lang);
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
async function getLanguages(codeQL, languagesInput, repository, logger) {
    // Obtain languages without filtering them.
    const { rawLanguages, autodetected } = await getRawLanguages(languagesInput, repository, logger);
    let languages = rawLanguages;
    if (autodetected) {
        const supportedLanguages = Object.keys(await codeQL.resolveLanguages());
        languages = languages
            .map(languages_1.parseLanguage)
            .filter((value) => value && supportedLanguages.includes(value))
            .map((value) => value);
        logger.info(`Automatically detected languages: ${languages.join(", ")}`);
    }
    else {
        const aliases = (await codeQL.betterResolveLanguages()).aliases;
        if (aliases) {
            languages = languages.map((lang) => aliases[lang] || lang);
        }
        logger.info(`Languages from configuration: ${languages.join(", ")}`);
    }
    // If the languages parameter was not given and no languages were
    // detected then fail here as this is a workflow configuration error.
    if (languages.length === 0) {
        throw new util_1.ConfigurationError(getNoLanguagesError());
    }
    // Make sure they are supported
    const parsedLanguages = [];
    const unknownLanguages = [];
    for (const language of languages) {
        const parsedLanguage = (0, languages_1.parseLanguage)(language);
        if (parsedLanguage === undefined) {
            unknownLanguages.push(language);
        }
        else if (!parsedLanguages.includes(parsedLanguage)) {
            parsedLanguages.push(parsedLanguage);
        }
    }
    // Any unknown languages here would have come directly from the input
    // since we filter unknown languages coming from the GitHub API.
    if (unknownLanguages.length > 0) {
        throw new util_1.ConfigurationError(getUnknownLanguagesError(unknownLanguages));
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
async function getRawLanguages(languagesInput, repository, logger) {
    // Obtain from action input 'languages' if set
    let rawLanguages = (languagesInput || "")
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter((x) => x.length > 0);
    let autodetected;
    if (rawLanguages.length) {
        autodetected = false;
    }
    else {
        autodetected = true;
        // Obtain all languages in the repo that can be analysed
        rawLanguages = (await getLanguagesInRepo(repository, logger));
    }
    return { rawLanguages, autodetected };
}
/**
 * Get the default config, populated without user configuration file.
 */
async function getDefaultConfig({ languagesInput, queriesInput, qualityQueriesInput, packsInput, buildModeInput, dbLocation, trapCachingEnabled, dependencyCachingEnabled, debugMode, debugArtifactName, debugDatabaseName, repository, tempDir, codeql, githubVersion, features, logger, }) {
    const languages = await getLanguages(codeql, languagesInput, repository, logger);
    const buildMode = await parseBuildModeInput(buildModeInput, languages, features, logger);
    const augmentationProperties = await calculateAugmentation(packsInput, queriesInput, qualityQueriesInput, languages);
    const { trapCaches, trapCacheDownloadTime } = await downloadCacheWithTime(trapCachingEnabled, codeql, languages, logger);
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
        dependencyCachingEnabled: (0, caching_utils_1.getCachingKind)(dependencyCachingEnabled),
    };
}
async function downloadCacheWithTime(trapCachingEnabled, codeQL, languages, logger) {
    let trapCaches = {};
    let trapCacheDownloadTime = 0;
    if (trapCachingEnabled) {
        const start = perf_hooks_1.performance.now();
        trapCaches = await (0, trap_caching_1.downloadTrapCaches)(codeQL, languages, logger);
        trapCacheDownloadTime = perf_hooks_1.performance.now() - start;
    }
    return { trapCaches, trapCacheDownloadTime };
}
async function loadUserConfig(configFile, workspacePath, apiDetails, tempDir) {
    if (isLocal(configFile)) {
        if (configFile !== userConfigFromActionPath(tempDir)) {
            // If the config file is not generated by the Action, it should be relative to the workspace.
            configFile = path.resolve(workspacePath, configFile);
            // Error if the config file is now outside of the workspace
            if (!(configFile + path.sep).startsWith(workspacePath + path.sep)) {
                throw new util_1.ConfigurationError(getConfigFileOutsideWorkspaceErrorMessage(configFile));
            }
        }
        return getLocalConfig(configFile);
    }
    else {
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
async function calculateAugmentation(rawPacksInput, rawQueriesInput, rawQualityQueriesInput, languages) {
    const packsInputCombines = shouldCombine(rawPacksInput);
    const packsInput = parsePacksFromInput(rawPacksInput, languages, packsInputCombines);
    const queriesInputCombines = shouldCombine(rawQueriesInput);
    const queriesInput = parseQueriesFromInput(rawQueriesInput, queriesInputCombines);
    const qualityQueriesInput = parseQueriesFromInput(rawQualityQueriesInput, false);
    return {
        packsInputCombines,
        packsInput: packsInput?.[languages[0]],
        queriesInput,
        queriesInputCombines,
        qualityQueriesInput,
        extraQueryExclusions: [],
        overlayDatabaseMode: overlay_database_utils_1.OverlayDatabaseMode.None,
        useOverlayDatabaseCaching: false,
    };
}
function parseQueriesFromInput(rawQueriesInput, queriesInputCombines) {
    if (!rawQueriesInput) {
        return undefined;
    }
    const trimmedInput = queriesInputCombines
        ? rawQueriesInput.trim().slice(1).trim()
        : (rawQueriesInput?.trim() ?? "");
    if (queriesInputCombines && trimmedInput.length === 0) {
        throw new util_1.ConfigurationError(getConfigFilePropertyError(undefined, "queries", "A '+' was used in the 'queries' input to specify that you wished to add some packs to your CodeQL analysis. However, no packs were specified. Please either remove the '+' or specify some packs."));
    }
    return trimmedInput.split(",").map((query) => ({ uses: query.trim() }));
}
const OVERLAY_ANALYSIS_FEATURES = {
    actions: feature_flags_1.Feature.OverlayAnalysisActions,
    cpp: feature_flags_1.Feature.OverlayAnalysisCpp,
    csharp: feature_flags_1.Feature.OverlayAnalysisCsharp,
    go: feature_flags_1.Feature.OverlayAnalysisGo,
    java: feature_flags_1.Feature.OverlayAnalysisJava,
    javascript: feature_flags_1.Feature.OverlayAnalysisJavascript,
    python: feature_flags_1.Feature.OverlayAnalysisPython,
    ruby: feature_flags_1.Feature.OverlayAnalysisRuby,
    rust: feature_flags_1.Feature.OverlayAnalysisRust,
    swift: feature_flags_1.Feature.OverlayAnalysisSwift,
};
const OVERLAY_ANALYSIS_CODE_SCANNING_FEATURES = {
    actions: feature_flags_1.Feature.OverlayAnalysisCodeScanningActions,
    cpp: feature_flags_1.Feature.OverlayAnalysisCodeScanningCpp,
    csharp: feature_flags_1.Feature.OverlayAnalysisCodeScanningCsharp,
    go: feature_flags_1.Feature.OverlayAnalysisCodeScanningGo,
    java: feature_flags_1.Feature.OverlayAnalysisCodeScanningJava,
    javascript: feature_flags_1.Feature.OverlayAnalysisCodeScanningJavascript,
    python: feature_flags_1.Feature.OverlayAnalysisCodeScanningPython,
    ruby: feature_flags_1.Feature.OverlayAnalysisCodeScanningRuby,
    rust: feature_flags_1.Feature.OverlayAnalysisCodeScanningRust,
    swift: feature_flags_1.Feature.OverlayAnalysisCodeScanningSwift,
};
async function isOverlayAnalysisFeatureEnabled(repository, features, codeql, languages, codeScanningConfig) {
    // TODO: Remove the repository owner check once support for overlay analysis
    // stabilizes, and no more backward-incompatible changes are expected.
    if (!["github", "dsp-testing"].includes(repository.owner)) {
        return false;
    }
    if (!(await features.getValue(feature_flags_1.Feature.OverlayAnalysis, codeql))) {
        return false;
    }
    let enableForCodeScanningOnly = false;
    for (const language of languages) {
        const feature = OVERLAY_ANALYSIS_FEATURES[language];
        if (feature && (await features.getValue(feature, codeql))) {
            continue;
        }
        const codeScanningFeature = OVERLAY_ANALYSIS_CODE_SCANNING_FEATURES[language];
        if (codeScanningFeature &&
            (await features.getValue(codeScanningFeature, codeql))) {
            enableForCodeScanningOnly = true;
            continue;
        }
        return false;
    }
    if (enableForCodeScanningOnly) {
        // A code-scanning configuration runs only the (default) code-scanning suite
        // if the default queries are not disabled, and no packs, queries, or
        // query-filters are specified.
        return (codeScanningConfig["disable-default-queries"] !== true &&
            codeScanningConfig.packs === undefined &&
            codeScanningConfig.queries === undefined &&
            codeScanningConfig["query-filters"] === undefined);
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
async function getOverlayDatabaseMode(codeql, repository, features, languages, sourceRoot, buildMode, codeScanningConfig, logger) {
    let overlayDatabaseMode = overlay_database_utils_1.OverlayDatabaseMode.None;
    let useOverlayDatabaseCaching = false;
    const modeEnv = process.env.CODEQL_OVERLAY_DATABASE_MODE;
    // Any unrecognized CODEQL_OVERLAY_DATABASE_MODE value will be ignored and
    // treated as if the environment variable was not set.
    if (modeEnv === overlay_database_utils_1.OverlayDatabaseMode.Overlay ||
        modeEnv === overlay_database_utils_1.OverlayDatabaseMode.OverlayBase ||
        modeEnv === overlay_database_utils_1.OverlayDatabaseMode.None) {
        overlayDatabaseMode = modeEnv;
        logger.info(`Setting overlay database mode to ${overlayDatabaseMode} ` +
            "from the CODEQL_OVERLAY_DATABASE_MODE environment variable.");
    }
    else if (await isOverlayAnalysisFeatureEnabled(repository, features, codeql, languages, codeScanningConfig)) {
        if ((0, actions_util_1.isAnalyzingPullRequest)()) {
            overlayDatabaseMode = overlay_database_utils_1.OverlayDatabaseMode.Overlay;
            useOverlayDatabaseCaching = true;
            logger.info(`Setting overlay database mode to ${overlayDatabaseMode} ` +
                "with caching because we are analyzing a pull request.");
        }
        else if (await (0, git_utils_1.isAnalyzingDefaultBranch)()) {
            overlayDatabaseMode = overlay_database_utils_1.OverlayDatabaseMode.OverlayBase;
            useOverlayDatabaseCaching = true;
            logger.info(`Setting overlay database mode to ${overlayDatabaseMode} ` +
                "with caching because we are analyzing the default branch.");
        }
    }
    const nonOverlayAnalysis = {
        overlayDatabaseMode: overlay_database_utils_1.OverlayDatabaseMode.None,
        useOverlayDatabaseCaching: false,
    };
    if (overlayDatabaseMode === overlay_database_utils_1.OverlayDatabaseMode.None) {
        return nonOverlayAnalysis;
    }
    if (buildMode !== util_1.BuildMode.None && languages.some(languages_1.isTracedLanguage)) {
        logger.warning(`Cannot build an ${overlayDatabaseMode} database because ` +
            `build-mode is set to "${buildMode}" instead of "none". ` +
            "Falling back to creating a normal full database instead.");
        return nonOverlayAnalysis;
    }
    if (!(await (0, util_1.codeQlVersionAtLeast)(codeql, overlay_database_utils_1.CODEQL_OVERLAY_MINIMUM_VERSION))) {
        logger.warning(`Cannot build an ${overlayDatabaseMode} database because ` +
            `the CodeQL CLI is older than ${overlay_database_utils_1.CODEQL_OVERLAY_MINIMUM_VERSION}. ` +
            "Falling back to creating a normal full database instead.");
        return nonOverlayAnalysis;
    }
    if ((await (0, git_utils_1.getGitRoot)(sourceRoot)) === undefined) {
        logger.warning(`Cannot build an ${overlayDatabaseMode} database because ` +
            `the source root "${sourceRoot}" is not inside a git repository. ` +
            "Falling back to creating a normal full database instead.");
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
function parsePacksFromInput(rawPacksInput, languages, packsInputCombines) {
    if (!rawPacksInput?.trim()) {
        return undefined;
    }
    if (languages.length > 1) {
        throw new util_1.ConfigurationError("Cannot specify a 'packs' input in a multi-language analysis. Use a codeql-config.yml file instead and specify packs by language.");
    }
    else if (languages.length === 0) {
        throw new util_1.ConfigurationError("No languages specified. Cannot process the packs input.");
    }
    rawPacksInput = rawPacksInput.trim();
    if (packsInputCombines) {
        rawPacksInput = rawPacksInput.trim().substring(1).trim();
        if (!rawPacksInput) {
            throw new util_1.ConfigurationError(getConfigFilePropertyError(undefined, "packs", "A '+' was used in the 'packs' input to specify that you wished to add some packs to your CodeQL analysis. However, no packs were specified. Please either remove the '+' or specify some packs."));
        }
    }
    return {
        [languages[0]]: rawPacksInput.split(",").reduce((packs, pack) => {
            packs.push(validatePackSpecification(pack));
            return packs;
        }, []),
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
function parsePacksSpecification(packStr) {
    if (typeof packStr !== "string") {
        throw new util_1.ConfigurationError(getPacksStrInvalid(packStr));
    }
    packStr = packStr.trim();
    const atIndex = packStr.indexOf("@");
    const colonIndex = packStr.indexOf(":", atIndex);
    const packStart = 0;
    const versionStart = atIndex + 1 || undefined;
    const pathStart = colonIndex + 1 || undefined;
    const packEnd = Math.min(atIndex > 0 ? atIndex : Infinity, colonIndex > 0 ? colonIndex : Infinity, packStr.length);
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
        throw new util_1.ConfigurationError(getPacksStrInvalid(packStr));
    }
    if (version) {
        try {
            new semver.Range(version);
        }
        catch {
            // The range string is invalid. OK to ignore the caught error
            throw new util_1.ConfigurationError(getPacksStrInvalid(packStr));
        }
    }
    if (packPath &&
        (path.isAbsolute(packPath) ||
            // Permit using "/" instead of "\" on Windows
            // Use `x.split(y).join(z)` as a polyfill for `x.replaceAll(y, z)` since
            // if we used a regex we'd need to escape the path separator on Windows
            // which seems more awkward.
            path.normalize(packPath).split(path.sep).join("/") !==
                packPath.split(path.sep).join("/"))) {
        throw new util_1.ConfigurationError(getPacksStrInvalid(packStr));
    }
    if (!packPath && pathStart) {
        // 0 length path
        throw new util_1.ConfigurationError(getPacksStrInvalid(packStr));
    }
    return {
        name: packName,
        version,
        path: packPath,
    };
}
function validatePackSpecification(pack) {
    return (0, util_1.prettyPrintPack)(parsePacksSpecification(pack));
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
function shouldCombine(inputValue) {
    return !!inputValue?.trim().startsWith("+");
}
function dbLocationOrDefault(dbLocation, tempDir) {
    return dbLocation || path.resolve(tempDir, "codeql_databases");
}
function userConfigFromActionPath(tempDir) {
    return path.resolve(tempDir, "user-config-from-action.yml");
}
/**
 * Load and return the config.
 *
 * This will parse the config from the user input if present, or generate
 * a default config. The parsed config is then stored to a known location.
 */
async function initConfig(inputs) {
    const { logger, tempDir } = inputs;
    // if configInput is set, it takes precedence over configFile
    if (inputs.configInput) {
        if (inputs.configFile) {
            logger.warning(`Both a config file and config input were provided. Ignoring config file.`);
        }
        inputs.configFile = userConfigFromActionPath(tempDir);
        fs.writeFileSync(inputs.configFile, inputs.configInput);
        logger.debug(`Using config from action input: ${inputs.configFile}`);
    }
    let userConfig = {};
    if (!inputs.configFile) {
        logger.debug("No configuration file was provided");
    }
    else {
        logger.debug(`Using configuration file: ${inputs.configFile}`);
        userConfig = await loadUserConfig(inputs.configFile, inputs.workspacePath, inputs.apiDetails, tempDir);
    }
    const config = await getDefaultConfig(inputs);
    const augmentationProperties = config.augmentationProperties;
    config.originalUserInput = userConfig;
    // The choice of overlay database mode depends on the selection of languages
    // and queries, which in turn depends on the user config and the augmentation
    // properties. So we need to calculate the overlay database mode after the
    // rest of the config has been populated.
    const { overlayDatabaseMode, useOverlayDatabaseCaching } = await getOverlayDatabaseMode(inputs.codeql, inputs.repository, inputs.features, config.languages, inputs.sourceRoot, config.buildMode, generateCodeScanningConfig(userConfig, augmentationProperties), logger);
    logger.info(`Using overlay database mode: ${overlayDatabaseMode} ` +
        `${useOverlayDatabaseCaching ? "with" : "without"} caching.`);
    augmentationProperties.overlayDatabaseMode = overlayDatabaseMode;
    augmentationProperties.useOverlayDatabaseCaching = useOverlayDatabaseCaching;
    if (overlayDatabaseMode === overlay_database_utils_1.OverlayDatabaseMode.Overlay ||
        (await (0, diff_informed_analysis_utils_1.shouldPerformDiffInformedAnalysis)(inputs.codeql, inputs.features, logger))) {
        augmentationProperties.extraQueryExclusions.push({
            exclude: { tags: "exclude-from-incremental" },
        });
    }
    // Save the config so we can easily access it again in the future
    await saveConfig(config, logger);
    return config;
}
function parseRegistries(registriesInput) {
    try {
        return registriesInput
            ? yaml.load(registriesInput)
            : undefined;
    }
    catch {
        throw new util_1.ConfigurationError("Invalid registries input. Must be a YAML string.");
    }
}
function parseRegistriesWithoutCredentials(registriesInput) {
    return parseRegistries(registriesInput)?.map((r) => {
        const { url, packages, kind } = r;
        return { url, packages, kind };
    });
}
function isLocal(configPath) {
    // If the path starts with ./, look locally
    if (configPath.indexOf("./") === 0) {
        return true;
    }
    return configPath.indexOf("@") === -1;
}
function getLocalConfig(configFile) {
    // Error if the file does not exist
    if (!fs.existsSync(configFile)) {
        throw new util_1.ConfigurationError(getConfigFileDoesNotExistErrorMessage(configFile));
    }
    return yaml.load(fs.readFileSync(configFile, "utf8"));
}
async function getRemoteConfig(configFile, apiDetails) {
    // retrieve the various parts of the config location, and ensure they're present
    const format = new RegExp("(?<owner>[^/]+)/(?<repo>[^/]+)/(?<path>[^@]+)@(?<ref>.*)");
    const pieces = format.exec(configFile);
    // 5 = 4 groups + the whole expression
    if (pieces === null || pieces.groups === undefined || pieces.length < 5) {
        throw new util_1.ConfigurationError(getConfigFileRepoFormatInvalidMessage(configFile));
    }
    const response = await api
        .getApiClientWithExternalAuth(apiDetails)
        .rest.repos.getContent({
        owner: pieces.groups.owner,
        repo: pieces.groups.repo,
        path: pieces.groups.path,
        ref: pieces.groups.ref,
    });
    let fileContents;
    if ("content" in response.data && response.data.content !== undefined) {
        fileContents = response.data.content;
    }
    else if (Array.isArray(response.data)) {
        throw new util_1.ConfigurationError(getConfigFileDirectoryGivenMessage(configFile));
    }
    else {
        throw new util_1.ConfigurationError(getConfigFileFormatInvalidMessage(configFile));
    }
    return yaml.load(Buffer.from(fileContents, "base64").toString("binary"));
}
/**
 * Get the file path where the parsed config will be stored.
 */
function getPathToParsedConfigFile(tempDir) {
    return path.join(tempDir, "config");
}
/**
 * Store the given config to the path returned from getPathToParsedConfigFile.
 */
async function saveConfig(config, logger) {
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
async function getConfig(tempDir, logger) {
    const configFile = getPathToParsedConfigFile(tempDir);
    if (!fs.existsSync(configFile)) {
        return undefined;
    }
    const configString = fs.readFileSync(configFile, "utf8");
    logger.debug("Loaded config:");
    logger.debug(configString);
    return JSON.parse(configString);
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
async function generateRegistries(registriesInput, tempDir, logger) {
    const registries = parseRegistries(registriesInput);
    let registriesAuthTokens;
    let qlconfigFile;
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
        logger.debug("Using CODEQL_REGISTRIES_AUTH environment variable to authenticate with registries.");
    }
    return {
        registriesAuthTokens: 
        // if the user has explicitly set the CODEQL_REGISTRIES_AUTH env var then use that
        process.env.CODEQL_REGISTRIES_AUTH ?? registriesAuthTokens,
        qlconfigFile,
    };
}
function createRegistriesBlock(registries) {
    if (!Array.isArray(registries) ||
        registries.some((r) => !r.url || !r.packages)) {
        throw new util_1.ConfigurationError("Invalid 'registries' input. Must be an array of objects with 'url' and 'packages' properties.");
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
async function wrapEnvironment(env, operation) {
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
    }
    finally {
        // Restore the old env
        for (const [key, value] of Object.entries(oldEnv)) {
            process.env[key] = value;
        }
    }
}
// Exported for testing
async function parseBuildModeInput(input, languages, features, logger) {
    if (input === undefined) {
        return undefined;
    }
    if (!Object.values(util_1.BuildMode).includes(input)) {
        throw new util_1.ConfigurationError(`Invalid build mode: '${input}'. Supported build modes are: ${Object.values(util_1.BuildMode).join(", ")}.`);
    }
    if (languages.includes(languages_1.Language.csharp) &&
        (await features.getValue(feature_flags_1.Feature.DisableCsharpBuildless))) {
        logger.warning("Scanning C# code without a build is temporarily unavailable. Falling back to 'autobuild' build mode.");
        return util_1.BuildMode.Autobuild;
    }
    if (languages.includes(languages_1.Language.java) &&
        (await features.getValue(feature_flags_1.Feature.DisableJavaBuildlessEnabled))) {
        logger.warning("Scanning Java code without a build is temporarily unavailable. Falling back to 'autobuild' build mode.");
        return util_1.BuildMode.Autobuild;
    }
    return input;
}
function generateCodeScanningConfig(originalUserInput, augmentationProperties) {
    // make a copy so we can modify it
    const augmentedConfig = (0, util_1.cloneObject)(originalUserInput);
    // Inject the queries from the input
    if (augmentationProperties.queriesInput) {
        if (augmentationProperties.queriesInputCombines) {
            augmentedConfig.queries = (augmentedConfig.queries || []).concat(augmentationProperties.queriesInput);
        }
        else {
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
                augmentedConfig.packs = (augmentedConfig.packs || []).concat(augmentationProperties.packsInput);
            }
            else if (!augmentedConfig.packs) {
                augmentedConfig.packs = augmentationProperties.packsInput;
            }
            else {
                // At this point, we know there is only one language.
                // If there were more than one language, an error would already have been thrown.
                const language = Object.keys(augmentedConfig.packs)[0];
                augmentedConfig.packs[language] = augmentedConfig.packs[language].concat(augmentationProperties.packsInput);
            }
        }
        else {
            augmentedConfig.packs = augmentationProperties.packsInput;
        }
    }
    if (Array.isArray(augmentedConfig.packs) && !augmentedConfig.packs.length) {
        delete augmentedConfig.packs;
    }
    augmentedConfig["query-filters"] = [
        // Ordering matters. If the first filter is an inclusion, it implicitly
        // excludes all queries that are not included. If it is an exclusion,
        // it implicitly includes all queries that are not excluded. So user
        // filters (if any) should always be first to preserve intent.
        ...(augmentedConfig["query-filters"] || []),
        ...augmentationProperties.extraQueryExclusions,
    ];
    if (augmentedConfig["query-filters"]?.length === 0) {
        delete augmentedConfig["query-filters"];
    }
    return augmentedConfig;
}
//# sourceMappingURL=config-utils.js.map