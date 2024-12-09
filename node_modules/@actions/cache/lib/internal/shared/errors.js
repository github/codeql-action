"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageError = exports.NetworkError = exports.GHESNotSupportedError = exports.CacheNotFoundError = exports.InvalidResponseError = exports.FilesNotFoundError = void 0;
class FilesNotFoundError extends Error {
    constructor(files = []) {
        let message = 'No files were found to upload';
        if (files.length > 0) {
            message += `: ${files.join(', ')}`;
        }
        super(message);
        this.files = files;
        this.name = 'FilesNotFoundError';
    }
}
exports.FilesNotFoundError = FilesNotFoundError;
class InvalidResponseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidResponseError';
    }
}
exports.InvalidResponseError = InvalidResponseError;
class CacheNotFoundError extends Error {
    constructor(message = 'Cache not found') {
        super(message);
        this.name = 'CacheNotFoundError';
    }
}
exports.CacheNotFoundError = CacheNotFoundError;
class GHESNotSupportedError extends Error {
    constructor(message = '@actions/cache v4.1.4+, actions/cache/save@v4+ and actions/cache/restore@v4+ are not currently supported on GHES.') {
        super(message);
        this.name = 'GHESNotSupportedError';
    }
}
exports.GHESNotSupportedError = GHESNotSupportedError;
class NetworkError extends Error {
    constructor(code) {
        const message = `Unable to make request: ${code}\nIf you are using self-hosted runners, please make sure your runner has access to all GitHub endpoints: https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners#communication-between-self-hosted-runners-and-github`;
        super(message);
        this.code = code;
        this.name = 'NetworkError';
    }
}
exports.NetworkError = NetworkError;
NetworkError.isNetworkErrorCode = (code) => {
    if (!code)
        return false;
    return [
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'EHOSTUNREACH'
    ].includes(code);
};
class UsageError extends Error {
    constructor() {
        const message = `Cache storage quota has been hit. Unable to upload any new cache entries. Usage is recalculated every 6-12 hours.\nMore info on storage limits: https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions#calculating-minute-and-storage-spending`;
        super(message);
        this.name = 'UsageError';
    }
}
exports.UsageError = UsageError;
UsageError.isUsageErrorMessage = (msg) => {
    if (!msg)
        return false;
    return msg.includes('insufficient usage');
};
//# sourceMappingURL=errors.js.map