"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("js-yaml"));
const api = __importStar(require("./api-client"));
const externalQueries = __importStar(require("./external-queries"));
const languages_1 = require("./languages");
// Property names from the user-supplied config file.
const NAME_PROPERTY = "name";
const DISABLE_DEFAULT_QUERIES_PROPERTY = "disable-default-queries";
const QUERIES_PROPERTY = "queries";
const QUERIES_USES_PROPERTY = "uses";
const PATHS_IGNORE_PROPERTY = "paths-ignore";
const PATHS_PROPERTY = "paths";
/**
 * A list of queries from https://github.com/github/codeql that
 * we don't want to run. Disabling them here is a quicker alternative to
 * disabling them in the code scanning query suites. Queries should also
 * be disabled in the suites, and removed from this list here once the
 * bundle is updated to make those suite changes live.
 *
 * Format is a map from language to an array of path suffixes of .ql files.
 */
const DISABLED_BUILTIN_QUERIES = {
    csharp: [
        "ql/src/Security Features/CWE-937/VulnerablePackage.ql",
        "ql/src/Security Features/CWE-451/MissingXFrameOptions.ql",
    ],
};
function queryIsDisabled(language, query) {
    return (DISABLED_BUILTIN_QUERIES[language] || []).some((disabledQuery) => query.endsWith(disabledQuery));
}
/**
 * Asserts that the noDeclaredLanguage and multipleDeclaredLanguages fields are
 * both empty and errors if they are not.
 */
