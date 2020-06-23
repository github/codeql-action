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
const toolcache = __importStar(require("@actions/tool-cache"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
class CodeQLSetup {
    constructor(codeqlDist) {
        this.dist = codeqlDist;
        this.tools = path.join(this.dist, 'tools');
        this.cmd = path.join(codeqlDist, 'codeql');
        // TODO check process.arch ?
        if (process.platform === 'win32') {
            this.platform = 'win64';
            if (this.cmd.endsWith('codeql')) {
                this.cmd += ".exe";
            }
        }
        else if (process.platform === 'linux') {
            this.platform = 'linux64';
        }
        else if (process.platform === 'darwin') {
            this.platform = 'osx64';
        }
        else {
            throw new Error("Unsupported plaform: " + process.platform);
        }
    }
}
exports.CodeQLSetup = CodeQLSetup;
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
        return new CodeQLSetup(path.join(codeqlFolder, 'codeql'));
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
//# sourceMappingURL=setup-tools.js.map