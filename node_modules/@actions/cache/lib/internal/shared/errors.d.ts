export declare class FilesNotFoundError extends Error {
    files: string[];
    constructor(files?: string[]);
}
export declare class InvalidResponseError extends Error {
    constructor(message: string);
}
export declare class CacheNotFoundError extends Error {
    constructor(message?: string);
}
export declare class GHESNotSupportedError extends Error {
    constructor(message?: string);
}
export declare class NetworkError extends Error {
    code: string;
    constructor(code: string);
    static isNetworkErrorCode: (code?: string) => boolean;
}
export declare class UsageError extends Error {
    constructor();
    static isUsageErrorMessage: (msg?: string) => boolean;
}
