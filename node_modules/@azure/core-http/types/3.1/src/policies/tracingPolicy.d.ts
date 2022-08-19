import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { Span } from "@azure/core-tracing";
import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
/**
 * Options to customize the tracing policy.
 */
export interface TracingPolicyOptions {
    /**
     * User agent used to better identify the outgoing requests traced by the tracing policy.
     */
    userAgent?: string;
}
/**
 * Creates a policy that wraps outgoing requests with a tracing span.
 * @param tracingOptions - Tracing options.
 * @returns An instance of the {@link TracingPolicy} class.
 */
export declare function tracingPolicy(tracingOptions?: TracingPolicyOptions): RequestPolicyFactory;
/**
 * A policy that wraps outgoing requests with a tracing span.
 */
export declare class TracingPolicy extends BaseRequestPolicy {
    private userAgent?;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, tracingOptions: TracingPolicyOptions);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
    tryCreateSpan(request: WebResourceLike): Span | undefined;
    private tryProcessError;
    private tryProcessResponse;
}
//# sourceMappingURL=tracingPolicy.d.ts.map
