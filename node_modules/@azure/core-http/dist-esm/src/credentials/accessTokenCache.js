// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * Defines the default token refresh buffer duration.
 */
export const TokenRefreshBufferMs = 2 * 60 * 1000; // 2 Minutes
/**
 * Provides an {@link AccessTokenCache} implementation which clears
 * the cached {@link AccessToken}'s after the expiresOnTimestamp has
 * passed.
 *
 * @deprecated No longer used in the bearer authorization policy.
 */
export class ExpiringAccessTokenCache {
    /**
     * Constructs an instance of {@link ExpiringAccessTokenCache} with
     * an optional expiration buffer time.
     */
    constructor(tokenRefreshBufferMs = TokenRefreshBufferMs) {
        this.cachedToken = undefined;
        this.tokenRefreshBufferMs = tokenRefreshBufferMs;
    }
    /**
     * Saves an access token into the internal in-memory cache.
     * @param accessToken - Access token or undefined to clear the cache.
     */
    setCachedToken(accessToken) {
        this.cachedToken = accessToken;
    }
    /**
     * Returns the cached access token, or `undefined` if one is not cached or the cached one is expiring soon.
     */
    getCachedToken() {
        if (this.cachedToken &&
            Date.now() + this.tokenRefreshBufferMs >= this.cachedToken.expiresOnTimestamp) {
            this.cachedToken = undefined;
        }
        return this.cachedToken;
    }
}
//# sourceMappingURL=accessTokenCache.js.map