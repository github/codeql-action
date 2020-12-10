import { RequestPolicyFactory, RequestPolicy, RequestPolicyOptions, BaseRequestPolicy } from "./requestPolicy";
import { WebResourceLike } from "../webResource";
import { HttpOperationResponse } from "../httpOperationResponse";
export interface TracingPolicyOptions {
    userAgent?: string;
}
export declare function tracingPolicy(tracingOptions?: TracingPolicyOptions): RequestPolicyFactory;
export declare class TracingPolicy extends BaseRequestPolicy {
    private userAgent?;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, tracingOptions: TracingPolicyOptions);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=tracingPolicy.d.ts.map