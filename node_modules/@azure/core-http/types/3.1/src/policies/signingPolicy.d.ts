import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { HttpOperationResponse } from "../httpOperationResponse";
import { ServiceClientCredentials } from "../credentials/serviceClientCredentials";
import { WebResourceLike } from "../webResource";
/**
 * Creates a policy that signs outgoing requests by calling to the provided `authenticationProvider`'s `signRequest` method.
 * @param authenticationProvider - The authentication provider.
 * @returns An instance of the {@link SigningPolicy}.
 */
export declare function signingPolicy(authenticationProvider: ServiceClientCredentials): RequestPolicyFactory;
/**
 * A policy that signs outgoing requests by calling to the provided `authenticationProvider`'s `signRequest` method.
 */
export declare class SigningPolicy extends BaseRequestPolicy {
    authenticationProvider: ServiceClientCredentials;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, authenticationProvider: ServiceClientCredentials);
    signRequest(request: WebResourceLike): Promise<WebResourceLike>;
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=signingPolicy.d.ts.map
