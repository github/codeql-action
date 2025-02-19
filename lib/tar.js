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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isZstdAvailable = isZstdAvailable;
exports.extract = extract;
exports.extractTarZst = extractTarZst;
exports.inferCompressionMethod = inferCompressionMethod;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const stream = __importStar(require("stream"));
const toolrunner_1 = require("@actions/exec/lib/toolrunner");
const io = __importStar(require("@actions/io"));
const toolcache = __importStar(require("@actions/tool-cache"));
const semver = __importStar(require("semver"));
const actions_util_1 = require("./actions-util");
const util_1 = require("./util");
const MIN_REQUIRED_BSD_TAR_VERSION = "3.4.3";
const MIN_REQUIRED_GNU_TAR_VERSION = "1.31";
async function getTarVersion() {
    const tar = await io.which("tar", true);
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
    const foundZstdBinary = await (0, util_1.isBinaryAccessible)("zstd", logger);
    try {
        const tarVersion = await getTarVersion();
        const { type, version } = tarVersion;
        logger.info(`Found ${type} tar version ${version}.`);
        switch (type) {
            case "gnu":
                return {
                    available: foundZstdBinary &&
                        // GNU tar only uses major and minor version numbers
                        semver.gte(semver.coerce(version), semver.coerce(MIN_REQUIRED_GNU_TAR_VERSION)),
                    foundZstdBinary,
                    version: tarVersion,
                };
            case "bsd":
                return {
                    available: foundZstdBinary &&
                        // Do a loose comparison since these version numbers don't contain
                        // a patch version number.
                        semver.gte(version, MIN_REQUIRED_BSD_TAR_VERSION),
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
async function extract(tarPath, dest, compressionMethod, tarVersion, logger) {
    // Ensure destination exists
    fs.mkdirSync(dest, { recursive: true });
    switch (compressionMethod) {
        case "gzip":
            // Defensively continue to call the toolcache API as requesting a gzipped
            // bundle may be a fallback option.
            return await toolcache.extractTar(tarPath, dest);
        case "zstd": {
            if (!tarVersion) {
                throw new Error("Could not determine tar version, which is required to extract a Zstandard archive.");
            }
            await extractTarZst(tarPath, dest, tarVersion, logger);
            return dest;
        }
    }
}
/**
 * Extract a compressed tar archive
 *
 * @param tar   tar stream, or path to the tar
 * @param dest     destination directory
 */
async function extractTarZst(tar, dest, tarVersion, logger) {
    logger.debug(`Extracting to ${dest}.${tar instanceof stream.Readable
        ? ` Input stream has high water mark ${tar.readableHighWaterMark}.`
        : ""}`);
    try {
        // Initialize args
        //
        // `--ignore-zeros` means that trailing zero bytes at the end of an archive will be read
        // by `tar` in case a further concatenated archive follows. Otherwise when a tarball built
        // by GNU tar, which writes many trailing zeroes, is read by BSD tar, which expects less, then
        // BSD tar can hang up the pipe to its filter program early, and if that program is `zstd`
        // then it will try to write the remaining zeroes, get an EPIPE error because `tar` has closed
        // its end of the pipe, return 1, and `tar` will pass the error along.
        //
        // See also https://github.com/facebook/zstd/issues/4294
        const args = ["-x", "--zstd", "--ignore-zeros"];
        if (tarVersion.type === "gnu") {
            // Suppress warnings when using GNU tar to extract archives created by BSD tar
            args.push("--warning=no-unknown-keyword");
            args.push("--overwrite");
        }
        args.push("-f", tar instanceof stream.Readable ? "-" : tar, "-C", dest);
        process.stdout.write(`[command]tar ${args.join(" ")}\n`);
        await new Promise((resolve, reject) => {
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
            tarProcess.on("error", (err) => {
                reject(new Error(`Error while extracting tar: ${err}`));
            });
            if (tar instanceof stream.Readable) {
                tar.pipe(tarProcess.stdin).on("error", (err) => {
                    reject(new Error(`Error while downloading and extracting tar: ${err}`));
                });
            }
            tarProcess.on("exit", (code) => {
                if (code !== 0) {
                    reject(new actions_util_1.CommandInvocationError("tar", args, code ?? undefined, stdout, stderr));
                }
                resolve();
            });
        });
    }
    catch (e) {
        await (0, util_1.cleanUpGlob)(dest, "extraction destination directory", logger);
        throw e;
    }
}
const KNOWN_EXTENSIONS = {
    "tar.gz": "gzip",
    "tar.zst": "zstd",
};
function inferCompressionMethod(tarPath) {
    for (const [ext, method] of Object.entries(KNOWN_EXTENSIONS)) {
        if (tarPath.endsWith(`.${ext}`)) {
            return method;
        }
    }
    return undefined;
}
//# sourceMappingURL=tar.js.map