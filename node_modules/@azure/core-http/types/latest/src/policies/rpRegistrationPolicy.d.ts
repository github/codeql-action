import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
export declare function rpRegistrationPolicy(retryTimeout?: number): RequestPolicyFactory;
export declare class RPRegistrationPolicy extends BaseRequestPolicy {
    readonly _retryTimeout: number;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, _retryTimeout?: number);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=rpRegistrationPolicy.d.ts.map