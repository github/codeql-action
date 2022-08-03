import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
declare type ResponseHandler = (httpRequest: WebResourceLike, response: HttpOperationResponse) => Promise<HttpOperationResponse>;
/**
 * Creates a policy that re-sends the request if the response indicates the request failed because of throttling reasons.
 * For example, if the response contains a `Retry-After` header, it will retry sending the request based on the value of that header.
 *
 * To learn more, please refer to
 * https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-manager-request-limits,
 * https://docs.microsoft.com/en-us/azure/azure-subscription-service-limits and
 * https://docs.microsoft.com/en-us/azure/virtual-machines/troubleshooting/troubleshooting-throttling-errors
 * @returns
 */
export declare function throttlingRetryPolicy(): RequestPolicyFactory;
/**
 * Creates a policy that re-sends the request if the response indicates the request failed because of throttling reasons.
 * For example, if the response contains a `Retry-After` header, it will retry sending the request based on the value of that header.
 *
 * To learn more, please refer to
 * https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-manager-request-limits,
 * https://docs.microsoft.com/en-us/azure/azure-subscription-service-limits and
 * https://docs.microsoft.com/en-us/azure/virtual-machines/troubleshooting/troubleshooting-throttling-errors
 */
export declare class ThrottlingRetryPolicy extends BaseRequestPolicy {
    private _handleResponse;
    private numberOfRetries;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, _handleResponse?: ResponseHandler);
    sendRequest(httpRequest: WebResourceLike): Promise<HttpOperationResponse>;
    private _defaultResponseHandler;
    static parseRetryAfterHeader(headerValue: string): number | undefined;
    static parseDateRetryAfterHeader(headerValue: string): number | undefined;
}
export {};
//# sourceMappingURL=throttlingRetryPolicy.d.ts.map