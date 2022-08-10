import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResource } from "../webResource";
/**
 * Returns a request policy factory that can be used to create an instance of
 * {@link DisableResponseDecompressionPolicy}.
 */
export declare function disableResponseDecompressionPolicy(): RequestPolicyFactory;
/**
 * A policy to disable response decompression according to Accept-Encoding header
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Encoding
 */
export declare class DisableResponseDecompressionPolicy extends BaseRequestPolicy {
    /**
     * Creates an instance of DisableResponseDecompressionPolicy.
     *
     * @param nextPolicy -
     * @param options -
     */
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions);
    /**
     * Sends out request.
     *
     * @param request -
     * @returns
     */
    sendRequest(request: WebResource): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=disableResponseDecompressionPolicy.d.ts.map