import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
/**
 * Options for how HTTP connections should be maintained for future
 * requests.
 */
export interface KeepAliveOptions {
    /**
     * When true, connections will be kept alive for multiple requests.
     * Defaults to true.
     */
    enable: boolean;
}
/**
 * By default, HTTP connections are maintained for future requests.
 */
export declare const DefaultKeepAliveOptions: KeepAliveOptions;
/**
 * Creates a policy that controls whether HTTP connections are maintained on future requests.
 * @param keepAliveOptions - Keep alive options. By default, HTTP connections are maintained for future requests.
 * @returns An instance of the {@link KeepAlivePolicy}
 */
export declare function keepAlivePolicy(keepAliveOptions?: KeepAliveOptions): RequestPolicyFactory;
/**
 * KeepAlivePolicy is a policy used to control keep alive settings for every request.
 */
export declare class KeepAlivePolicy extends BaseRequestPolicy {
    private readonly keepAliveOptions;
    /**
     * Creates an instance of KeepAlivePolicy.
     *
     * @param nextPolicy -
     * @param options -
     * @param keepAliveOptions -
     */
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, keepAliveOptions: KeepAliveOptions);
    /**
     * Sends out request.
     *
     * @param request -
     * @returns
     */
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=keepAlivePolicy.d.ts.map