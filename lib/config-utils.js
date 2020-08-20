"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const yaml = __importStar(require("js-yaml"));
const path = __importStar(require("path"));
const api = __importStar(require("./api-client"));
const codeql_1 = require("./codeql");
const externalQueries = __importStar(require("./external-queries"));
const util = __importStar(require("./util"));
// Property names from the user-supplied config file.
const NAME_PROPERTY = 'name';
const DISABLE_DEFAULT_QUERIES_PROPERTY = 'disable-default-queries';
const QUERIES_PROPERTY = 'queries';
const QUERIES_USES_PROPERTY = 'uses';
const PATHS_IGNORE_PROPERTY = 'paths-ignore';
const PATHS_PROPERTY = 'paths';
// All the languages supported by CodeQL
const ALL_LANGUAGES = ['csharp', 'cpp', 'go', 'java', 'javascript', 'python'];
// Some alternate names for languages
const LANGUAGE_ALIASES = {
    'c': 'cpp',
    'typescript': 'javascript',
};
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
    'csharp': [
        'ql/src/Security Features/CWE-937/VulnerablePackage.ql',
        'ql/src/Security Features/CWE-451/MissingXFrameOptions.ql',
    ]
};
function queryIsDisabled(language, query) {
    return (DISABLED_BUILTIN_QUERIES[language] || [])
        .some(disabledQuery => query.endsWith(disabledQuery));
}
/**
 * Asserts that the noDeclaredLanguage and multipleDeclaredLanguages fields are
 * both empty and errors if they are not.
 */
function validateQueries(resolvedQueries) {
    const noDeclaredLanguage = resolvedQueries.noDeclaredLanguage;
    const noDeclaredLanguageQueries = Object.keys(noDeclaredLanguage);
    if (noDeclaredLanguageQueries.length !== 0) {
        throw new Error('The following queries do not declare a language. ' +
            'Their qlpack.yml files are either missing or is invalid.\n' +
            noDeclaredLanguageQueries.join('\n'));
    }
    const multipleDeclaredLanguages = resolvedQueries.multipleDeclaredLanguages;
    const multipleDeclaredLanguagesQueries = Object.keys(multipleDeclaredLanguages);
    if (multipleDeclaredLanguagesQueries.length !== 0) {
        throw new Error('The following queries declare multiple languages. ' +
            'Their qlpack.yml files are either missing or is invalid.\n' +
            multipleDeclaredLanguagesQueries.join('\n'));
    }
}
/**
 * Run 'codeql resolve queries' and add the results to resultMap
 */
async function runResolveQueries(resultMap, toResolve, extraSearchPath, errorOnInvalidQueries) {
    const codeQl = codeql_1.getCodeQL();
    const resolvedQueries = await codeQl.resolveQueries(toResolve, extraSearchPath);
    for (const [language, queries] of Object.entries(resolvedQueries.byLanguage)) {
        if (resultMap[language] === undefined) {
            resultMap[language] = [];
        }
        resultMap[language].push(...Object.keys(queries).filter(q => !queryIsDisabled(language, q)));
    }
    if (errorOnInvalidQueries) {
        validateQueries(resolvedQueries);
    }
}
/**
 * Get the set of queries included by default.
 */
async function addDefaultQueries(languages, resultMap) {
    const suites = languages.map(l => l + '-code-scanning.qls');
    await runResolveQueries(resultMap, suites, undefined, false);
}
// The set of acceptable values for built-in suites from the codeql bundle
const builtinSuites = ['security-extended', 'security-and-quality'];
/**
 * Determine the set of queries associated with suiteName's suites and add them to resultMap.
 * Throws an error if suiteName is not a valid builtin suite.
 */
async function addBuiltinSuiteQueries(configFile, languages, resultMap, suiteName) {
    const suite = builtinSuites.find((suite) => suite === suiteName);
    if (!suite) {
        throw new Error(getQueryUsesInvalid(configFile, suiteName));
    }
    const suites = languages.map(l => l + '-' + suiteName + '.qls');
    await runResolveQueries(resultMap, suites, undefined, false);
}
/**
 * Retrieve the set of queries at localQueryPath and add them to resultMap.
 */
