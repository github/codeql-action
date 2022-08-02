// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, } from "./requestPolicy";
import { Sanitizer } from "../util/sanitizer";
import { logger as coreLogger } from "../log";
/**
 * Creates a policy that logs information about the outgoing request and the incoming responses.
 * @param loggingOptions - Logging options.
 * @returns An instance of the {@link LogPolicy}
 */
export function logPolicy(loggingOptions = {}) {
    return {
        create: (nextPolicy, options) => {
            return new LogPolicy(nextPolicy, options, loggingOptions);
        },
    };
}
/**
 * A policy that logs information about the outgoing request and the incoming responses.
 */
export class LogPolicy extends BaseRequestPolicy {
    constructor(nextPolicy, options, { logger = coreLogger.info, allowedHeaderNames = [], allowedQueryParameters = [], } = {}) {
        super(nextPolicy, options);
        this.logger = logger;
        this.sanitizer = new Sanitizer({ allowedHeaderNames, allowedQueryParameters });
    }
    /**
     * Header names whose values will be logged when logging is enabled. Defaults to
     * Date, traceparent, x-ms-client-request-id, and x-ms-request id.  Any headers
     * specified in this field will be added to that list.  Any other values will
     * be written to logs as "REDACTED".
     * @deprecated Pass these into the constructor instead.
     */
    get allowedHeaderNames() {
        return this.sanitizer.allowedHeaderNames;
    }
    /**
     * Header names whose values will be logged when logging is enabled. Defaults to
     * Date, traceparent, x-ms-client-request-id, and x-ms-request id.  Any headers
     * specified in this field will be added to that list.  Any other values will
     * be written to logs as "REDACTED".
     * @deprecated Pass these into the constructor instead.
     */
    set allowedHeaderNames(allowedHeaderNames) {
        this.sanitizer.allowedHeaderNames = allowedHeaderNames;
    }
    /**
     * Query string names whose values will be logged when logging is enabled. By default no
     * query string values are logged.
     * @deprecated Pass these into the constructor instead.
     */
    get allowedQueryParameters() {
        return this.sanitizer.allowedQueryParameters;
    }
    /**
     * Query string names whose values will be logged when logging is enabled. By default no
     * query string values are logged.
     * @deprecated Pass these into the constructor instead.
     */
    set allowedQueryParameters(allowedQueryParameters) {
        this.sanitizer.allowedQueryParameters = allowedQueryParameters;
    }
    sendRequest(request) {
        if (!this.logger.enabled)
            return this._nextPolicy.sendRequest(request);
        this.logRequest(request);
        return this._nextPolicy.sendRequest(request).then((response) => this.logResponse(response));
    }
    logRequest(request) {
        this.logger(`Request: ${this.sanitizer.sanitize(request)}`);
    }
    logResponse(response) {
        this.logger(`Response status code: ${response.status}`);
        this.logger(`Headers: ${this.sanitizer.sanitize(response.headers)}`);
        return response;
    }
}
//# sourceMappingURL=logPolicy.js.map