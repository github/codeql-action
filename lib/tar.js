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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isZstdAvailable = isZstdAvailable;
exports.extract = extract;
exports.inferCompressionMethod = inferCompressionMethod;
const toolrunner_1 = require("@actions/exec/lib/toolrunner");
const toolcache = __importStar(require("@actions/tool-cache"));
const safe_which_1 = require("@chrisgavin/safe-which");
const util_1 = require("./util");
const MIN_REQUIRED_BSD_TAR_VERSION = "3.4.3";
const MIN_REQUIRED_GNU_TAR_VERSION = "1.31";
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
    try {
        const tarVersion = await getTarVersion();
        const { type, version } = tarVersion;
        logger.info(`Found ${type} tar version ${version}.`);
        switch (type) {
            case "gnu":
                return {
                    available: version >= MIN_REQUIRED_GNU_TAR_VERSION,
                    version: tarVersion,
                };
            case "bsd":
                return {
                    available: version >= MIN_REQUIRED_BSD_TAR_VERSION,
                    version: tarVersion,
                };
            default:
                (0, util_1.assertNever)(type);
        }
    }
    catch (e) {
        logger.error("Failed to determine tar version, therefore will assume zstd may not be available. " +
            `The underlying error was: ${e}`);
        return { available: false };
    }
}
async function extract(path, compressionMethod) {
    switch (compressionMethod) {
        case "gzip":
            // While we could also ask tar to autodetect the compression method,
            // we defensively keep the gzip call identical as requesting a gzipped
            // bundle will soon be a fallback option.
            return await toolcache.extractTar(path);
        case "zstd":
            // By specifying only the "x" flag, we ask tar to autodetect the
            // compression method.
            return await toolcache.extractTar(path, undefined, "x");
    }
}
function inferCompressionMethod(path) {
    if (path.endsWith(".tar.gz")) {
        return "gzip";
    }
    return "zstd";
}
//# sourceMappingURL=tar.js.map