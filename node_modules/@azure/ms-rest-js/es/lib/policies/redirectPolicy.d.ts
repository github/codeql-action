import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptionsLike } from "./requestPolicy";
export declare function redirectPolicy(maximumRetries?: number): RequestPolicyFactory;
export declare class RedirectPolicy extends BaseRequestPolicy {
    readonly maxRetries: number;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptionsLike, maxRetries?: number);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=redirectPolicy.d.ts.map