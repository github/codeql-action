"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const http = __importStar(require("@actions/http-client"));
const toolcache = __importStar(require("@actions/tool-cache"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
const stream = __importStar(require("stream"));
const globalutil = __importStar(require("util"));
const v4_1 = __importDefault(require("uuid/v4"));
const api = __importStar(require("./api-client"));
const defaults = __importStar(require("./defaults.json")); // Referenced from codeql-action-sync-tool!
const util = __importStar(require("./util"));
/**
 * Stores the CodeQL object, and is populated by `setupCodeQL` or `getCodeQL`.
 * Can be overridden in tests using `setCodeQL`.
 */
let cachedCodeQL = undefined;
/**
 * Environment variable used to store the location of the CodeQL CLI executable.
 * Value is set by setupCodeQL and read by getCodeQL.
 */
const CODEQL_ACTION_CMD = "CODEQL_ACTION_CMD";
const CODEQL_BUNDLE_VERSION = defaults.bundleVersion;
const CODEQL_BUNDLE_NAME = "codeql-bundle.tar.gz";
const CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";
function getCodeQLActionRepository() {
    // Actions do not know their own repository name,
    // so we currently use this hack to find the name based on where our files are.
    // This can be removed once the change to the runner in https://github.com/actions/runner/pull/585 is deployed.
    const runnerTemp = util.getRequiredEnvParam("RUNNER_TEMP");
    const actionsDirectory = path.join(path.dirname(runnerTemp), "_actions");
    const relativeScriptPath = path.relative(actionsDirectory, __filename);
    // This handles the case where the Action does not come from an Action repository,
    // e.g. our integration tests which use the Action code from the current checkout.
    if (relativeScriptPath.startsWith("..") || path.isAbsolute(relativeScriptPath)) {
        return CODEQL_DEFAULT_ACTION_REPOSITORY;
    }
    const relativeScriptPathParts = relativeScriptPath.split(path.sep);
    return relativeScriptPathParts[0] + "/" + relativeScriptPathParts[1];
}
async function getCodeQLBundleDownloadURL() {
    const codeQLActionRepository = getCodeQLActionRepository();
    const potentialDownloadSources = [
        // This GitHub instance, and this Action.
        [util.getInstanceAPIURL(), codeQLActionRepository],
        // This GitHub instance, and the canonical Action.
        [util.getInstanceAPIURL(), CODEQL_DEFAULT_ACTION_REPOSITORY],
        // GitHub.com, and the canonical Action.
        [util.GITHUB_DOTCOM_API_URL, CODEQL_DEFAULT_ACTION_REPOSITORY],
    ];
    // We now filter out any duplicates.
    // Duplicates will happen either because the GitHub instance is GitHub.com, or because the Action is not a fork.
    const uniqueDownloadSources = potentialDownloadSources.filter((url, index, self) => index === self.indexOf(url));
    for (let downloadSource of uniqueDownloadSources) {
        let [apiURL, repository] = downloadSource;
        // If we've reached the final case, short-circuit the API check since we know the bundle exists and is public.
        if (apiURL === util.GITHUB_DOTCOM_API_URL && repository === CODEQL_DEFAULT_ACTION_REPOSITORY) {
            break;
        }
        let [repositoryOwner, repositoryName] = repository.split("/");
        try {
            const release = await api.getActionsApiClient().repos.getReleaseByTag({
                owner: repositoryOwner,
                repo: repositoryName,
                tag: CODEQL_BUNDLE_VERSION
            });
            for (let asset of release.data.assets) {
                if (asset.name === CODEQL_BUNDLE_NAME) {
                    core.info(`Found CodeQL bundle in ${downloadSource[1]} on ${downloadSource[0]} with URL ${asset.url}.`);
                    return asset.url;
                }
            }
        }
        catch (e) {
            core.info(`Looked for CodeQL bundle in ${downloadSource[1]} on ${downloadSource[0]} but got error ${e}.`);
        }
    }
    return `https://github.com/${CODEQL_DEFAULT_ACTION_REPOSITORY}/releases/download/${CODEQL_BUNDLE_VERSION}/${CODEQL_BUNDLE_NAME}`;
}
// We have to download CodeQL manually because the toolcache doesn't support Accept headers.
// This can be removed once https://github.com/actions/toolkit/pull/530 is merged and released.
async function toolcacheDownloadTool(url, headers) {
    const client = new http.HttpClient('CodeQL Action');
    const dest = path.join(util.getRequiredEnvParam('RUNNER_TEMP'), v4_1.default());
    const response = await client.get(url, headers);
    if (response.message.statusCode !== 200) {
        const err = new toolcache.HTTPError(response.message.statusCode);
        core.info(`Failed to download from "${url}". Code(${response.message.statusCode}) Message(${response.message.statusMessage})`);
        throw err;
    }
    const pipeline = globalutil.promisify(stream.pipeline);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await pipeline(response.message, fs.createWriteStream(dest));
    return dest;
}
async function setupCodeQL() {
    try {
        let codeqlURL = core.getInput('tools');
        const codeqlURLVersion = getCodeQLURLVersion(codeqlURL || `/${CODEQL_BUNDLE_VERSION}/`);
        let codeqlFolder = toolcache.find('CodeQL', codeqlURLVersion);
        if (codeqlFolder) {
            core.debug(`CodeQL found in cache ${codeqlFolder}`);
        }
        else {
            if (!codeqlURL) {
                codeqlURL = await getCodeQLBundleDownloadURL();
            }
            const headers = { accept: 'application/octet-stream' };
            // We only want to provide an authorization header if we are downloading
            // from the same GitHub instance the Action is running on.
            // This avoids leaking Enterprise tokens to dotcom.
            if (codeqlURL.startsWith(util.getInstanceAPIURL() + "/")) {
                core.debug('Downloading CodeQL bundle with token.');
                let token = core.getInput('token', { required: true });
                headers.authorization = `token ${token}`;
            }
            else {
                core.debug('Downloading CodeQL bundle without token.');
            }
            let codeqlPath = await toolcacheDownloadTool(codeqlURL, headers);
            core.debug(`CodeQL bundle download to ${codeqlPath} complete.`);
            const codeqlExtracted = await toolcache.extractTar(codeqlPath);
            codeqlFolder = await toolcache.cacheDir(codeqlExtracted, 'CodeQL', codeqlURLVersion);
        }
        let codeqlCmd = path.join(codeqlFolder, 'codeql', 'codeql');
        if (process.platform === 'win32') {
            codeqlCmd += ".exe";
        }
        else if (process.platform !== 'linux' && process.platform !== 'darwin') {
            throw new Error("Unsupported platform: " + process.platform);
        }
        cachedCodeQL = getCodeQLForCmd(codeqlCmd);
        core.exportVariable(CODEQL_ACTION_CMD, codeqlCmd);
        return cachedCodeQL;
    }
    catch (e) {
        core.error(e);
        throw new Error("Unable to download and extract CodeQL CLI");
    }
}
exports.setupCodeQL = setupCodeQL;
function getCodeQLURLVersion(url) {
    const match = url.match(/\/codeql-bundle-(.*)\//);
    if (match === null || match.length < 2) {
        throw new Error(`Malformed tools url: ${url}. Version could not be inferred`);
    }
    let version = match[1];
    if (!semver.valid(version)) {
        core.debug(`Bundle version ${version} is not in SemVer format. Will treat it as pre-release 0.0.0-${version}.`);
        version = '0.0.0-' + version;
    }
    const s = semver.clean(version);
    if (!s) {
        throw new Error(`Malformed tools url ${url}. Version should be in SemVer format but have ${version} instead`);
    }
    return s;
}
exports.getCodeQLURLVersion = getCodeQLURLVersion;
function getCodeQL() {
    if (cachedCodeQL === undefined) {
        const codeqlCmd = util.getRequiredEnvParam(CODEQL_ACTION_CMD);
        cachedCodeQL = getCodeQLForCmd(codeqlCmd);
    }
    return cachedCodeQL;
}
exports.getCodeQL = getCodeQL;
function resolveFunction(partialCodeql, methodName) {
    if (typeof partialCodeql[methodName] !== 'function') {
        const dummyMethod = () => {
            throw new Error('CodeQL ' + methodName + ' method not correctly defined');
        };
        return dummyMethod;
    }
    return partialCodeql[methodName];
}
/**
 * Set the functionality for CodeQL methods. Only for use in tests.
 *
 * Accepts a partial object and any undefined methods will be implemented
 * to immediately throw an exception indicating which method is missing.
 */
function setCodeQL(partialCodeql) {
    cachedCodeQL = {
        getDir: resolveFunction(partialCodeql, 'getDir'),
        printVersion: resolveFunction(partialCodeql, 'printVersion'),
        getTracerEnv: resolveFunction(partialCodeql, 'getTracerEnv'),
        databaseInit: resolveFunction(partialCodeql, 'databaseInit'),
        runAutobuild: resolveFunction(partialCodeql, 'runAutobuild'),
        extractScannedLanguage: resolveFunction(partialCodeql, 'extractScannedLanguage'),
        finalizeDatabase: resolveFunction(partialCodeql, 'finalizeDatabase'),
        resolveQueries: resolveFunction(partialCodeql, 'resolveQueries'),
        databaseAnalyze: resolveFunction(partialCodeql, 'databaseAnalyze')
    };
}
exports.setCodeQL = setCodeQL;
function getCodeQLForCmd(cmd) {
    return {
        getDir: function () {
            return path.dirname(cmd);
        },
        printVersion: async function () {
            await exec.exec(cmd, [
                'version',
                '--format=json'
            ]);
        },
        getTracerEnv: async function (databasePath, compilerSpec) {
            let envFile = path.resolve(databasePath, 'working', 'env.tmp');
            const compilerSpecArg = compilerSpec ? ["--compiler-spec=" + compilerSpec] : [];
            await exec.exec(cmd, [
                'database',
                'trace-command',
                databasePath,
                ...compilerSpecArg,
                ...getExtraOptionsFromEnv(['database', 'trace-command']),
                process.execPath,
                path.resolve(__dirname, 'tracer-env.js'),
                envFile
            ]);
            return JSON.parse(fs.readFileSync(envFile, 'utf-8'));
        },
        databaseInit: async function (databasePath, language, sourceRoot) {
            await exec.exec(cmd, [
                'database',
                'init',
                databasePath,
                '--language=' + language,
                '--source-root=' + sourceRoot,
                ...getExtraOptionsFromEnv(['database', 'init']),
            ]);
        },
        runAutobuild: async function (language) {
            const cmdName = process.platform === 'win32' ? 'autobuild.cmd' : 'autobuild.sh';
            const autobuildCmd = path.join(path.dirname(cmd), language, 'tools', cmdName);
            // Update JAVA_TOOL_OPTIONS to contain '-Dhttp.keepAlive=false'
            // This is because of an issue with Azure pipelines timing out connections after 4 minutes
            // and Maven not properly handling closed connections
            // Otherwise long build processes will timeout when pulling down Java packages
            // https://developercommunity.visualstudio.com/content/problem/292284/maven-hosted-agent-connection-timeout.html
            let javaToolOptions = process.env['JAVA_TOOL_OPTIONS'] || "";
            process.env['JAVA_TOOL_OPTIONS'] = [...javaToolOptions.split(/\s+/), '-Dhttp.keepAlive=false', '-Dmaven.wagon.http.pool=false'].join(' ');
            await exec.exec(autobuildCmd);
        },
        extractScannedLanguage: async function (databasePath, language) {
            // Get extractor location
            let extractorPath = '';
            await exec.exec(cmd, [
                'resolve',
                'extractor',
                '--format=json',
                '--language=' + language,
                ...getExtraOptionsFromEnv(['resolve', 'extractor']),
            ], {
                silent: true,
                listeners: {
                    stdout: (data) => { extractorPath += data.toString(); },
                    stderr: (data) => { process.stderr.write(data); }
                }
            });
            // Set trace command
            const ext = process.platform === 'win32' ? '.cmd' : '.sh';
            const traceCommand = path.resolve(JSON.parse(extractorPath), 'tools', 'autobuild' + ext);
            // Run trace command
            await exec.exec(cmd, [
                'database',
                'trace-command',
                ...getExtraOptionsFromEnv(['database', 'trace-command']),
                databasePath,
                '--',
                traceCommand
            ]);
        },
        finalizeDatabase: async function (databasePath) {
            await exec.exec(cmd, [
                'database',
                'finalize',
                ...getExtraOptionsFromEnv(['database', 'finalize']),
                databasePath
            ]);
        },
        resolveQueries: async function (queries, extraSearchPath) {
            const codeqlArgs = [
                'resolve',
                'queries',
                ...queries,
                '--format=bylanguage',
                ...getExtraOptionsFromEnv(['resolve', 'queries'])
            ];
            if (extraSearchPath !== undefined) {
                codeqlArgs.push('--search-path', extraSearchPath);
            }
            let output = '';
            await exec.exec(cmd, codeqlArgs, {
                listeners: {
                    stdout: (data) => {
                        output += data.toString();
                    }
                }
            });
            return JSON.parse(output);
        },
        databaseAnalyze: async function (databasePath, sarifFile, querySuite) {
            await exec.exec(cmd, [
                'database',
                'analyze',
                util.getMemoryFlag(),
                util.getThreadsFlag(),
                databasePath,
                '--format=sarif-latest',
                '--output=' + sarifFile,
                '--no-sarif-add-snippets',
                ...getExtraOptionsFromEnv(['database', 'analyze']),
                querySuite
            ]);
        }
    };
}
function isTracedLanguage(language) {
    return ['cpp', 'java', 'csharp'].includes(language);
}
exports.isTracedLanguage = isTracedLanguage;
function isScannedLanguage(language) {
    return !isTracedLanguage(language);
}
exports.isScannedLanguage = isScannedLanguage;
/**
 * Gets the options for `path` of `options` as an array of extra option strings.
 */
function getExtraOptionsFromEnv(path) {
    let options = util.getExtraOptionsEnvParam();
    return getExtraOptions(options, path, []);
}
/**
 * Gets the options for `path` of `options` as an array of extra option strings.
 *
 * - the special terminal step name '*' in `options` matches all path steps
 * - throws an exception if this conversion is impossible.
 */
function getExtraOptions(options, path, pathInfo) {
    var _a, _b, _c;
    /**
     * Gets `options` as an array of extra option strings.
     *
     * - throws an exception mentioning `pathInfo` if this conversion is impossible.
     */
    function asExtraOptions(options, pathInfo) {
        if (options === undefined) {
            return [];
        }
        if (!Array.isArray(options)) {
            const msg = `The extra options for '${pathInfo.join('.')}' ('${JSON.stringify(options)}') are not in an array.`;
            throw new Error(msg);
        }
        return options.map(o => {
            const t = typeof o;
            if (t !== 'string' && t !== 'number' && t !== 'boolean') {
                const msg = `The extra option for '${pathInfo.join('.')}' ('${JSON.stringify(o)}') is not a primitive value.`;
                throw new Error(msg);
            }
            return o + '';
        });
    }
    let all = asExtraOptions((_a = options) === null || _a === void 0 ? void 0 : _a['*'], pathInfo.concat('*'));
    let specific = path.length === 0 ?
        asExtraOptions(options, pathInfo) :
        getExtraOptions((_b = options) === null || _b === void 0 ? void 0 : _b[path[0]], (_c = path) === null || _c === void 0 ? void 0 : _c.slice(1), pathInfo.concat(path[0]));
    return all.concat(specific);
}
exports.getExtraOptions = getExtraOptions;
//# sourceMappingURL=codeql.js.map