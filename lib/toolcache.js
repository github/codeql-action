"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadTool = exports.findAllVersions = exports.find = exports.cacheDir = exports.extractTar = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const io = __importStar(require("@actions/io"));
const actionsToolcache = __importStar(require("@actions/tool-cache"));
const safeWhich = __importStar(require("@chrisgavin/safe-which"));
const semver = __importStar(require("semver"));
const uuid_1 = require("uuid");
const util_1 = require("./util");
/*
 * This file acts as an interface to the functionality of the actions toolcache.
 * That library is not safe to use outside of actions as it makes assumptions about
 * the state of the filesystem and available environment variables.
 *
 * On actions we can just delegate to the toolcache library, however outside of
 * actions we provide our own implementation.
 */
/**
 * Extract a compressed tar archive.
 *
 * See extractTar function from node_modules/@actions/tool-cache/lib/tool-cache.d.ts
 *
 * @param file           path to the tar
 * @param mode           should run the actions or runner implementation
 * @param tempDir        path to the temporary directory
 * @param logger         logger to use
 * @returns              path to the destination directory
 */
async function extractTar(file, tempDir, logger) {
    if (util_1.isActions()) {
        return await actionsToolcache.extractTar(file);
    }
    else {
        // Initial implementation copied from node_modules/@actions/tool-cache/lib/tool-cache.js
        if (!file) {
            throw new Error("parameter 'file' is required");
        }
        // Create dest
        const dest = createExtractFolder(tempDir);
        // Determine whether GNU tar
        logger.debug("Checking tar --version");
        let versionOutput = "";
        await new toolrunner.ToolRunner(await safeWhich.safeWhich("tar"), ["--version"], {
            ignoreReturnCode: true,
            silent: true,
            listeners: {
                stdout: (data) => (versionOutput += data.toString()),
                stderr: (data) => (versionOutput += data.toString()),
            },
        }).exec();
        logger.debug(versionOutput.trim());
        const isGnuTar = versionOutput.toUpperCase().includes("GNU TAR");
        // Initialize args
        const args = ["xz"];
        if (logger.isDebug()) {
            args.push("-v");
        }
        let destArg = dest;
        let fileArg = file;
        if (process.platform === "win32" && isGnuTar) {
            args.push("--force-local");
            destArg = dest.replace(/\\/g, "/");
            // Technically only the dest needs to have `/` but for aesthetic consistency
            // convert slashes in the file arg too.
            fileArg = file.replace(/\\/g, "/");
        }
        if (isGnuTar) {
            // Suppress warnings when using GNU tar to extract archives created by BSD tar
            args.push("--warning=no-unknown-keyword");
        }
        args.push("-C", destArg, "-f", fileArg);
        await new toolrunner.ToolRunner(`tar`, args).exec();
        return dest;
    }
}
exports.extractTar = extractTar;
/**
 * Caches a directory and installs it into the tool cacheDir.
 *
 * Also see cacheDir function from node_modules/@actions/tool-cache/lib/tool-cache.d.ts
 *
 * @param sourceDir    the directory to cache into tools
 * @param tool         tool name
 * @param version      version of the tool.  semver format
 * @param mode           should run the actions or runner implementation
 * @param toolCacheDir   path to the tool cache directory
 * @param logger         logger to use
 */
async function cacheDir(sourceDir, tool, version, toolCacheDir, logger) {
    if (util_1.isActions()) {
        return await actionsToolcache.cacheDir(sourceDir, tool, version);
    }
    else {
        // Initial implementation copied from node_modules/@actions/tool-cache/lib/tool-cache.js
        version = semver.clean(version) || version;
        const arch = os.arch();
        logger.debug(`Caching tool ${tool} ${version} ${arch}`);
        logger.debug(`source dir: ${sourceDir}`);
        if (!fs.statSync(sourceDir).isDirectory()) {
            throw new Error("sourceDir is not a directory");
        }
        // Create the tool dir
        const destPath = createToolPath(tool, version, arch, toolCacheDir, logger);
        // copy each child item. do not move. move can fail on Windows
        // due to anti-virus software having an open handle on a file.
        for (const itemName of fs.readdirSync(sourceDir)) {
            const s = path.join(sourceDir, itemName);
            await io.cp(s, destPath, { recursive: true });
        }
        // write .complete
        completeToolPath(tool, version, arch, toolCacheDir, logger);
        return destPath;
    }
}
exports.cacheDir = cacheDir;
/**
 * Finds the path to a tool version in the local installed tool cache.
 *
 * Also see find function from node_modules/@actions/tool-cache/lib/tool-cache.d.ts
 *
 * @param toolName      name of the tool
 * @param versionSpec   version of the tool
 * @param mode           should run the actions or runner implementation
 * @param toolCacheDir   path to the tool cache directory
 * @param logger         logger to use
 */
