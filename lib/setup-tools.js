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
const crypto = __importStar(require("crypto"));
class CodeQLSetup {
    constructor(codeqlDist) {
        this.dist = codeqlDist;
        this.tools = path.join(this.dist, 'tools');
        this.cmd = path.join(codeqlDist, 'codeql');
        // TODO check process.arch ?
        if (process.platform === 'win32') {
            this.platform = 'win64';
            if (this.cmd.endsWith('codeql')) {
                this.cmd += ".cmd";
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
    const hash = crypto.createHash('sha256');
    const codeqlURL = core.getInput('tools', { required: true });
    const codeqlURLHash = hash.update(codeqlURL).digest('hex');
    try {
        let codeqlFolder = toolcache.find('CodeQL', codeqlURLHash);
        if (codeqlFolder) {
            core.debug(`CodeQL found in cache ${codeqlFolder}`);
        }
        else {
            const codeqlPath = await toolcache.downloadTool(codeqlURL);
            const codeqlExtracted = await toolcache.extractTar(codeqlPath);
            codeqlFolder = await toolcache.cacheDir(codeqlExtracted, 'CodeQL', codeqlURLHash);
        }
        return new CodeQLSetup(path.join(codeqlFolder, 'codeql'));
    }
    catch (e) {
        core.error(e);
        throw new Error("Unable to download and extract CodeQL CLI");
    }
}
exports.setupCodeQL = setupCodeQL;
//# sourceMappingURL=setup-tools.js.map