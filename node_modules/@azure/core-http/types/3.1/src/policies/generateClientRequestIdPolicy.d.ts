import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
/**
 * Creates a policy that assigns a unique request id to outgoing requests.
 * @param requestIdHeaderName - The name of the header to use when assigning the unique id to the request.
 */
export declare function generateClientRequestIdPolicy(requestIdHeaderName?: string): RequestPolicyFactory;
export declare class GenerateClientRequestIdPolicy extends BaseRequestPolicy {
    private _requestIdHeaderName;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, _requestIdHeaderName: string);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=generateClientRequestIdPolicy.d.ts.map
