// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { __extends } from "tslib";
import { BaseRequestPolicy } from "./requestPolicy";
import { logger as coreLogger } from "../log";
import { Sanitizer } from "../util/sanitizer";
export function logPolicy(loggingOptions) {
    if (loggingOptions === void 0) { loggingOptions = {}; }
    return {
        create: function (nextPolicy, options) {
            return new LogPolicy(nextPolicy, options, loggingOptions);
        }
    };
}
var LogPolicy = /** @class */ (function (_super) {
    __extends(LogPolicy, _super);
    function LogPolicy(nextPolicy, options, _a) {
        var _b = _a === void 0 ? {} : _a, _c = _b.logger, logger = _c === void 0 ? coreLogger.info : _c, _d = _b.allowedHeaderNames, allowedHeaderNames = _d === void 0 ? [] : _d, _e = _b.allowedQueryParameters, allowedQueryParameters = _e === void 0 ? [] : _e;
        var _this = _super.call(this, nextPolicy, options) || this;
        _this.logger = logger;
        _this.sanitizer = new Sanitizer({ allowedHeaderNames: allowedHeaderNames, allowedQueryParameters: allowedQueryParameters });
        return _this;
    }
    Object.defineProperty(LogPolicy.prototype, "allowedHeaderNames", {
        /**
         * Header names whose values will be logged when logging is enabled. Defaults to
         * Date, traceparent, x-ms-client-request-id, and x-ms-request id.  Any headers
         * specified in this field will be added to that list.  Any other values will
         * be written to logs as "REDACTED".
         * @deprecated Pass these into the constructor instead.
         */
        get: function () {
            return this.sanitizer.allowedHeaderNames;
        },
        /**
         * Header names whose values will be logged when logging is enabled. Defaults to
         * Date, traceparent, x-ms-client-request-id, and x-ms-request id.  Any headers
         * specified in this field will be added to that list.  Any other values will
         * be written to logs as "REDACTED".
         * @deprecated Pass these into the constructor instead.
         */
        set: function (allowedHeaderNames) {
            this.sanitizer.allowedHeaderNames = allowedHeaderNames;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(LogPolicy.prototype, "allowedQueryParameters", {
        /**
         * Query string names whose values will be logged when logging is enabled. By default no
         * query string values are logged.
         * @deprecated Pass these into the constructor instead.
         */
        get: function () {
            return this.sanitizer.allowedQueryParameters;
        },
        /**
         * Query string names whose values will be logged when logging is enabled. By default no
         * query string values are logged.
         * @deprecated Pass these into the constructor instead.
         */
        set: function (allowedQueryParameters) {
            this.sanitizer.allowedQueryParameters = allowedQueryParameters;
        },
        enumerable: false,
        configurable: true
    });
    LogPolicy.prototype.sendRequest = function (request) {
        var _this = this;
        if (!this.logger.enabled)
            return this._nextPolicy.sendRequest(request);
        this.logRequest(request);
        return this._nextPolicy.sendRequest(request).then(function (response) { return _this.logResponse(response); });
    };
    LogPolicy.prototype.logRequest = function (request) {
        this.logger("Request: " + this.sanitizer.sanitize(request));
    };
    LogPolicy.prototype.logResponse = function (response) {
        this.logger("Response status code: " + response.status);
        this.logger("Headers: " + this.sanitizer.sanitize(response.headers));
        return response;
    };
    return LogPolicy;
}(BaseRequestPolicy));
export { LogPolicy };
//# sourceMappingURL=logPolicy.js.map