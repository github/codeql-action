import { BaseRequestPolicy, RequestPolicy, RequestPolicyOptions, RequestPolicyFactory } from "./requestPolicy";
import { WebResource } from "../webResource";
import { HttpOperationResponse } from "../httpOperationResponse";
/**
 * {@link DisableResponseDecompressionPolicy} is not supported in browser and attempting
 * to use it will results in error being thrown.
 */
export declare function disableResponseDecompressionPolicy(): RequestPolicyFactory;
export declare class DisableResponseDecompressionPolicy extends BaseRequestPolicy {
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions);
    sendRequest(_request: WebResource): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=disableResponseDecompressionPolicy.browser.d.ts.map