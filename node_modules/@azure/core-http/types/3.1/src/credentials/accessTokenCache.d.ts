import { AccessToken } from "@azure/core-auth";
/**
 * Defines the default token refresh buffer duration.
 */
export declare const TokenRefreshBufferMs: number;
/**
 * Provides a cache for an AccessToken that was that
 * was returned from a TokenCredential.
 */
export interface AccessTokenCache {
    /**
     * Sets the cached token.
     *
     * @param accessToken - The {@link AccessToken} to be cached or null to
     *        clear the cached token.
     */
    setCachedToken(accessToken: AccessToken | undefined): void;
    /**
     * Returns the cached {@link AccessToken} or undefined if nothing is cached.
     */
    getCachedToken(): AccessToken | undefined;
}
/**
 * Provides an {@link AccessTokenCache} implementation which clears
 * the cached {@link AccessToken}'s after the expiresOnTimestamp has
 * passed.
 *
 * @deprecated No longer used in the bearer authorization policy.
 */
export declare class ExpiringAccessTokenCache implements AccessTokenCache {
    private tokenRefreshBufferMs;
    private cachedToken?;
    /**
     * Constructs an instance of {@link ExpiringAccessTokenCache} with
     * an optional expiration buffer time.
     */
    constructor(tokenRefreshBufferMs?: number);
    /**
     * Saves an access token into the internal in-memory cache.
     * @param accessToken - Access token or undefined to clear the cache.
     */
    setCachedToken(accessToken: AccessToken | undefined): void;
    /**
     * Returns the cached access token, or `undefined` if one is not cached or the cached one is expiring soon.
     */
    getCachedToken(): AccessToken | undefined;
}
//# sourceMappingURL=accessTokenCache.d.ts.map