async function addLocalQueries(configFile, resultMap, localQueryPath) {
    // Resolve the local path against the workspace so that when this is
    // passed to codeql it resolves to exactly the path we expect it to resolve to.
    const workspacePath = fs.realpathSync(util.getRequiredEnvParam('GITHUB_WORKSPACE'));
    let absoluteQueryPath = path.join(workspacePath, localQueryPath);
    // Check the file exists
    if (!fs.existsSync(absoluteQueryPath)) {
        throw new Error(getLocalPathDoesNotExist(configFile, localQueryPath));
    }
    // Call this after checking file exists, because it'll fail if file doesn't exist
    absoluteQueryPath = fs.realpathSync(absoluteQueryPath);
    // Check the local path doesn't jump outside the repo using '..' or symlinks
    if (!(absoluteQueryPath + path.sep).startsWith(workspacePath + path.sep)) {
        throw new Error(getLocalPathOutsideOfRepository(configFile, localQueryPath));
    }
    // Get the root of the current repo to use when resolving query dependencies
    const rootOfRepo = util.getRequiredEnvParam('GITHUB_WORKSPACE');
    await runResolveQueries(resultMap, [absoluteQueryPath], rootOfRepo, true);
}
/**
 * Retrieve the set of queries at the referenced remote repo and add them to resultMap.
 */
async function addRemoteQueries(configFile, resultMap, queryUses) {
    let tok = queryUses.split('@');
    if (tok.length !== 2) {
        throw new Error(getQueryUsesInvalid(configFile, queryUses));
    }
    const ref = tok[1];
    tok = tok[0].split('/');
    // The first token is the owner
    // The second token is the repo
    // The rest is a path, if there is more than one token combine them to form the full path
    if (tok.length < 2) {
        throw new Error(getQueryUsesInvalid(configFile, queryUses));
    }
    // Check none of the parts of the repository name are empty
    if (tok[0].trim() === '' || tok[1].trim() === '') {
        throw new Error(getQueryUsesInvalid(configFile, queryUses));
    }
    const nwo = tok[0] + '/' + tok[1];
    // Checkout the external repository
    const rootOfRepo = await externalQueries.checkoutExternalRepository(nwo, ref);
    const queryPath = tok.length > 2
        ? path.join(rootOfRepo, tok.slice(2).join('/'))
        : rootOfRepo;
    await runResolveQueries(resultMap, [queryPath], rootOfRepo, true);
}
/**
 * Parse a query 'uses' field to a discrete set of query files and update resultMap.
 *
 * The logic for parsing the string is based on what actions does for
 * parsing the 'uses' actions in the workflow file. So it can handle
 * local paths starting with './', or references to remote repos, or
 * a finite set of hardcoded terms for builtin suites.
 */
