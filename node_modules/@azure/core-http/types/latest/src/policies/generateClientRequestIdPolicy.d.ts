import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
export declare function generateClientRequestIdPolicy(requestIdHeaderName?: string): RequestPolicyFactory;
export declare class GenerateClientRequestIdPolicy extends BaseRequestPolicy {
    private _requestIdHeaderName;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, _requestIdHeaderName: string);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=generateClientRequestIdPolicy.d.ts.map