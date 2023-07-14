import { HttpOperationResponse } from "..";
export declare const DEFAULT_CLIENT_RETRY_COUNT = 3;
export declare const DEFAULT_CLIENT_RETRY_INTERVAL: number;
export declare const DEFAULT_CLIENT_MAX_RETRY_INTERVAL: number;
export declare const DEFAULT_CLIENT_MIN_RETRY_INTERVAL: number;
export declare function isNumber(n: unknown): n is number;
export interface RetryData {
    retryCount: number;
    retryInterval: number;
    error?: RetryError;
}
export interface RetryError extends Error {
    message: string;
    code?: string;
    innerError?: RetryError;
}
/**
 * @internal
 * Determines if the operation should be retried.
 *
 * @param retryLimit - Specifies the max number of retries.
 * @param predicate - Initial chekck on whether to retry based on given responses or errors
 * @param retryData -  The retry data.
 * @returns True if the operation qualifies for a retry; false otherwise.
 */
export declare function shouldRetry(retryLimit: number, predicate: (response?: HttpOperationResponse, error?: RetryError) => boolean, retryData: RetryData, response?: HttpOperationResponse, error?: RetryError): boolean;
/**
 * @internal
 * Updates the retry data for the next attempt.
 *
 * @param retryOptions - specifies retry interval, and its lower bound and upper bound.
 * @param retryData -  The retry data.
 * @param err - The operation"s error, if any.
 */
export declare function updateRetryData(retryOptions: {
    retryInterval: number;
    minRetryInterval: number;
    maxRetryInterval: number;
}, retryData?: RetryData, err?: RetryError): RetryData;
//# sourceMappingURL=exponentialBackoffStrategy.d.ts.map