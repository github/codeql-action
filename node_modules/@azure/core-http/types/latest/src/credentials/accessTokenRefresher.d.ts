import { AccessToken, GetTokenOptions, TokenCredential } from "@azure/core-auth";
/**
 * Helps the core-http token authentication policies with requesting a new token if we're not currently waiting for a new token.
 *
 * @deprecated No longer used in the bearer authorization policy.
 */
export declare class AccessTokenRefresher {
    private credential;
    private scopes;
    private requiredMillisecondsBeforeNewRefresh;
    private promise;
    private lastCalled;
    constructor(credential: TokenCredential, scopes: string | string[], requiredMillisecondsBeforeNewRefresh?: number);
    /**
     * Returns true if the required milliseconds(defaulted to 30000) have been passed signifying
     * that we are ready for a new refresh.
     */
    isReady(): boolean;
    /**
     * Stores the time in which it is called,
     * then requests a new token,
     * then sets this.promise to undefined,
     * then returns the token.
     */
    private getToken;
    /**
     * Requests a new token if we're not currently waiting for a new token.
     * Returns null if the required time between each call hasn't been reached.
     */
    refresh(options: GetTokenOptions): Promise<AccessToken | undefined>;
}
//# sourceMappingURL=accessTokenRefresher.d.ts.map