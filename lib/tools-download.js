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
exports.downloadAndExtract = downloadAndExtract;
const path = __importStar(require("path"));
const perf_hooks_1 = require("perf_hooks");
const toolcache = __importStar(require("@actions/tool-cache"));
const follow_redirects_1 = require("follow-redirects");
const uuid_1 = require("uuid");
const feature_flags_1 = require("./feature-flags");
const logging_1 = require("./logging");
const tar = __importStar(require("./tar"));
const util_1 = require("./util");
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
async function downloadAndExtract(codeqlURL, authorization, headers, tarVersion, tempDir, features, logger) {
    logger.info(`Downloading CodeQL tools from ${codeqlURL} . This may take a while.`);
    const compressionMethod = tar.inferCompressionMethod(codeqlURL);
    if (compressionMethod === "zstd" &&
        (await features.getValue(feature_flags_1.Feature.ZstdBundleStreamingExtraction))) {
        logger.info(`Streaming the extraction of the CodeQL bundle.`);
        const toolsInstallStart = perf_hooks_1.performance.now();
        const extractedBundlePath = await downloadAndExtractZstdWithStreaming(codeqlURL, authorization, headers, tarVersion, logger);
        const combinedDurationMs = Math.round(perf_hooks_1.performance.now() - toolsInstallStart);
        logger.info(`Finished downloading and extracting CodeQL bundle to ${extractedBundlePath} (${(0, logging_1.formatDuration)(combinedDurationMs)}).`);
        return {
            extractedBundlePath,
            statusReport: {
                compressionMethod,
                toolsUrl: sanitizeUrlForStatusReport(codeqlURL),
                ...makeStreamedToolsDownloadDurations(combinedDurationMs),
            },
        };
    }
    const dest = path.join(tempDir, (0, uuid_1.v4)());
    const toolsDownloadStart = perf_hooks_1.performance.now();
    const archivedBundlePath = await toolcache.downloadTool(codeqlURL, dest, authorization, headers);
    const downloadDurationMs = Math.round(perf_hooks_1.performance.now() - toolsDownloadStart);
    logger.info(`Finished downloading CodeQL bundle to ${archivedBundlePath} (${(0, logging_1.formatDuration)(downloadDurationMs)}).`);
    let extractedBundlePath;
    let extractionDurationMs;
    try {
        logger.info("Extracting CodeQL bundle.");
        const extractionStart = perf_hooks_1.performance.now();
        extractedBundlePath = await tar.extract(archivedBundlePath, compressionMethod, tarVersion, logger);
        extractionDurationMs = Math.round(perf_hooks_1.performance.now() - extractionStart);
        logger.info(`Finished extracting CodeQL bundle to ${extractedBundlePath} (${(0, logging_1.formatDuration)(extractionDurationMs)}).`);
    }
    finally {
        await (0, util_1.cleanUpGlob)(archivedBundlePath, "CodeQL bundle archive", logger);
    }
    return {
        extractedBundlePath,
        statusReport: {
            compressionMethod,
            toolsUrl: sanitizeUrlForStatusReport(codeqlURL),
            ...makeDownloadFirstToolsDownloadDurations(downloadDurationMs, extractionDurationMs),
        },
    };
}
async function downloadAndExtractZstdWithStreaming(codeqlURL, authorization, headers, tarVersion, logger) {
    headers = Object.assign({ "User-Agent": "CodeQL Action", authorization }, headers);
    const response = await new Promise((resolve) => follow_redirects_1.https.get(codeqlURL, { headers }, (r) => resolve(r)));
    if (response.statusCode !== 200) {
        throw new Error(`Failed to download CodeQL bundle from ${codeqlURL}. HTTP status code: ${response.statusCode}.`);
    }
    return await tar.extractTarZst(response, tarVersion, logger);
}
function sanitizeUrlForStatusReport(url) {
    return ["github/codeql-action", "dsp-testing/codeql-cli-nightlies"].some((repo) => url.startsWith(`https://github.com/${repo}/releases/download/`))
        ? url
        : "sanitized-value";
}
//# sourceMappingURL=tools-download.js.map