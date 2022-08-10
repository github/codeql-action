/**
 * A set of constants used internally when processing requests.
 */
export declare const Constants: {
    /**
     * The core-http version
     */
    coreHttpVersion: string;
    /**
     * Specifies HTTP.
     */
    HTTP: string;
    /**
     * Specifies HTTPS.
     */
    HTTPS: string;
    /**
     * Specifies HTTP Proxy.
     */
    HTTP_PROXY: string;
    /**
     * Specifies HTTPS Proxy.
     */
    HTTPS_PROXY: string;
    /**
     * Specifies NO Proxy.
     */
    NO_PROXY: string;
    /**
     * Specifies ALL Proxy.
     */
    ALL_PROXY: string;
    HttpConstants: {
        /**
         * Http Verbs
         */
        HttpVerbs: {
            PUT: string;
            GET: string;
            DELETE: string;
            POST: string;
            MERGE: string;
            HEAD: string;
            PATCH: string;
        };
        StatusCodes: {
            TooManyRequests: number;
            ServiceUnavailable: number;
        };
    };
    /**
     * Defines constants for use with HTTP headers.
     */
    HeaderConstants: {
        /**
         * The Authorization header.
         */
        AUTHORIZATION: string;
        AUTHORIZATION_SCHEME: string;
        /**
         * The Retry-After response-header field can be used with a 503 (Service
         * Unavailable) or 349 (Too Many Requests) responses to indicate how long
         * the service is expected to be unavailable to the requesting client.
         */
        RETRY_AFTER: string;
        /**
         * The UserAgent header.
         */
        USER_AGENT: string;
    };
};
//# sourceMappingURL=constants.d.ts.map
