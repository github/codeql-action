// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { Sanitizer } from "./util/sanitizer";
import { custom } from "./util/inspect";
const errorSanitizer = new Sanitizer();
/**
 * An error resulting from an HTTP request to a service endpoint.
 */
export class RestError extends Error {
    constructor(message, code, statusCode, request, response) {
        super(message);
        this.name = "RestError";
        this.code = code;
        this.statusCode = statusCode;
        this.request = request;
        this.response = response;
        Object.setPrototypeOf(this, RestError.prototype);
    }
    /**
     * Logging method for util.inspect in Node
     */
    [custom]() {
        return `RestError: ${this.message} \n ${errorSanitizer.sanitize(this)}`;
    }
}
/**
 * A constant string to identify errors that may arise when making an HTTP request that indicates an issue with the transport layer (e.g. the hostname of the URL cannot be resolved via DNS.)
 */
RestError.REQUEST_SEND_ERROR = "REQUEST_SEND_ERROR";
/**
 * A constant string to identify errors that may arise from parsing an incoming HTTP response. Usually indicates a malformed HTTP body, such as an encoded JSON payload that is incomplete.
 */
RestError.PARSE_ERROR = "PARSE_ERROR";
//# sourceMappingURL=restError.js.map