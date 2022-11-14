// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
export const DEFAULT_CLIENT_RETRY_COUNT = 3;
// intervals are in ms
export const DEFAULT_CLIENT_RETRY_INTERVAL = 1000 * 30;
export const DEFAULT_CLIENT_MAX_RETRY_INTERVAL = 1000 * 90;
export const DEFAULT_CLIENT_MIN_RETRY_INTERVAL = 1000 * 3;
export function isNumber(n) {
    return typeof n === "number";
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
export function shouldRetry(retryLimit, predicate, retryData, response, error) {
    if (!predicate(response, error)) {
        return false;
    }
    return retryData.retryCount < retryLimit;
}
/**
 * @internal
 * Updates the retry data for the next attempt.
 *
 * @param retryOptions - specifies retry interval, and its lower bound and upper bound.
 * @param retryData -  The retry data.
 * @param err - The operation"s error, if any.
 */
export function updateRetryData(retryOptions, retryData = { retryCount: 0, retryInterval: 0 }, err) {
    if (err) {
        if (retryData.error) {
            err.innerError = retryData.error;
        }
        retryData.error = err;
    }
    // Adjust retry count
    retryData.retryCount++;
    // Adjust retry interval
    let incrementDelta = Math.pow(2, retryData.retryCount - 1) - 1;
    const boundedRandDelta = retryOptions.retryInterval * 0.8 +
        Math.floor(Math.random() * (retryOptions.retryInterval * 0.4));
    incrementDelta *= boundedRandDelta;
    retryData.retryInterval = Math.min(retryOptions.minRetryInterval + incrementDelta, retryOptions.maxRetryInterval);
    return retryData;
}
//# sourceMappingURL=exponentialBackoffStrategy.js.map