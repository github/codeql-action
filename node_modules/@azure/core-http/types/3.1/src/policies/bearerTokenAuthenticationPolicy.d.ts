import { TokenCredential } from "@azure/core-auth";
import { RequestPolicyFactory } from "../policies/requestPolicy";
interface TokenCyclerOptions {
    /**
     * The window of time before token expiration during which the token will be
     * considered unusable due to risk of the token expiring before sending the
     * request.
     *
     * This will only become meaningful if the refresh fails for over
     * (refreshWindow - forcedRefreshWindow) milliseconds.
     */
    forcedRefreshWindowInMs: number;
    /**
     * Interval in milliseconds to retry failed token refreshes.
     */
    retryIntervalInMs: number;
    /**
     * The window of time before token expiration during which
     * we will attempt to refresh the token.
     */
    refreshWindowInMs: number;
}
export declare const DEFAULT_CYCLER_OPTIONS: TokenCyclerOptions;
/**
 * Creates a new factory for a RequestPolicy that applies a bearer token to
 * the requests' `Authorization` headers.
 *
 * @param credential - The TokenCredential implementation that can supply the bearer token.
 * @param scopes - The scopes for which the bearer token applies.
 */
export declare function bearerTokenAuthenticationPolicy(credential: TokenCredential, scopes: string | string[]): RequestPolicyFactory;
export {};
//# sourceMappingURL=bearerTokenAuthenticationPolicy.d.ts.map
