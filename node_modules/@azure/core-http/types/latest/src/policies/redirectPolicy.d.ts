import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
/**
 * Options for how redirect responses are handled.
 */
export interface RedirectOptions {
    /**
     * When true, redirect responses are followed.  Defaults to true.
     */
    handleRedirects: boolean;
    /**
     * The maximum number of times the redirect URL will be tried before
     * failing.  Defaults to 20.
     */
    maxRetries?: number;
}
export declare const DefaultRedirectOptions: RedirectOptions;
/**
 * Creates a redirect policy, which sends a repeats the request to a new destination if a response arrives with a "location" header, and a status code between 300 and 307.
 * @param maximumRetries - Maximum number of redirects to follow.
 * @returns An instance of the {@link RedirectPolicy}
 */
export declare function redirectPolicy(maximumRetries?: number): RequestPolicyFactory;
/**
 * Resends the request to a new destination if a response arrives with a "location" header, and a status code between 300 and 307.
 */
export declare class RedirectPolicy extends BaseRequestPolicy {
    readonly maxRetries: number;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, maxRetries?: number);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=redirectPolicy.d.ts.map