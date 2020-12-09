import { HttpOperationResponse } from "../httpOperationResponse";
import { WebResourceLike } from "../webResource";
import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { Debugger } from "@azure/logger";
import { Sanitizer } from "../util/sanitizer";
export interface LogPolicyOptions {
    /**
     * Header names whose values will be logged when logging is enabled. Defaults to
     * Date, traceparent, x-ms-client-request-id, and x-ms-request id.  Any headers
     * specified in this field will be added to that list.  Any other values will
     * be written to logs as "REDACTED".
     */
    allowedHeaderNames?: string[];
    /**
     * Query string names whose values will be logged when logging is enabled. By default no
     * query string values are logged.
     */
    allowedQueryParameters?: string[];
    /**
     * The Debugger (logger) instance to use for writing pipeline logs.
     */
    logger?: Debugger;
}
export declare function logPolicy(loggingOptions?: LogPolicyOptions): RequestPolicyFactory;
export declare class LogPolicy extends BaseRequestPolicy {
    logger: Debugger;
    sanitizer: Sanitizer;
    allowedHeaderNames: Set<string>;
    allowedQueryParameters: Set<string>;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, { logger, allowedHeaderNames, allowedQueryParameters }?: LogPolicyOptions);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
    private logRequest;
    private logResponse;
}
//# sourceMappingURL=logPolicy.d.ts.map