async function parseQueryUses(configFile, languages, resultMap, queryUses) {
    queryUses = queryUses.trim();
    if (queryUses === "") {
        throw new Error(getQueryUsesInvalid(configFile));
    }
    // Check for the local path case before we start trying to parse the repository name
    if (queryUses.startsWith("./")) {
        await addLocalQueries(configFile, resultMap, queryUses.slice(2));
        return;
    }
    // Check for one of the builtin suites
    if (queryUses.indexOf('/') === -1 && queryUses.indexOf('@') === -1) {
        await addBuiltinSuiteQueries(configFile, languages, resultMap, queryUses);
        return;
    }
    // Otherwise, must be a reference to another repo
    await addRemoteQueries(configFile, resultMap, queryUses);
}
// Regex validating stars in paths or paths-ignore entries.
// The intention is to only allow ** to appear when immediately
// preceded and followed by a slash.
const pathStarsRegex = /.*(?:\*\*[^/].*|\*\*$|[^/]\*\*.*)/;
// Characters that are supported by filters in workflows, but not by us.
// See https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions#filter-pattern-cheat-sheet
const filterPatternCharactersRegex = /.*[\?\+\[\]!].*/;
// Checks that a paths of paths-ignore entry is valid, possibly modifying it
// to make it valid, or if not possible then throws an error.
function validateAndSanitisePath(originalPath, propertyName, configFile) {
    // Take a copy so we don't modify the original path, so we can still construct error messages
    let path = originalPath;
    // All paths are relative to the src root, so strip off leading slashes.
    while (path.charAt(0) === '/') {
        path = path.substring(1);
    }
    // Trailing ** are redundant, so strip them off
    if (path.endsWith('/**')) {
        path = path.substring(0, path.length - 2);
    }
    // An empty path is not allowed as it's meaningless
    if (path === '') {
        throw new Error(getConfigFilePropertyError(configFile, propertyName, '"' + originalPath + '" is not an invalid path. ' +
            'It is not necessary to include it, and it is not allowed to exclude it.'));
    }
    // Check for illegal uses of **
    if (path.match(pathStarsRegex)) {
        throw new Error(getConfigFilePropertyError(configFile, propertyName, '"' + originalPath + '" contains an invalid "**" wildcard. ' +
            'They must be immediately preceeded and followed by a slash as in "/**/", or come at the start or end.'));
    }
    // Check for other regex characters that we don't support.
    // Output a warning so the user knows, but otherwise continue normally.
    if (path.match(filterPatternCharactersRegex)) {
        core.warning(getConfigFilePropertyError(configFile, propertyName, '"' + originalPath + '" contains an unsupported character. ' +
            'The filter pattern characters ?, +, [, ], ! are not supported and will be matched literally.'));
    }
    // Ban any uses of backslash for now.
    // This may not play nicely with project layouts.
    // This restriction can be lifted later if we determine they are ok.
    if (path.indexOf('\\') !== -1) {
        throw new Error(getConfigFilePropertyError(configFile, propertyName, '"' + originalPath + '" contains an "\\" character. These are not allowed in filters. ' +
            'If running on windows we recommend using "/" instead for path filters.'));
    }
    return path;
}
exports.validateAndSanitisePath = validateAndSanitisePath;
function getNameInvalid(configFile) {
    return getConfigFilePropertyError(configFile, NAME_PROPERTY, 'must be a non-empty string');
}
exports.getNameInvalid = getNameInvalid;
function getDisableDefaultQueriesInvalid(configFile) {
    return getConfigFilePropertyError(configFile, DISABLE_DEFAULT_QUERIES_PROPERTY, 'must be a boolean');
}
exports.getDisableDefaultQueriesInvalid = getDisableDefaultQueriesInvalid;
function getQueriesInvalid(configFile) {
    return getConfigFilePropertyError(configFile, QUERIES_PROPERTY, 'must be an array');
}
exports.getQueriesInvalid = getQueriesInvalid;
function getQueryUsesInvalid(configFile, queryUses) {
    return getConfigFilePropertyError(configFile, QUERIES_PROPERTY + '.' + QUERIES_USES_PROPERTY, 'must be a built-in suite (' + builtinSuites.join(' or ') +
        '), a relative path, or be of the form "owner/repo[/path]@ref"' +
        (queryUses !== undefined ? '\n Found: ' + queryUses : ''));
}
exports.getQueryUsesInvalid = getQueryUsesInvalid;
function getPathsIgnoreInvalid(configFile) {
    return getConfigFilePropertyError(configFile, PATHS_IGNORE_PROPERTY, 'must be an array of non-empty strings');
}
exports.getPathsIgnoreInvalid = getPathsIgnoreInvalid;
function getPathsInvalid(configFile) {
    return getConfigFilePropertyError(configFile, PATHS_PROPERTY, 'must be an array of non-empty strings');
}
exports.getPathsInvalid = getPathsInvalid;
function getLocalPathOutsideOfRepository(configFile, localPath) {
    return getConfigFilePropertyError(configFile, QUERIES_PROPERTY + '.' + QUERIES_USES_PROPERTY, 'is invalid as the local path "' + localPath + '" is outside of the repository');
}
exports.getLocalPathOutsideOfRepository = getLocalPathOutsideOfRepository;
function getLocalPathDoesNotExist(configFile, localPath) {
    return getConfigFilePropertyError(configFile, QUERIES_PROPERTY + '.' + QUERIES_USES_PROPERTY, 'is invalid as the local path "' + localPath + '" does not exist in the repository');
}
exports.getLocalPathDoesNotExist = getLocalPathDoesNotExist;
function getConfigFileOutsideWorkspaceErrorMessage(configFile) {
    return 'The configuration file "' + configFile + '" is outside of the workspace';
}
exports.getConfigFileOutsideWorkspaceErrorMessage = getConfigFileOutsideWorkspaceErrorMessage;
function getConfigFileDoesNotExistErrorMessage(configFile) {
    return 'The configuration file "' + configFile + '" does not exist';
}
exports.getConfigFileDoesNotExistErrorMessage = getConfigFileDoesNotExistErrorMessage;
function getConfigFileRepoFormatInvalidMessage(configFile) {
    let error = 'The configuration file "' + configFile + '" is not a supported remote file reference.';
    error += ' Expected format <owner>/<repository>/<file-path>@<ref>';
    return error;
}
exports.getConfigFileRepoFormatInvalidMessage = getConfigFileRepoFormatInvalidMessage;
function getConfigFileFormatInvalidMessage(configFile, reason) {
    return 'The configuration file "' + configFile + '" could not be read. Reason: ' + reason;
}
exports.getConfigFileFormatInvalidMessage = getConfigFileFormatInvalidMessage;
function getConfigFilePropertyError(configFile, property, error) {
    return 'The configuration file "' + configFile + '" is invalid: property "' + property + '" ' + error;
}
function getNoLanguagesError() {
    return "Did not detect any languages to analyze. " +
        "Please update input in workflow or check that GitHub detects the correct languages in your repository.";
}
exports.getNoLanguagesError = getNoLanguagesError;
function getUnknownLanguagesError(languages) {
    return "Did not recognise the following languages: " + languages.join(', ');
}
exports.getUnknownLanguagesError = getUnknownLanguagesError;
/**
 * Gets the set of languages in the current repository
 */
