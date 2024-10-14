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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isZstdAvailable = isZstdAvailable;
exports.extract = extract;
exports.extractTarZst = extractTarZst;
exports.inferCompressionMethod = inferCompressionMethod;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const toolrunner_1 = require("@actions/exec/lib/toolrunner");
const toolcache = __importStar(require("@actions/tool-cache"));
const safe_which_1 = require("@chrisgavin/safe-which");
const uuid_1 = require("uuid");
const actions_util_1 = require("./actions-util");
const util_1 = require("./util");
const MIN_REQUIRED_BSD_TAR_VERSION = "3.4.3";
const MIN_REQUIRED_GNU_TAR_VERSION = "1.31";
async function isBinaryAccessible(binary, logger) {
    try {
        await (0, safe_which_1.safeWhich)(binary);
        logger.debug(`Found ${binary}.`);
        return true;
    }
    catch (e) {
        logger.debug(`Could not find ${binary}: ${e}`);
        return false;
    }
}
async function getTarVersion() {
    const tar = await (0, safe_which_1.safeWhich)("tar");
    let stdout = "";
    const exitCode = await new toolrunner_1.ToolRunner(tar, ["--version"], {
        listeners: {
            stdout: (data) => {
                stdout += data.toString();
            },
        },
    }).exec();
    if (exitCode !== 0) {
        throw new Error("Failed to call tar --version");
    }
    // Return whether this is GNU tar or BSD tar, and the version number
    if (stdout.includes("GNU tar")) {
        const match = stdout.match(/tar \(GNU tar\) ([0-9.]+)/);
        if (!match || !match[1]) {
            throw new Error("Failed to parse output of tar --version.");
        }
        return { type: "gnu", version: match[1] };
    }
    else if (stdout.includes("bsdtar")) {
        const match = stdout.match(/bsdtar ([0-9.]+)/);
        if (!match || !match[1]) {
            throw new Error("Failed to parse output of tar --version.");
        }
        return { type: "bsd", version: match[1] };
    }
    else {
        throw new Error("Unknown tar version");
    }
}
async function isZstdAvailable(logger) {
    const foundZstdBinary = await isBinaryAccessible("zstd", logger);
    try {
        const tarVersion = await getTarVersion();
        const { type, version } = tarVersion;
        logger.info(`Found ${type} tar version ${version}.`);
        switch (type) {
            case "gnu":
                return {
                    available: foundZstdBinary && version >= MIN_REQUIRED_GNU_TAR_VERSION,
                    foundZstdBinary,
                    version: tarVersion,
                };
            case "bsd":
                return {
                    available: foundZstdBinary && version >= MIN_REQUIRED_BSD_TAR_VERSION,
                    foundZstdBinary,
                    version: tarVersion,
                };
            default:
                (0, util_1.assertNever)(type);
        }
    }
    catch (e) {
        logger.warning("Failed to determine tar version, therefore will assume zstd is not available. " +
            `The underlying error was: ${e}`);
        return { available: false, foundZstdBinary };
    }
}
async function extract(tarPath, compressionMethod, tarVersion, logger) {
    switch (compressionMethod) {
        case "gzip":
            // Defensively continue to call the toolcache API as requesting a gzipped
            // bundle may be a fallback option.
            return await toolcache.extractTar(tarPath);
        case "zstd":
            if (!tarVersion) {
                throw new Error("Could not determine tar version, which is required to extract a Zstandard archive.");
            }
            return await extractTarZst(fs.createReadStream(tarPath), tarVersion, logger);
    }
}
/**
 * Extract a compressed tar archive
 *
 * @param file     path to the tar
 * @param dest     destination directory. Optional.
 * @returns        path to the destination directory
 */
async function extractTarZst(tarStream, tarVersion, logger) {
    const dest = await createExtractFolder();
    try {
        // Initialize args
        const args = ["-x", "--zstd"];
        if (tarVersion.type === "gnu") {
            // Suppress warnings when using GNU tar to extract archives created by BSD tar
            args.push("--warning=no-unknown-keyword");
            args.push("--overwrite");
        }
        args.push("-f", "-", "-C", dest);
        process.stdout.write(`[command]tar ${args.join(" ")}\n`);
        const tarProcess = (0, child_process_1.spawn)("tar", args, { stdio: "pipe" });
        let stdout = "";
        tarProcess.stdout?.on("data", (data) => {
            stdout += data.toString();
            process.stdout.write(data);
        });
        let stderr = "";
        tarProcess.stderr?.on("data", (data) => {
            stderr += data.toString();
            // Mimic the standard behavior of the toolrunner by writing stderr to stdout
            process.stdout.write(data);
        });
        tarStream.pipe(tarProcess.stdin);
        await new Promise((resolve, reject) => {
            tarProcess.on("exit", (code) => {
                if (code !== 0) {
                    reject(new actions_util_1.CommandInvocationError("tar", args, code ?? undefined, stdout, stderr));
                }
                resolve();
            });
        });
        return dest;
    }
    catch (e) {
        await (0, util_1.cleanUpGlob)(dest, "extraction destination directory", logger);
        throw e;
    }
}
async function createExtractFolder() {
    const dest = path_1.default.join((0, actions_util_1.getTemporaryDirectory)(), (0, uuid_1.v4)());
    fs.mkdirSync(dest, { recursive: true });
    return dest;
}
function inferCompressionMethod(tarPath) {
    if (tarPath.endsWith(".tar.gz")) {
        return "gzip";
    }
    return "zstd";
}
//# sourceMappingURL=tar.js.map