function find(toolName, versionSpec, toolCacheDir, logger) {
    if (util_1.isActions()) {
        return actionsToolcache.find(toolName, versionSpec);
    }
    else {
        // Initial implementation copied from node_modules/@actions/tool-cache/lib/tool-cache.js
        if (!toolName) {
            throw new Error("toolName parameter is required");
        }
        if (!versionSpec) {
            throw new Error("versionSpec parameter is required");
        }
        const arch = os.arch();
        // attempt to resolve an explicit version
        if (!isExplicitVersion(versionSpec, logger)) {
            const localVersions = findAllVersions(toolName, toolCacheDir, logger);
            const match = evaluateVersions(localVersions, versionSpec, logger);
            versionSpec = match;
        }
        // check for the explicit version in the cache
        let toolPath = "";
        if (versionSpec) {
            versionSpec = semver.clean(versionSpec) || "";
            const cachePath = path.join(toolCacheDir, toolName, versionSpec, arch);
            logger.debug(`checking cache: ${cachePath}`);
            if (fs.existsSync(cachePath) && fs.existsSync(`${cachePath}.complete`)) {
                logger.debug(`Found tool in cache ${toolName} ${versionSpec} ${arch}`);
                toolPath = cachePath;
            }
            else {
                logger.debug("not found");
            }
        }
        return toolPath;
    }
}
exports.find = find;
/**
 * Finds the paths to all versions of a tool that are installed in the local tool cache.
 *
 * Also see findAllVersions function from node_modules/@actions/tool-cache/lib/tool-cache.d.ts
 *
 * @param toolName  name of the tool
 * @param toolCacheDir   path to the tool cache directory
 * @param logger         logger to use
 */
function findAllVersions(toolName, toolCacheDir, logger) {
    if (util_1.isActions()) {
        return actionsToolcache.findAllVersions(toolName);
    }
    else {
        // Initial implementation copied from node_modules/@actions/tool-cache/lib/tool-cache.js
        const versions = [];
        const arch = os.arch();
        const toolPath = path.join(toolCacheDir, toolName);
        if (fs.existsSync(toolPath)) {
            const children = fs.readdirSync(toolPath);
            for (const child of children) {
                if (isExplicitVersion(child, logger)) {
                    const fullPath = path.join(toolPath, child, arch || "");
                    if (fs.existsSync(fullPath) &&
                        fs.existsSync(`${fullPath}.complete`)) {
                        versions.push(child);
                    }
                }
            }
        }
        return versions;
    }
}
exports.findAllVersions = findAllVersions;
async function downloadTool(url, tempDir, headers) {
    const dest = path.join(tempDir, uuid_1.v4());
    const finalHeaders = Object.assign({ "User-Agent": "CodeQL Action" }, headers);
    return await actionsToolcache.downloadTool(url, dest, undefined, finalHeaders);
}
exports.downloadTool = downloadTool;
function createExtractFolder(tempDir) {
    // create a temp dir
    const dest = path.join(tempDir, "toolcache-temp");
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest);
    }
    return dest;
}
function createToolPath(tool, version, arch, toolCacheDir, logger) {
    const folderPath = path.join(toolCacheDir, tool, semver.clean(version) || version, arch || "");
    logger.debug(`destination ${folderPath}`);
    const markerPath = `${folderPath}.complete`;
    fs.rmdirSync(folderPath, { recursive: true });
    fs.rmdirSync(markerPath, { recursive: true });
    fs.mkdirSync(folderPath, { recursive: true });
    return folderPath;
}
function completeToolPath(tool, version, arch, toolCacheDir, logger) {
    const folderPath = path.join(toolCacheDir, tool, semver.clean(version) || version, arch || "");
    const markerPath = `${folderPath}.complete`;
    fs.writeFileSync(markerPath, "");
    logger.debug("finished caching tool");
}
function isExplicitVersion(versionSpec, logger) {
    const c = semver.clean(versionSpec) || "";
    logger.debug(`isExplicit: ${c}`);
    const valid = semver.valid(c) != null;
    logger.debug(`explicit? ${valid}`);
    return valid;
}
function evaluateVersions(versions, versionSpec, logger) {
    let version = "";
    logger.debug(`evaluating ${versions.length} versions`);
    versions = versions.sort((a, b) => {
        if (semver.gt(a, b)) {
            return 1;
        }
        return -1;
    });
    for (let i = versions.length - 1; i >= 0; i--) {
        const potential = versions[i];
        const satisfied = semver.satisfies(potential, versionSpec);
        if (satisfied) {
            version = potential;
            break;
        }
    }
    if (version) {
        logger.debug(`matched: ${version}`);
    }
    else {
        logger.debug("match not found");
    }
    return version;
}
//# sourceMappingURL=toolcache.js.map