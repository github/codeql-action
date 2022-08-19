import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
/**
 * Policy that retries the request as many times as configured for as long as the max retry time interval specified, each retry waiting longer to begin than the last time.
 * @param retryCount - Maximum number of retries.
 * @param retryInterval - Base time between retries.
 * @param maxRetryInterval - Maximum time to wait between retries.
 */
export declare function exponentialRetryPolicy(retryCount?: number, retryInterval?: number, maxRetryInterval?: number): RequestPolicyFactory;
/**
 * Describes the Retry Mode type. Currently supporting only Exponential.
 */
export declare enum RetryMode {
    /**
     * Currently supported retry mode.
     * Each time a retry happens, it will take exponentially more time than the last time.
     */
    Exponential = 0
}
/**
 * Options that control how to retry failed requests.
 */
export interface RetryOptions {
    /**
     * The maximum number of retry attempts.  Defaults to 3.
     */
    maxRetries?: number;
    /**
     * The amount of delay in milliseconds between retry attempts. Defaults to 30000
     * (30 seconds). The delay increases exponentially with each retry up to a maximum
     * specified by maxRetryDelayInMs.
     */
    retryDelayInMs?: number;
    /**
     * The maximum delay in milliseconds allowed before retrying an operation. Defaults
     * to 90000 (90 seconds).
     */
    maxRetryDelayInMs?: number;
    /**
     * Currently supporting only Exponential mode.
     */
    mode?: RetryMode;
}
export declare const DefaultRetryOptions: RetryOptions;
/**
 * Instantiates a new "ExponentialRetryPolicyFilter" instance.
 */
export declare class ExponentialRetryPolicy extends BaseRequestPolicy {
    /**
     * The client retry count.
     */
    retryCount: number;
    /**
     * The client retry interval in milliseconds.
     */
    retryInterval: number;
    /**
     * The maximum retry interval in milliseconds.
     */
    maxRetryInterval: number;
    /**
     * @param nextPolicy - The next RequestPolicy in the pipeline chain.
     * @param options - The options for this RequestPolicy.
     * @param retryCount - The client retry count.
     * @param retryInterval - The client retry interval, in milliseconds.
     * @param minRetryInterval - The minimum retry interval, in milliseconds.
     * @param maxRetryInterval - The maximum retry interval, in milliseconds.
     */
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, retryCount?: number, retryInterval?: number, maxRetryInterval?: number);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=exponentialRetryPolicy.d.ts.map