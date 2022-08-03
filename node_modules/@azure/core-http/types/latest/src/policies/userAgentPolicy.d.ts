import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { getDefaultUserAgentKey } from "./msRestUserAgentPolicy";
import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
/**
 * Telemetry information. Key/value pairs to include inside the User-Agent string.
 */
export declare type TelemetryInfo = {
    key?: string;
    value?: string;
};
/**
 * Options for adding user agent details to outgoing requests.
 */
export interface UserAgentOptions {
    /**
     * String prefix to add to the user agent for outgoing requests.
     * Defaults to an empty string.
     */
    userAgentPrefix?: string;
}
export declare const getDefaultUserAgentHeaderName: typeof getDefaultUserAgentKey;
/**
 * The default approach to generate user agents.
 * Uses static information from this package, plus system information available from the runtime.
 */
export declare function getDefaultUserAgentValue(): string;
/**
 * Returns a policy that adds the user agent header to outgoing requests based on the given {@link TelemetryInfo}.
 * @param userAgentData - Telemetry information.
 * @returns A new {@link UserAgentPolicy}.
 */
export declare function userAgentPolicy(userAgentData?: TelemetryInfo): RequestPolicyFactory;
/**
 * A policy that adds the user agent header to outgoing requests based on the given {@link TelemetryInfo}.
 */
export declare class UserAgentPolicy extends BaseRequestPolicy {
    readonly _nextPolicy: RequestPolicy;
    readonly _options: RequestPolicyOptions;
    protected headerKey: string;
    protected headerValue: string;
    constructor(_nextPolicy: RequestPolicy, _options: RequestPolicyOptions, headerKey: string, headerValue: string);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
    /**
     * Adds the user agent header to the outgoing request.
     */
    addUserAgentHeader(request: WebResourceLike): void;
}
//# sourceMappingURL=userAgentPolicy.d.ts.map