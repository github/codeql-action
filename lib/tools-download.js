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
exports.STREAMING_HIGH_WATERMARK_BYTES = void 0;
exports.downloadAndExtract = downloadAndExtract;
exports.getToolcacheDirectory = getToolcacheDirectory;
exports.writeToolcacheMarkerFile = writeToolcacheMarkerFile;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const perf_hooks_1 = require("perf_hooks");
const toolcache = __importStar(require("@actions/tool-cache"));
const follow_redirects_1 = require("follow-redirects");
const semver = __importStar(require("semver"));
const feature_flags_1 = require("./feature-flags");
const logging_1 = require("./logging");
const tar = __importStar(require("./tar"));
const util_1 = require("./util");
/**
 * High watermark to use when streaming the download and extraction of the CodeQL tools.
 */
exports.STREAMING_HIGH_WATERMARK_BYTES = 4 * 1024 * 1024; // 4 MiB
/**
 * The name of the tool cache directory for the CodeQL tools.
 */
const TOOLCACHE_TOOL_NAME = "CodeQL";
function makeDownloadFirstToolsDownloadDurations(downloadDurationMs, extractionDurationMs) {
    return {
        combinedDurationMs: downloadDurationMs + extractionDurationMs,
        downloadDurationMs,
        extractionDurationMs,
        streamExtraction: false,
    };
}
function makeStreamedToolsDownloadDurations(combinedDurationMs) {
    return {
        combinedDurationMs,
        downloadDurationMs: undefined,
        extractionDurationMs: undefined,
        streamExtraction: true,
    };
}
async function downloadAndExtract(codeqlURL, dest, authorization, headers, tarVersion, features, logger) {
    logger.info(`Downloading CodeQL tools from ${codeqlURL} . This may take a while.`);
    const compressionMethod = tar.inferCompressionMethod(codeqlURL);
    // TODO: Re-enable streaming when we have a more reliable way to respect proxy settings.
    if ((await features.getValue(feature_flags_1.Feature.ZstdBundleStreamingExtraction)) &&
        compressionMethod === "zstd" &&
        process.platform === "linux") {
        logger.info(`Streaming the extraction of the CodeQL bundle.`);
        const toolsInstallStart = perf_hooks_1.performance.now();
        await downloadAndExtractZstdWithStreaming(codeqlURL, dest, authorization, headers, tarVersion, logger);
        const combinedDurationMs = Math.round(perf_hooks_1.performance.now() - toolsInstallStart);
        logger.info(`Finished downloading and extracting CodeQL bundle to ${dest} (${(0, logging_1.formatDuration)(combinedDurationMs)}).`);
        return {
            compressionMethod,
            toolsUrl: sanitizeUrlForStatusReport(codeqlURL),
            ...makeStreamedToolsDownloadDurations(combinedDurationMs),
        };
    }
    const toolsDownloadStart = perf_hooks_1.performance.now();
    const archivedBundlePath = await toolcache.downloadTool(codeqlURL, undefined, authorization, headers);
    const downloadDurationMs = Math.round(perf_hooks_1.performance.now() - toolsDownloadStart);
    logger.info(`Finished downloading CodeQL bundle to ${archivedBundlePath} (${(0, logging_1.formatDuration)(downloadDurationMs)}).`);
    let extractionDurationMs;
    try {
        logger.info("Extracting CodeQL bundle.");
        const extractionStart = perf_hooks_1.performance.now();
        await tar.extract(archivedBundlePath, dest, compressionMethod, tarVersion, logger);
        extractionDurationMs = Math.round(perf_hooks_1.performance.now() - extractionStart);
        logger.info(`Finished extracting CodeQL bundle to ${dest} (${(0, logging_1.formatDuration)(extractionDurationMs)}).`);
    }
    finally {
        await (0, util_1.cleanUpGlob)(archivedBundlePath, "CodeQL bundle archive", logger);
    }
    return {
        compressionMethod,
        toolsUrl: sanitizeUrlForStatusReport(codeqlURL),
        ...makeDownloadFirstToolsDownloadDurations(downloadDurationMs, extractionDurationMs),
    };
}
async function downloadAndExtractZstdWithStreaming(codeqlURL, dest, authorization, headers, tarVersion, logger) {
    // Ensure destination exists
    fs.mkdirSync(dest, { recursive: true });
    // Add User-Agent header and Authorization header if provided.
    headers = Object.assign({ "User-Agent": "CodeQL Action" }, authorization ? { authorization } : {}, headers);
    const response = await new Promise((resolve) => follow_redirects_1.https.get(codeqlURL, {
        headers,
        // Increase the high water mark to improve performance.
        highWaterMark: exports.STREAMING_HIGH_WATERMARK_BYTES,
    }, (r) => resolve(r)));
    if (response.statusCode !== 200) {
        throw new Error(`Failed to download CodeQL bundle from ${codeqlURL}. HTTP status code: ${response.statusCode}.`);
    }
    await tar.extractTarZst(response, dest, tarVersion, logger);
}
/** Gets the path to the toolcache directory for the specified version of the CodeQL tools. */
function getToolcacheDirectory(version) {
    return path.join((0, util_1.getRequiredEnvParam)("RUNNER_TOOL_CACHE"), TOOLCACHE_TOOL_NAME, semver.clean(version) || version, os.arch() || "");
}
function writeToolcacheMarkerFile(extractedPath, logger) {
    const markerFilePath = `${extractedPath}.complete`;
    fs.writeFileSync(markerFilePath, "");
    logger.info(`Created toolcache marker file ${markerFilePath}`);
}
function sanitizeUrlForStatusReport(url) {
    return ["github/codeql-action", "dsp-testing/codeql-cli-nightlies"].some((repo) => url.startsWith(`https://github.com/${repo}/releases/download/`))
        ? url
        : "sanitized-value";
}
//# sourceMappingURL=tools-download.js.map