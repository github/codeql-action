// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { URLBuilder, URLQuery } from "../url";
import { isObject } from "./utils";
const RedactedString = "REDACTED";
const defaultAllowedHeaderNames = [
    "x-ms-client-request-id",
    "x-ms-return-client-request-id",
    "x-ms-useragent",
    "x-ms-correlation-request-id",
    "x-ms-request-id",
    "client-request-id",
    "ms-cv",
    "return-client-request-id",
    "traceparent",
    "Access-Control-Allow-Credentials",
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Methods",
    "Access-Control-Allow-Origin",
    "Access-Control-Expose-Headers",
    "Access-Control-Max-Age",
    "Access-Control-Request-Headers",
    "Access-Control-Request-Method",
    "Origin",
    "Accept",
    "Accept-Encoding",
    "Cache-Control",
    "Connection",
    "Content-Length",
    "Content-Type",
    "Date",
    "ETag",
    "Expires",
    "If-Match",
    "If-Modified-Since",
    "If-None-Match",
    "If-Unmodified-Since",
    "Last-Modified",
    "Pragma",
    "Request-Id",
    "Retry-After",
    "Server",
    "Transfer-Encoding",
    "User-Agent",
    "WWW-Authenticate",
];
const defaultAllowedQueryParameters = ["api-version"];
export class Sanitizer {
    constructor({ allowedHeaderNames = [], allowedQueryParameters = [] } = {}) {
        allowedHeaderNames = Array.isArray(allowedHeaderNames)
            ? defaultAllowedHeaderNames.concat(allowedHeaderNames)
            : defaultAllowedHeaderNames;
        allowedQueryParameters = Array.isArray(allowedQueryParameters)
            ? defaultAllowedQueryParameters.concat(allowedQueryParameters)
            : defaultAllowedQueryParameters;
        this.allowedHeaderNames = new Set(allowedHeaderNames.map((n) => n.toLowerCase()));
        this.allowedQueryParameters = new Set(allowedQueryParameters.map((p) => p.toLowerCase()));
    }
    sanitize(obj) {
        const seen = new Set();
        return JSON.stringify(obj, (key, value) => {
            // Ensure Errors include their interesting non-enumerable members
            if (value instanceof Error) {
                return Object.assign(Object.assign({}, value), { name: value.name, message: value.message });
            }
            if (key === "_headersMap") {
                return this.sanitizeHeaders(value);
            }
            else if (key === "url") {
                return this.sanitizeUrl(value);
            }
            else if (key === "query") {
                return this.sanitizeQuery(value);
            }
            else if (key === "body") {
                // Don't log the request body
                return undefined;
            }
            else if (key === "response") {
                // Don't log response again
                return undefined;
            }
            else if (key === "operationSpec") {
                // When using sendOperationRequest, the request carries a massive
                // field with the autorest spec. No need to log it.
                return undefined;
            }
            else if (Array.isArray(value) || isObject(value)) {
                if (seen.has(value)) {
                    return "[Circular]";
                }
                seen.add(value);
            }
            return value;
        }, 2);
    }
    sanitizeHeaders(value) {
        return this.sanitizeObject(value, this.allowedHeaderNames, (v, k) => v[k].value);
    }
    sanitizeQuery(value) {
        return this.sanitizeObject(value, this.allowedQueryParameters, (v, k) => v[k]);
    }
    sanitizeObject(value, allowedKeys, accessor) {
        if (typeof value !== "object" || value === null) {
            return value;
        }
        const sanitized = {};
        for (const k of Object.keys(value)) {
            if (allowedKeys.has(k.toLowerCase())) {
                sanitized[k] = accessor(value, k);
            }
            else {
                sanitized[k] = RedactedString;
            }
        }
        return sanitized;
    }
    sanitizeUrl(value) {
        if (typeof value !== "string" || value === null) {
            return value;
        }
        const urlBuilder = URLBuilder.parse(value);
        const queryString = urlBuilder.getQuery();
        if (!queryString) {
            return value;
        }
        const query = URLQuery.parse(queryString);
        for (const k of query.keys()) {
            if (!this.allowedQueryParameters.has(k.toLowerCase())) {
                query.set(k, RedactedString);
            }
        }
        urlBuilder.setQuery(query.toString());
        return urlBuilder.toString();
    }
}
//# sourceMappingURL=sanitizer.js.map