import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { Debugger } from "@azure/logger";
import { HttpOperationResponse } from "../httpOperationResponse";
import { Sanitizer } from "../util/sanitizer";
import { WebResourceLike } from "../webResource";
/**
 * Options to pass to the {@link logPolicy}.
 * By default only a set list of headers are logged, though this can be configured. Request and response bodies are never logged.
 */
export interface LogPolicyOptions {
    /**
     * Header names whose values will be logged when logging is enabled. Defaults to:
     * x-ms-client-request-id, x-ms-return-client-request-id, x-ms-useragent, x-ms-correlation-request-id,
     * x-ms-request-id, client-request-id, ms-cv, return-client-request-id, traceparent, Access-Control-Allow-Credentials,
     * Access-Control-Allow-Headers, Access-Control-Allow-Methods, Access-Control-Allow-Origin, Access-Control-Expose-Headers,
     * Access-Control-Max-Age, Access-Control-Request-Headers, Access-Control-Request-Method, Origin, Accept, Accept-Encoding,
     * Cache-Control, Connection, Content-Length, Content-Type, Date, ETag, Expires, If-Match, If-Modified-Since, If-None-Match,
     * If-Unmodified-Since, Last-Modified, Pragma, Request-Id, Retry-After, Server, Transfer-Encoding, and User-Agent.
     *
     * Any headers specified in this field will be added to that list.
     * Any other values will be written to logs as "REDACTED".
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
/**
 * Creates a policy that logs information about the outgoing request and the incoming responses.
 * @param loggingOptions - Logging options.
 * @returns An instance of the {@link LogPolicy}
 */
export declare function logPolicy(loggingOptions?: LogPolicyOptions): RequestPolicyFactory;
/**
 * A policy that logs information about the outgoing request and the incoming responses.
 */
export declare class LogPolicy extends BaseRequestPolicy {
    logger: Debugger;
    sanitizer: Sanitizer;
    /*
    * Header names whose values will be logged when logging is enabled. Defaults to
    * Date, traceparent, x-ms-client-request-id, and x-ms-request id.  Any headers
    * specified in this field will be added to that list.  Any other values will
    * be written to logs as "REDACTED".
    * @deprecated Pass these into the constructor instead.
    
    
    * Header names whose values will be logged when logging is enabled. Defaults to
    * Date, traceparent, x-ms-client-request-id, and x-ms-request id.  Any headers
    * specified in this field will be added to that list.  Any other values will
    * be written to logs as "REDACTED".
    * @deprecated Pass these into the constructor instead.
    */
    allowedHeaderNames: Set<string>;
    /*
    * Query string names whose values will be logged when logging is enabled. By default no
    * query string values are logged.
    * @deprecated Pass these into the constructor instead.
    
    
    * Query string names whose values will be logged when logging is enabled. By default no
    * query string values are logged.
    * @deprecated Pass these into the constructor instead.
    */
    allowedQueryParameters: Set<string>;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, { logger, allowedHeaderNames, allowedQueryParameters, }?: LogPolicyOptions);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
    private logRequest;
    private logResponse;
}
//# sourceMappingURL=logPolicy.d.ts.map
