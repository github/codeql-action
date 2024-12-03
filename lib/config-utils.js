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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const perf_hooks_1 = require("perf_hooks");
const yaml = __importStar(require("js-yaml"));
const semver = __importStar(require("semver"));
const api = __importStar(require("./api-client"));
const caching_utils_1 = require("./caching-utils");
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
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
 * Get the default config for when the user has not supplied one.
 */
async function getDefaultConfig({ languagesInput, queriesInput, packsInput, buildModeInput, dbLocation, trapCachingEnabled, dependencyCachingEnabled, debugMode, debugArtifactName, debugDatabaseName, repository, tempDir, codeql, githubVersion, features, logger, }) {
    const languages = await getLanguages(codeql, languagesInput, repository, logger);
    const buildMode = await parseBuildModeInput(buildModeInput, languages, features, logger);
    const augmentationProperties = calculateAugmentation(packsInput, queriesInput, languages);
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
/**
 * Load the config from the given file.
 */
async function loadConfig({ languagesInput, queriesInput, packsInput, buildModeInput, configFile, dbLocation, trapCachingEnabled, dependencyCachingEnabled, debugMode, debugArtifactName, debugDatabaseName, repository, tempDir, codeql, workspacePath, githubVersion, apiDetails, features, logger, }) {
    let parsedYAML;
    if (isLocal(configFile)) {
        if (configFile !== userConfigFromActionPath(tempDir)) {
            // If the config file is not generated by the Action, it should be relative to the workspace.
            configFile = path.resolve(workspacePath, configFile);
            // Error if the config file is now outside of the workspace
            if (!(configFile + path.sep).startsWith(workspacePath + path.sep)) {
                throw new util_1.ConfigurationError(getConfigFileOutsideWorkspaceErrorMessage(configFile));
            }
        }
        parsedYAML = getLocalConfig(configFile);
    }
    else {
        parsedYAML = await getRemoteConfig(configFile, apiDetails);
    }
    const languages = await getLanguages(codeql, languagesInput, repository, logger);
    const buildMode = await parseBuildModeInput(buildModeInput, languages, features, logger);
    const augmentationProperties = calculateAugmentation(packsInput, queriesInput, languages);
    const { trapCaches, trapCacheDownloadTime } = await downloadCacheWithTime(trapCachingEnabled, codeql, languages, logger);
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
        dependencyCachingEnabled: (0, caching_utils_1.getCachingKind)(dependencyCachingEnabled),
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
function calculateAugmentation(rawPacksInput, rawQueriesInput, languages) {
    const packsInputCombines = shouldCombine(rawPacksInput);
    const packsInput = parsePacksFromInput(rawPacksInput, languages, packsInputCombines);
    const queriesInputCombines = shouldCombine(rawQueriesInput);
    const queriesInput = parseQueriesFromInput(rawQueriesInput, queriesInputCombines);
    return {
        packsInputCombines,
        packsInput: packsInput?.[languages[0]],
        queriesInput,
        queriesInputCombines,
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
    let config;
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
    // If no config file was provided create an empty one
    if (!inputs.configFile) {
        logger.debug("No configuration file was provided");
        config = await getDefaultConfig(inputs);
    }
    else {
        // Convince the type checker that inputs.configFile is defined.
        config = await loadConfig({ ...inputs, configFile: inputs.configFile });
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
//# sourceMappingURL=config-utils.js.map