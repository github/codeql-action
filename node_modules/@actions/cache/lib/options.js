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
exports.getDownloadOptions = exports.getUploadOptions = void 0;
const core = __importStar(require("@actions/core"));
/**
 * Returns a copy of the upload options with defaults filled in.
 *
 * @param copy the original upload options
 */
function getUploadOptions(copy) {
    const result = {
        uploadConcurrency: 4,
        uploadChunkSize: 32 * 1024 * 1024
    };
    if (copy) {
        if (typeof copy.uploadConcurrency === 'number') {
            result.uploadConcurrency = copy.uploadConcurrency;
        }
        if (typeof copy.uploadChunkSize === 'number') {
            result.uploadChunkSize = copy.uploadChunkSize;
        }
    }
    core.debug(`Upload concurrency: ${result.uploadConcurrency}`);
    core.debug(`Upload chunk size: ${result.uploadChunkSize}`);
    return result;
}
exports.getUploadOptions = getUploadOptions;
/**
 * Returns a copy of the download options with defaults filled in.
 *
 * @param copy the original download options
 */
function getDownloadOptions(copy) {
    const result = {
        useAzureSdk: false,
        concurrentBlobDownloads: true,
        downloadConcurrency: 8,
        timeoutInMs: 30000,
        segmentTimeoutInMs: 600000,
        lookupOnly: false
    };
    if (copy) {
        if (typeof copy.useAzureSdk === 'boolean') {
            result.useAzureSdk = copy.useAzureSdk;
        }
        if (typeof copy.concurrentBlobDownloads === 'boolean') {
            result.concurrentBlobDownloads = copy.concurrentBlobDownloads;
        }
        if (typeof copy.downloadConcurrency === 'number') {
            result.downloadConcurrency = copy.downloadConcurrency;
        }
        if (typeof copy.timeoutInMs === 'number') {
            result.timeoutInMs = copy.timeoutInMs;
        }
        if (typeof copy.segmentTimeoutInMs === 'number') {
            result.segmentTimeoutInMs = copy.segmentTimeoutInMs;
        }
        if (typeof copy.lookupOnly === 'boolean') {
            result.lookupOnly = copy.lookupOnly;
        }
    }
    const segmentDownloadTimeoutMins = process.env['SEGMENT_DOWNLOAD_TIMEOUT_MINS'];
    if (segmentDownloadTimeoutMins &&
        !isNaN(Number(segmentDownloadTimeoutMins)) &&
        isFinite(Number(segmentDownloadTimeoutMins))) {
        result.segmentTimeoutInMs = Number(segmentDownloadTimeoutMins) * 60 * 1000;
    }
    core.debug(`Use Azure SDK: ${result.useAzureSdk}`);
    core.debug(`Download concurrency: ${result.downloadConcurrency}`);
    core.debug(`Request timeout (ms): ${result.timeoutInMs}`);
    core.debug(`Cache segment download timeout mins env var: ${process.env['SEGMENT_DOWNLOAD_TIMEOUT_MINS']}`);
    core.debug(`Segment download timeout (ms): ${result.segmentTimeoutInMs}`);
    core.debug(`Lookup only: ${result.lookupOnly}`);
    return result;
}
exports.getDownloadOptions = getDownloadOptions;
//# sourceMappingURL=options.js.map