function validateQueries(resolvedQueries) {
    const noDeclaredLanguage = resolvedQueries.noDeclaredLanguage;
    const noDeclaredLanguageQueries = Object.keys(noDeclaredLanguage);
    if (noDeclaredLanguageQueries.length !== 0) {
        throw new Error(`${"The following queries do not declare a language. " +
            "Their qlpack.yml files are either missing or is invalid.\n"}${noDeclaredLanguageQueries.join("\n")}`);
    }
    const multipleDeclaredLanguages = resolvedQueries.multipleDeclaredLanguages;
    const multipleDeclaredLanguagesQueries = Object.keys(multipleDeclaredLanguages);
    if (multipleDeclaredLanguagesQueries.length !== 0) {
        throw new Error(`${"The following queries declare multiple languages. " +
            "Their qlpack.yml files are either missing or is invalid.\n"}${multipleDeclaredLanguagesQueries.join("\n")}`);
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
async function runResolveQueries(codeQL, resultMap, toResolve, extraSearchPath) {
    const resolvedQueries = await codeQL.resolveQueries(toResolve, extraSearchPath);
    if (extraSearchPath !== undefined) {
        validateQueries(resolvedQueries);
    }
    for (const [language, queryPaths] of Object.entries(resolvedQueries.byLanguage)) {
        if (resultMap[language] === undefined) {
            resultMap[language] = {
                builtin: [],
                custom: [],
            };
        }
        const queries = Object.keys(queryPaths).filter((q) => !queryIsDisabled(language, q));
        if (extraSearchPath !== undefined) {
            resultMap[language].custom.push(...queries);
        }
        else {
            resultMap[language].builtin.push(...queries);
        }
    }
}
/**
 * Get the set of queries included by default.
 */
async function addDefaultQueries(codeQL, languages, resultMap) {
    const suites = languages.map((l) => `${l}-code-scanning.qls`);
    await runResolveQueries(codeQL, resultMap, suites, undefined);
}
// The set of acceptable values for built-in suites from the codeql bundle
const builtinSuites = ["security-extended", "security-and-quality"];
/**
 * Determine the set of queries associated with suiteName's suites and add them to resultMap.
 * Throws an error if suiteName is not a valid builtin suite.
 */
async function addBuiltinSuiteQueries(languages, codeQL, resultMap, suiteName, configFile) {
    const found = builtinSuites.find((suite) => suite === suiteName);
    if (!found) {
        throw new Error(getQueryUsesInvalid(configFile, suiteName));
    }
    const suites = languages.map((l) => `${l}-${suiteName}.qls`);
    await runResolveQueries(codeQL, resultMap, suites, undefined);
}
/**
 * Retrieve the set of queries at localQueryPath and add them to resultMap.
 */
async function addLocalQueries(codeQL, resultMap, localQueryPath, checkoutPath, configFile) {
    // Resolve the local path against the workspace so that when this is
    // passed to codeql it resolves to exactly the path we expect it to resolve to.
    let absoluteQueryPath = path.join(checkoutPath, localQueryPath);
    // Check the file exists
    if (!fs.existsSync(absoluteQueryPath)) {
        throw new Error(getLocalPathDoesNotExist(configFile, localQueryPath));
    }
    // Call this after checking file exists, because it'll fail if file doesn't exist
    absoluteQueryPath = fs.realpathSync(absoluteQueryPath);
    // Check the local path doesn't jump outside the repo using '..' or symlinks
    if (!(absoluteQueryPath + path.sep).startsWith(fs.realpathSync(checkoutPath) + path.sep)) {
        throw new Error(getLocalPathOutsideOfRepository(configFile, localQueryPath));
    }
    await runResolveQueries(codeQL, resultMap, [absoluteQueryPath], checkoutPath);
}
/**
 * Retrieve the set of queries at the referenced remote repo and add them to resultMap.
 */
async function addRemoteQueries(codeQL, resultMap, queryUses, tempDir, githubUrl, logger, configFile) {
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
    const checkoutPath = await externalQueries.checkoutExternalRepository(nwo, ref, githubUrl, tempDir, logger);
    const queryPath = tok.length > 2
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
 */
async function parseQueryUses(languages, codeQL, resultMap, queryUses, tempDir, checkoutPath, githubUrl, logger, configFile) {
    queryUses = queryUses.trim();
    if (queryUses === "") {
        throw new Error(getQueryUsesInvalid(configFile));
    }
    // Check for the local path case before we start trying to parse the repository name
    if (queryUses.startsWith("./")) {
        await addLocalQueries(codeQL, resultMap, queryUses.slice(2), checkoutPath, configFile);
        return;
    }
    // Check for one of the builtin suites
    if (queryUses.indexOf("/") === -1 && queryUses.indexOf("@") === -1) {
        await addBuiltinSuiteQueries(languages, codeQL, resultMap, queryUses, configFile);
        return;
    }
    // Otherwise, must be a reference to another repo
    await addRemoteQueries(codeQL, resultMap, queryUses, tempDir, githubUrl, logger, configFile);
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
function validateAndSanitisePath(originalPath, propertyName, configFile, logger) {
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
        throw new Error(getConfigFilePropertyError(configFile, propertyName, `"${originalPath}" is not an invalid path. ` +
            `It is not necessary to include it, and it is not allowed to exclude it.`));
    }
    // Check for illegal uses of **
    if (newPath.match(pathStarsRegex)) {
        throw new Error(getConfigFilePropertyError(configFile, propertyName, `"${originalPath}" contains an invalid "**" wildcard. ` +
            `They must be immediately preceded and followed by a slash as in "/**/", or come at the start or end.`));
    }
    // Check for other regex characters that we don't support.
    // Output a warning so the user knows, but otherwise continue normally.
    if (newPath.match(filterPatternCharactersRegex)) {
        logger.warning(getConfigFilePropertyError(configFile, propertyName, `"${originalPath}" contains an unsupported character. ` +
            `The filter pattern characters ?, +, [, ], ! are not supported and will be matched literally.`));
    }
    // Ban any uses of backslash for now.
    // This may not play nicely with project layouts.
    // This restriction can be lifted later if we determine they are ok.
    if (newPath.indexOf("\\") !== -1) {
        throw new Error(getConfigFilePropertyError(configFile, propertyName, `"${originalPath}" contains an "\\" character. These are not allowed in filters. ` +
            `If running on windows we recommend using "/" instead for path filters.`));
    }
    return newPath;
}
exports.validateAndSanitisePath = validateAndSanitisePath;
// An undefined configFile in some of these functions indicates that
// the property was in a workflow file, not a config file
function getNameInvalid(configFile) {
    return getConfigFilePropertyError(configFile, NAME_PROPERTY, "must be a non-empty string");
}
exports.getNameInvalid = getNameInvalid;
function getDisableDefaultQueriesInvalid(configFile) {
    return getConfigFilePropertyError(configFile, DISABLE_DEFAULT_QUERIES_PROPERTY, "must be a boolean");
}
exports.getDisableDefaultQueriesInvalid = getDisableDefaultQueriesInvalid;
function getQueriesInvalid(configFile) {
    return getConfigFilePropertyError(configFile, QUERIES_PROPERTY, "must be an array");
}
exports.getQueriesInvalid = getQueriesInvalid;
function getQueryUsesInvalid(configFile, queryUses) {
    return getConfigFilePropertyError(configFile, `${QUERIES_PROPERTY}.${QUERIES_USES_PROPERTY}`, `must be a built-in suite (${builtinSuites.join(" or ")}), a relative path, or be of the form "owner/repo[/path]@ref"${queryUses !== undefined ? `\n Found: ${queryUses}` : ""}`);
}
exports.getQueryUsesInvalid = getQueryUsesInvalid;
function getPathsIgnoreInvalid(configFile) {
    return getConfigFilePropertyError(configFile, PATHS_IGNORE_PROPERTY, "must be an array of non-empty strings");
}
exports.getPathsIgnoreInvalid = getPathsIgnoreInvalid;
function getPathsInvalid(configFile) {
    return getConfigFilePropertyError(configFile, PATHS_PROPERTY, "must be an array of non-empty strings");
}
exports.getPathsInvalid = getPathsInvalid;
function getLocalPathOutsideOfRepository(configFile, localPath) {
    return getConfigFilePropertyError(configFile, `${QUERIES_PROPERTY}.${QUERIES_USES_PROPERTY}`, `is invalid as the local path "${localPath}" is outside of the repository`);
}
exports.getLocalPathOutsideOfRepository = getLocalPathOutsideOfRepository;
function getLocalPathDoesNotExist(configFile, localPath) {
    return getConfigFilePropertyError(configFile, `${QUERIES_PROPERTY}.${QUERIES_USES_PROPERTY}`, `is invalid as the local path "${localPath}" does not exist in the repository`);
}
exports.getLocalPathDoesNotExist = getLocalPathDoesNotExist;
function getConfigFileOutsideWorkspaceErrorMessage(configFile) {
    return `The configuration file "${configFile}" is outside of the workspace`;
}
exports.getConfigFileOutsideWorkspaceErrorMessage = getConfigFileOutsideWorkspaceErrorMessage;
function getConfigFileDoesNotExistErrorMessage(configFile) {
    return `The configuration file "${configFile}" does not exist`;
}
exports.getConfigFileDoesNotExistErrorMessage = getConfigFileDoesNotExistErrorMessage;
function getConfigFileRepoFormatInvalidMessage(configFile) {
    let error = `The configuration file "${configFile}" is not a supported remote file reference.`;
    error += " Expected format <owner>/<repository>/<file-path>@<ref>";
    return error;
}
exports.getConfigFileRepoFormatInvalidMessage = getConfigFileRepoFormatInvalidMessage;
function getConfigFileFormatInvalidMessage(configFile) {
    return `The configuration file "${configFile}" could not be read`;
}
exports.getConfigFileFormatInvalidMessage = getConfigFileFormatInvalidMessage;
function getConfigFileDirectoryGivenMessage(configFile) {
    return `The configuration file "${configFile}" looks like a directory, not a file`;
}
exports.getConfigFileDirectoryGivenMessage = getConfigFileDirectoryGivenMessage;
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
exports.getNoLanguagesError = getNoLanguagesError;
function getUnknownLanguagesError(languages) {
    return `Did not recognise the following languages: ${languages.join(", ")}`;
}
exports.getUnknownLanguagesError = getUnknownLanguagesError;
/**
 * Gets the set of languages in the current repository
 */
async function getLanguagesInRepo(repository, apiDetails, mode, logger) {
    logger.debug(`GitHub repo ${repository.owner} ${repository.repo}`);
    const response = await api
        .getApiClient(apiDetails, mode, logger, true)
        .repos.listLanguages({
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
        const parsedLang = languages_1.parseLanguage(lang);
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
async function getLanguages(languagesInput, repository, apiDetails, mode, logger) {
    // Obtain from action input 'languages' if set
    let languages = (languagesInput || "")
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
    logger.info(`Languages from configuration: ${JSON.stringify(languages)}`);
    if (languages.length === 0) {
        // Obtain languages as all languages in the repo that can be analysed
        languages = await getLanguagesInRepo(repository, apiDetails, mode, logger);
        logger.info(`Automatically detected languages: ${JSON.stringify(languages)}`);
    }
    // If the languages parameter was not given and no languages were
    // detected then fail here as this is a workflow configuration error.
    if (languages.length === 0) {
        throw new Error(getNoLanguagesError());
    }
    // Make sure they are supported
    const parsedLanguages = [];
    const unknownLanguages = [];
    for (const language of languages) {
        const parsedLanguage = languages_1.parseLanguage(language);
        if (parsedLanguage === undefined) {
            unknownLanguages.push(language);
        }
        else if (parsedLanguages.indexOf(parsedLanguage) === -1) {
            parsedLanguages.push(parsedLanguage);
        }
    }
    if (unknownLanguages.length > 0) {
        throw new Error(getUnknownLanguagesError(unknownLanguages));
    }
    return parsedLanguages;
}
async function addQueriesFromWorkflow(codeQL, queriesInput, languages, resultMap, tempDir, checkoutPath, githubUrl, logger) {
    queriesInput = queriesInput.trim();
    // "+" means "don't override config file" - see shouldAddConfigFileQueries
    queriesInput = queriesInput.replace(/^\+/, "");
    for (const query of queriesInput.split(",")) {
        await parseQueryUses(languages, codeQL, resultMap, query, tempDir, checkoutPath, githubUrl, logger);
    }
}
// Returns true if either no queries were provided in the workflow.
// or if the queries in the workflow were provided in "additive" mode,
// indicating that they shouldn't override the config queries but
// should instead be added in addition
function shouldAddConfigFileQueries(queriesInput) {
    if (queriesInput) {
        return queriesInput.trimStart().substr(0, 1) === "+";
    }
    return true;
}
/**
 * Get the default config for when the user has not supplied one.
 */
async function getDefaultConfig(languagesInput, queriesInput, repository, tempDir, toolCacheDir, codeQL, checkoutPath, apiDetails, mode, logger) {
    const languages = await getLanguages(languagesInput, repository, apiDetails, mode, logger);
    const queries = {};
    await addDefaultQueries(codeQL, languages, queries);
    if (queriesInput) {
        await addQueriesFromWorkflow(codeQL, queriesInput, languages, queries, tempDir, checkoutPath, apiDetails.url, logger);
    }
    return {
        languages,
        queries,
        pathsIgnore: [],
        paths: [],
        originalUserInput: {},
        tempDir,
        toolCacheDir,
        codeQLCmd: codeQL.getPath(),
    };
}
exports.getDefaultConfig = getDefaultConfig;
/**
 * Load the config from the given file.
 */
async function loadConfig(languagesInput, queriesInput, configFile, repository, tempDir, toolCacheDir, codeQL, checkoutPath, apiDetails, mode, logger) {
    let parsedYAML;
    if (isLocal(configFile)) {
        // Treat the config file as relative to the workspace
        configFile = path.resolve(checkoutPath, configFile);
        parsedYAML = getLocalConfig(configFile, checkoutPath);
    }
    else {
        parsedYAML = await getRemoteConfig(configFile, apiDetails, mode, logger);
    }
    // Validate that the 'name' property is syntactically correct,
    // even though we don't use the value yet.
    if (NAME_PROPERTY in parsedYAML) {
        if (typeof parsedYAML[NAME_PROPERTY] !== "string") {
            throw new Error(getNameInvalid(configFile));
        }
        if (parsedYAML[NAME_PROPERTY].length === 0) {
            throw new Error(getNameInvalid(configFile));
        }
    }
    const languages = await getLanguages(languagesInput, repository, apiDetails, mode, logger);
    const queries = {};
    const pathsIgnore = [];
    const paths = [];
    let disableDefaultQueries = false;
    if (DISABLE_DEFAULT_QUERIES_PROPERTY in parsedYAML) {
        if (typeof parsedYAML[DISABLE_DEFAULT_QUERIES_PROPERTY] !== "boolean") {
            throw new Error(getDisableDefaultQueriesInvalid(configFile));
        }
        disableDefaultQueries = parsedYAML[DISABLE_DEFAULT_QUERIES_PROPERTY];
    }
    if (!disableDefaultQueries) {
        await addDefaultQueries(codeQL, languages, queries);
    }
    // If queries were provided using `with` in the action configuration,
    // they should take precedence over the queries in the config file
    // unless they're prefixed with "+", in which case they supplement those
    // in the config file.
    if (queriesInput) {
        await addQueriesFromWorkflow(codeQL, queriesInput, languages, queries, tempDir, checkoutPath, apiDetails.url, logger);
    }
    if (shouldAddConfigFileQueries(queriesInput) &&
        QUERIES_PROPERTY in parsedYAML) {
        if (!(parsedYAML[QUERIES_PROPERTY] instanceof Array)) {
            throw new Error(getQueriesInvalid(configFile));
        }
        for (const query of parsedYAML[QUERIES_PROPERTY]) {
            if (!(QUERIES_USES_PROPERTY in query) ||
                typeof query[QUERIES_USES_PROPERTY] !== "string") {
                throw new Error(getQueryUsesInvalid(configFile));
            }
            await parseQueryUses(languages, codeQL, queries, query[QUERIES_USES_PROPERTY], tempDir, checkoutPath, apiDetails.url, logger, configFile);
        }
    }
    if (PATHS_IGNORE_PROPERTY in parsedYAML) {
        if (!(parsedYAML[PATHS_IGNORE_PROPERTY] instanceof Array)) {
            throw new Error(getPathsIgnoreInvalid(configFile));
        }
        for (const ignorePath of parsedYAML[PATHS_IGNORE_PROPERTY]) {
            if (typeof ignorePath !== "string" || ignorePath === "") {
                throw new Error(getPathsIgnoreInvalid(configFile));
            }
            pathsIgnore.push(validateAndSanitisePath(ignorePath, PATHS_IGNORE_PROPERTY, configFile, logger));
        }
    }
    if (PATHS_PROPERTY in parsedYAML) {
        if (!(parsedYAML[PATHS_PROPERTY] instanceof Array)) {
            throw new Error(getPathsInvalid(configFile));
        }
        for (const includePath of parsedYAML[PATHS_PROPERTY]) {
            if (typeof includePath !== "string" || includePath === "") {
                throw new Error(getPathsInvalid(configFile));
            }
            paths.push(validateAndSanitisePath(includePath, PATHS_PROPERTY, configFile, logger));
        }
    }
    // The list of queries should not be empty for any language. If it is then
    // it is a user configuration error.
    for (const language of languages) {
        if (queries[language] === undefined ||
            (queries[language].builtin.length === 0 &&
                queries[language].custom.length === 0)) {
            throw new Error(`Did not detect any queries to run for ${language}. ` +
                "Please make sure that the default queries are enabled, or you are specifying queries to run.");
        }
    }
    return {
        languages,
        queries,
        pathsIgnore,
        paths,
        originalUserInput: parsedYAML,
        tempDir,
        toolCacheDir,
        codeQLCmd: codeQL.getPath(),
    };
}
/**
 * Load and return the config.
 *
 * This will parse the config from the user input if present, or generate
 * a default config. The parsed config is then stored to a known location.
 */
async function initConfig(languagesInput, queriesInput, configFile, repository, tempDir, toolCacheDir, codeQL, checkoutPath, apiDetails, mode, logger) {
    let config;
    // If no config file was provided create an empty one
    if (!configFile) {
        logger.debug("No configuration file was provided");
        config = await getDefaultConfig(languagesInput, queriesInput, repository, tempDir, toolCacheDir, codeQL, checkoutPath, apiDetails, mode, logger);
    }
    else {
        config = await loadConfig(languagesInput, queriesInput, configFile, repository, tempDir, toolCacheDir, codeQL, checkoutPath, apiDetails, mode, logger);
    }
    // Save the config so we can easily access it again in the future
    await saveConfig(config, logger);
    return config;
}
exports.initConfig = initConfig;
function isLocal(configPath) {
    // If the path starts with ./, look locally
    if (configPath.indexOf("./") === 0) {
        return true;
    }
    return configPath.indexOf("@") === -1;
}
function getLocalConfig(configFile, checkoutPath) {
    // Error if the config file is now outside of the workspace
    if (!(configFile + path.sep).startsWith(checkoutPath + path.sep)) {
        throw new Error(getConfigFileOutsideWorkspaceErrorMessage(configFile));
    }
    // Error if the file does not exist
    if (!fs.existsSync(configFile)) {
        throw new Error(getConfigFileDoesNotExistErrorMessage(configFile));
    }
    return yaml.safeLoad(fs.readFileSync(configFile, "utf8"));
}
async function getRemoteConfig(configFile, apiDetails, mode, logger) {
    // retrieve the various parts of the config location, and ensure they're present
    const format = new RegExp("(?<owner>[^/]+)/(?<repo>[^/]+)/(?<path>[^@]+)@(?<ref>.*)");
    const pieces = format.exec(configFile);
    // 5 = 4 groups + the whole expression
    if (pieces === null || pieces.groups === undefined || pieces.length < 5) {
        throw new Error(getConfigFileRepoFormatInvalidMessage(configFile));
    }
    const response = await api
        .getApiClient(apiDetails, mode, logger, true)
        .repos.getContent({
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
        throw new Error(getConfigFileDirectoryGivenMessage(configFile));
    }
    else {
        throw new Error(getConfigFileFormatInvalidMessage(configFile));
    }
    return yaml.safeLoad(Buffer.from(fileContents, "base64").toString("binary"));
}
/**
 * Get the file path where the parsed config will be stored.
 */
function getPathToParsedConfigFile(tempDir) {
    return path.join(tempDir, "config");
}
exports.getPathToParsedConfigFile = getPathToParsedConfigFile;
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
exports.getConfig = getConfig;
//# sourceMappingURL=config-utils.js.map