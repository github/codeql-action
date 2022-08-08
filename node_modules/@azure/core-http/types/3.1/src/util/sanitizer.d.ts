export interface SanitizerOptions {
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
}
export declare class Sanitizer {
    allowedHeaderNames: Set<string>;
    allowedQueryParameters: Set<string>;
    constructor({ allowedHeaderNames, allowedQueryParameters }?: SanitizerOptions);
    sanitize(obj: unknown): string;
    private sanitizeHeaders;
    private sanitizeQuery;
    private sanitizeObject;
    private sanitizeUrl;
}
//# sourceMappingURL=sanitizer.d.ts.map
