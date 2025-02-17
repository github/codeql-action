import { CacheServiceClientJSON } from '../../generated/results/api/v1/cache.twirp-client';
export declare function internalCacheTwirpClient(options?: {
    maxAttempts?: number;
    retryIntervalMs?: number;
    retryMultiplier?: number;
}): CacheServiceClientJSON;