async function getLanguagesInRepo() {
    var _a;
    // Translate between GitHub's API names for languages and ours
    const codeqlLanguages = {
        'C': 'cpp',
        'C++': 'cpp',
        'C#': 'csharp',
        'Go': 'go',
        'Java': 'java',
        'JavaScript': 'javascript',
        'TypeScript': 'javascript',
        'Python': 'python',
    };
    let repo_nwo = (_a = process.env['GITHUB_REPOSITORY']) === null || _a === void 0 ? void 0 : _a.split("/");
    if (repo_nwo) {
        let owner = repo_nwo[0];
        let repo = repo_nwo[1];
        core.debug(`GitHub repo ${owner} ${repo}`);
        const response = await api.getActionsApiClient(true).repos.listLanguages({
            owner,
            repo
        });
        core.debug("Languages API response: " + JSON.stringify(response));
        // The GitHub API is going to return languages in order of popularity,
        // When we pick a language to autobuild we want to pick the most popular traced language
        // Since sets in javascript maintain insertion order, using a set here and then splatting it
        // into an array gives us an array of languages ordered by popularity
        let languages = new Set();
        for (let lang in response.data) {
            if (lang in codeqlLanguages) {
                languages.add(codeqlLanguages[lang]);
            }
        }
        return [...languages];
    }
    else {
        return [];
    }
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
async function getLanguages() {
    // Obtain from action input 'languages' if set
    let languages = core.getInput('languages', { required: false })
        .split(',')
        .map(x => x.trim())
        .filter(x => x.length > 0);
    core.info("Languages from configuration: " + JSON.stringify(languages));
    if (languages.length === 0) {
        // Obtain languages as all languages in the repo that can be analysed
        languages = await getLanguagesInRepo();
        core.info("Automatically detected languages: " + JSON.stringify(languages));
    }
    // If the languages parameter was not given and no languages were
    // detected then fail here as this is a workflow configuration error.
    if (languages.length === 0) {
        throw new Error(getNoLanguagesError());
    }
    // Make sure they are supported
    const checkedLanguages = [];
    const unknownLanguages = [];
    for (let language of languages) {
        // Normalise to lower case
        language = language.toLowerCase();
        // Resolve any known aliases
        if (language in LANGUAGE_ALIASES) {
            language = LANGUAGE_ALIASES[language];
        }
        const checkedLanguage = ALL_LANGUAGES.find(l => l === language);
        if (checkedLanguage === undefined) {
            unknownLanguages.push(language);
        }
        else if (checkedLanguages.indexOf(checkedLanguage) === -1) {
            checkedLanguages.push(checkedLanguage);
        }
    }
    if (unknownLanguages.length > 0) {
        throw new Error(getUnknownLanguagesError(unknownLanguages));
    }
    return checkedLanguages;
}
/**
 * Get the default config for when the user has not supplied one.
 */
async function getDefaultConfig() {
    const languages = await getLanguages();
    const queries = {};
    await addDefaultQueries(languages, queries);
    return {
        languages: languages,
        queries: queries,
        pathsIgnore: [],
        paths: [],
        originalUserInput: {},
    };
}
exports.getDefaultConfig = getDefaultConfig;
/**
 * Load the config from the given file.
 */
async function loadConfig(configFile) {
    let parsedYAML;
    if (isLocal(configFile)) {
        // Treat the config file as relative to the workspace
        const workspacePath = util.getRequiredEnvParam('GITHUB_WORKSPACE');
        configFile = path.resolve(workspacePath, configFile);
        parsedYAML = getLocalConfig(configFile, workspacePath);
    }
    else {
        parsedYAML = await getRemoteConfig(configFile);
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
    const languages = await getLanguages();
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
        await addDefaultQueries(languages, queries);
    }
    if (QUERIES_PROPERTY in parsedYAML) {
        if (!(parsedYAML[QUERIES_PROPERTY] instanceof Array)) {
            throw new Error(getQueriesInvalid(configFile));
        }
        for (const query of parsedYAML[QUERIES_PROPERTY]) {
            if (!(QUERIES_USES_PROPERTY in query) || typeof query[QUERIES_USES_PROPERTY] !== "string") {
                throw new Error(getQueryUsesInvalid(configFile));
            }
            await parseQueryUses(configFile, languages, queries, query[QUERIES_USES_PROPERTY]);
        }
    }
    if (PATHS_IGNORE_PROPERTY in parsedYAML) {
        if (!(parsedYAML[PATHS_IGNORE_PROPERTY] instanceof Array)) {
            throw new Error(getPathsIgnoreInvalid(configFile));
        }
        parsedYAML[PATHS_IGNORE_PROPERTY].forEach(path => {
            if (typeof path !== "string" || path === '') {
                throw new Error(getPathsIgnoreInvalid(configFile));
            }
            pathsIgnore.push(validateAndSanitisePath(path, PATHS_IGNORE_PROPERTY, configFile));
        });
    }
    if (PATHS_PROPERTY in parsedYAML) {
        if (!(parsedYAML[PATHS_PROPERTY] instanceof Array)) {
            throw new Error(getPathsInvalid(configFile));
        }
        parsedYAML[PATHS_PROPERTY].forEach(path => {
            if (typeof path !== "string" || path === '') {
                throw new Error(getPathsInvalid(configFile));
            }
            paths.push(validateAndSanitisePath(path, PATHS_PROPERTY, configFile));
        });
    }
    // The list of queries should not be empty for any language. If it is then
    // it is a user configuration error.
    for (const language of languages) {
        if (queries[language] === undefined || queries[language].length === 0) {
            throw new Error(`Did not detect any queries to run for ${language}. ` +
                "Please make sure that the default queries are enabled, or you are specifying queries to run.");
        }
    }
    return {
        languages,
        queries,
        pathsIgnore,
        paths,
        originalUserInput: parsedYAML
    };
}
/**
 * Load and return the config.
 *
 * This will parse the config from the user input if present, or generate
 * a default config. The parsed config is then stored to a known location.
 */
async function initConfig() {
    const configFile = core.getInput('config-file');
    let config;
    // If no config file was provided create an empty one
    if (configFile === '') {
        core.debug('No configuration file was provided');
        config = await getDefaultConfig();
    }
    else {
        config = await loadConfig(configFile);
    }
    // Save the config so we can easily access it again in the future
    await saveConfig(config);
    return config;
}
exports.initConfig = initConfig;
function isLocal(configPath) {
    // If the path starts with ./, look locally
    if (configPath.indexOf("./") === 0) {
        return true;
    }
    return (configPath.indexOf("@") === -1);
}
function getLocalConfig(configFile, workspacePath) {
    // Error if the config file is now outside of the workspace
    if (!(configFile + path.sep).startsWith(workspacePath + path.sep)) {
        throw new Error(getConfigFileOutsideWorkspaceErrorMessage(configFile));
    }
    // Error if the file does not exist
    if (!fs.existsSync(configFile)) {
        throw new Error(getConfigFileDoesNotExistErrorMessage(configFile));
    }
    return yaml.safeLoad(fs.readFileSync(configFile, 'utf8'));
}
async function getRemoteConfig(configFile) {
    // retrieve the various parts of the config location, and ensure they're present
    const format = new RegExp('(?<owner>[^/]+)/(?<repo>[^/]+)/(?<path>[^@]+)@(?<ref>.*)');
    const pieces = format.exec(configFile);
    // 5 = 4 groups + the whole expression
    if (pieces === null || pieces.groups === undefined || pieces.length < 5) {
        throw new Error(getConfigFileRepoFormatInvalidMessage(configFile));
    }
    let fileContents;
    try {
        fileContents = await util.getFileContentsUsingAPI(pieces.groups.owner, pieces.groups.repo, pieces.groups.path, pieces.groups.ref);
    }
    catch (err) {
        throw new Error(getConfigFileFormatInvalidMessage(configFile, err.message));
    }
    return yaml.safeLoad(fileContents);
}
/**
 * Get the file path where the parsed config will be stored.
 */
function getPathToParsedConfigFile() {
    return path.join(util.getRequiredEnvParam('RUNNER_TEMP'), 'config');
}
exports.getPathToParsedConfigFile = getPathToParsedConfigFile;
/**
 * Store the given config to the path returned from getPathToParsedConfigFile.
 */
async function saveConfig(config) {
    const configString = JSON.stringify(config);
    const configFile = getPathToParsedConfigFile();
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    fs.writeFileSync(configFile, configString, 'utf8');
    core.debug('Saved config:');
    core.debug(configString);
}
/**
 * Get the config.
 *
 * If this is the first time in a workflow that this is being called then
 * this will parse the config from the user input. The parsed config is then
 * stored to a known location. On the second and further calls, this will
 * return the contents of the parsed config from the known location.
 */
async function getConfig() {
    const configFile = getPathToParsedConfigFile();
    if (!fs.existsSync(configFile)) {
        throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
    }
    const configString = fs.readFileSync(configFile, 'utf8');
    core.debug('Loaded config:');
    core.debug(configString);
    return JSON.parse(configString);
}
exports.getConfig = getConfig;
//# sourceMappingURL=config-utils.js.map