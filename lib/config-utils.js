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
const io = __importStar(require("@actions/io"));
const fs = __importStar(require("fs"));
const yaml = __importStar(require("js-yaml"));
const path = __importStar(require("path"));
const api = __importStar(require("./api-client"));
const util = __importStar(require("./util"));
const NAME_PROPERTY = 'name';
const DISPLAY_DEFAULT_QUERIES_PROPERTY = 'disable-default-queries';
const QUERIES_PROPERTY = 'queries';
const QUERIES_USES_PROPERTY = 'uses';
const PATHS_IGNORE_PROPERTY = 'paths-ignore';
const PATHS_PROPERTY = 'paths';
class ExternalQuery {
    constructor(repository, ref) {
        this.path = '';
        this.repository = repository;
        this.ref = ref;
    }
}
exports.ExternalQuery = ExternalQuery;
// The set of acceptable values for built-in suites from the codeql bundle
const builtinSuites = ['security-extended', 'security-and-quality'];
class Config {
    constructor() {
        this.name = "";
        this.disableDefaultQueries = false;
        this.additionalQueries = [];
        this.externalQueries = [];
        this.additionalSuites = [];
        this.pathsIgnore = [];
        this.paths = [];
    }
    addQuery(configFile, queryUses) {
        // The logic for parsing the string is based on what actions does for
        // parsing the 'uses' actions in the workflow file
        queryUses = queryUses.trim();
        if (queryUses === "") {
            throw new Error(getQueryUsesInvalid(configFile));
        }
        // Check for the local path case before we start trying to parse the repository name
        if (queryUses.startsWith("./")) {
            const localQueryPath = queryUses.slice(2);
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
            this.additionalQueries.push(absoluteQueryPath);
            return;
        }
        // Check for one of the builtin suites
        if (queryUses.indexOf('/') === -1 && queryUses.indexOf('@') === -1) {
            const suite = builtinSuites.find((suite) => suite === queryUses);
            if (suite) {
                this.additionalSuites.push(suite);
                return;
            }
            else {
                throw new Error(getQueryUsesInvalid(configFile, queryUses));
            }
        }
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
        if (tok.length > 3) {
            tok = [tok[0], tok[1], tok.slice(2).join('/')];
        }
        // Check none of the parts of the repository name are empty
        if (tok[0].trim() === '' || tok[1].trim() === '') {
            throw new Error(getQueryUsesInvalid(configFile, queryUses));
        }
        let external = new ExternalQuery(tok[0] + '/' + tok[1], ref);
        if (tok.length === 3) {
            external.path = tok[2];
        }
        this.externalQueries.push(external);
    }
}
exports.Config = Config;
function getNameInvalid(configFile) {
    return getConfigFilePropertyError(configFile, NAME_PROPERTY, 'must be a non-empty string');
}
exports.getNameInvalid = getNameInvalid;
function getDisableDefaultQueriesInvalid(configFile) {
    return getConfigFilePropertyError(configFile, DISPLAY_DEFAULT_QUERIES_PROPERTY, 'must be a boolean');
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
function getConfigFileFormatInvalidMessage(configFile) {
    return 'The configuration file "' + configFile + '" could not be read';
}
exports.getConfigFileFormatInvalidMessage = getConfigFileFormatInvalidMessage;
function getConfigFileDirectoryGivenMessage(configFile) {
    return 'The configuration file "' + configFile + '" looks like a directory, not a file';
}
exports.getConfigFileDirectoryGivenMessage = getConfigFileDirectoryGivenMessage;
function getConfigFilePropertyError(configFile, property, error) {
    return 'The configuration file "' + configFile + '" is invalid: property "' + property + '" ' + error;
}
async function initConfig() {
    let configFile = core.getInput('config-file');
    const config = new Config();
    // If no config file was provided create an empty one
    if (configFile === '') {
        core.debug('No configuration file was provided');
        return config;
    }
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
    if (NAME_PROPERTY in parsedYAML) {
        if (typeof parsedYAML[NAME_PROPERTY] !== "string") {
            throw new Error(getNameInvalid(configFile));
        }
        if (parsedYAML[NAME_PROPERTY].length === 0) {
            throw new Error(getNameInvalid(configFile));
        }
        config.name = parsedYAML[NAME_PROPERTY];
    }
    if (DISPLAY_DEFAULT_QUERIES_PROPERTY in parsedYAML) {
        if (typeof parsedYAML[DISPLAY_DEFAULT_QUERIES_PROPERTY] !== "boolean") {
            throw new Error(getDisableDefaultQueriesInvalid(configFile));
        }
        config.disableDefaultQueries = parsedYAML[DISPLAY_DEFAULT_QUERIES_PROPERTY];
    }
    if (QUERIES_PROPERTY in parsedYAML) {
        if (!(parsedYAML[QUERIES_PROPERTY] instanceof Array)) {
            throw new Error(getQueriesInvalid(configFile));
        }
        parsedYAML[QUERIES_PROPERTY].forEach(query => {
            if (!(QUERIES_USES_PROPERTY in query) || typeof query[QUERIES_USES_PROPERTY] !== "string") {
                throw new Error(getQueryUsesInvalid(configFile));
            }
            config.addQuery(configFile, query[QUERIES_USES_PROPERTY]);
        });
    }
    if (PATHS_IGNORE_PROPERTY in parsedYAML) {
        if (!(parsedYAML[PATHS_IGNORE_PROPERTY] instanceof Array)) {
            throw new Error(getPathsIgnoreInvalid(configFile));
        }
        parsedYAML[PATHS_IGNORE_PROPERTY].forEach(path => {
            if (typeof path !== "string" || path === '') {
                throw new Error(getPathsIgnoreInvalid(configFile));
            }
            config.pathsIgnore.push(path);
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
            config.paths.push(path);
        });
    }
    return config;
}
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
    const response = await api.client.repos.getContents({
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
    return yaml.safeLoad(Buffer.from(fileContents, 'base64').toString('binary'));
}
function getConfigFolder() {
    return util.getRequiredEnvParam('RUNNER_TEMP');
}
function getConfigFile() {
    return path.join(getConfigFolder(), 'config');
}
exports.getConfigFile = getConfigFile;
async function saveConfig(config) {
    const configString = JSON.stringify(config);
    await io.mkdirP(getConfigFolder());
    fs.writeFileSync(getConfigFile(), configString, 'utf8');
    core.debug('Saved config:');
    core.debug(configString);
}
async function loadConfig() {
    const configFile = getConfigFile();
    if (fs.existsSync(configFile)) {
        const configString = fs.readFileSync(configFile, 'utf8');
        core.debug('Loaded config:');
        core.debug(configString);
        return JSON.parse(configString);
    }
    else {
        const config = await initConfig();
        core.debug('Initialized config:');
        core.debug(JSON.stringify(config));
        await saveConfig(config);
        return config;
    }
}
exports.loadConfig = loadConfig;
//# sourceMappingURL=config-utils.js.map