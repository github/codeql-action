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
const exec = __importStar(require("@actions/exec"));
const toolcache = __importStar(require("@actions/tool-cache"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
const util = __importStar(require("./util"));
/**
 * Environment variable used to store the location of the CodeQL CLI executable.
 * Value is set by setupCodeQL and read by getCodeQL.
 */
const CODEQL_ACTION_CMD = "CODEQL_ACTION_CMD";
async function setupCodeQL() {
    try {
        const codeqlURL = core.getInput('tools', { required: true });
        const codeqlURLVersion = getCodeQLURLVersion(codeqlURL);
        let codeqlFolder = toolcache.find('CodeQL', codeqlURLVersion);
        if (codeqlFolder) {
            core.debug(`CodeQL found in cache ${codeqlFolder}`);
        }
        else {
            const codeqlPath = await toolcache.downloadTool(codeqlURL);
            const codeqlExtracted = await toolcache.extractTar(codeqlPath);
            codeqlFolder = await toolcache.cacheDir(codeqlExtracted, 'CodeQL', codeqlURLVersion);
        }
        let codeqlCmd = path.join(codeqlFolder, 'codeql', 'codeql');
        if (process.platform === 'win32') {
            codeqlCmd += ".exe";
        }
        else if (process.platform !== 'linux' && process.platform !== 'darwin') {
            throw new Error("Unsupported plaform: " + process.platform);
        }
        core.exportVariable(CODEQL_ACTION_CMD, codeqlCmd);
        return getCodeQLForCmd(codeqlCmd);
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
    const codeqlCmd = util.getRequiredEnvParam(CODEQL_ACTION_CMD);
    return getCodeQLForCmd(codeqlCmd);
}
exports.getCodeQL = getCodeQL;
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
                '--language=' + language
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
                databasePath,
                '--',
                traceCommand
            ]);
        },
        finalizeDatabase: async function (databasePath) {
            await exec.exec(cmd, [
                'database',
                'finalize',
                databasePath
            ]);
        },
        resolveQueries: async function (queries) {
            let output = '';
            await exec.exec(cmd, [
                'resolve',
                'queries',
                ...queries,
                '--format=bylanguage'
            ], {
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
                querySuite
            ]);
        }
    };
}
//# sourceMappingURL=codeql.js.map