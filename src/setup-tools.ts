import * as core from '@actions/core';
import * as toolcache from '@actions/tool-cache';
import * as path from 'path';
import * as semver from 'semver';

export class CodeQLSetup {
    public dist: string;
    public tools: string;
    public cmd: string;
    public platform: string;

    constructor(codeqlDist: string) {
        this.dist = codeqlDist;
        this.tools = path.join(this.dist, 'tools');
        this.cmd = path.join(codeqlDist, 'codeql');
        // TODO check process.arch ?
        if (process.platform === 'win32') {
            this.platform = 'win64';
            if (this.cmd.endsWith('codeql')) {
                this.cmd += ".cmd";
            }
        } else if (process.platform === 'linux') {
            this.platform = 'linux64';
        } else if (process.platform === 'darwin') {
            this.platform = 'osx64';
        } else {
            throw new Error("Unsupported plaform: " + process.platform);
        }
    }
}

export async function setupCodeQL(): Promise<CodeQLSetup> {
    try {
        const codeqlURL = core.getInput('tools', { required: true });
        const codeqlURLVersion = getCodeQLURLVersion(codeqlURL);

        let codeqlFolder = toolcache.find('CodeQL', codeqlURLVersion);
        if (codeqlFolder) {
            core.debug(`CodeQL found in cache ${codeqlFolder}`);
        } else {
            const codeqlPath = await toolcache.downloadTool(codeqlURL);
            const codeqlExtracted = await toolcache.extractTar(codeqlPath);
            codeqlFolder = await toolcache.cacheDir(codeqlExtracted, 'CodeQL', codeqlURLVersion);
        }
        return new CodeQLSetup(path.join(codeqlFolder, 'codeql'));

    } catch (e) {
        core.error(e);
        throw new Error("Unable to download and extract CodeQL CLI");
    }
}

export function getCodeQLURLVersion(url: string): string {

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
