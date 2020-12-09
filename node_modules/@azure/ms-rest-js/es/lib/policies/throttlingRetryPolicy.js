// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.
import { __awaiter, __extends, __generator } from "tslib";
import { BaseRequestPolicy } from "./requestPolicy";
import { Constants } from "../util/constants";
import { delay } from "../util/utils";
var StatusCodes = Constants.HttpConstants.StatusCodes;
export function throttlingRetryPolicy() {
    return {
        create: function (nextPolicy, options) {
            return new ThrottlingRetryPolicy(nextPolicy, options);
        }
    };
}
/**
 * To learn more, please refer to
 * https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-manager-request-limits,
 * https://docs.microsoft.com/en-us/azure/azure-subscription-service-limits and
 * https://docs.microsoft.com/en-us/azure/virtual-machines/troubleshooting/troubleshooting-throttling-errors
 */
var ThrottlingRetryPolicy = /** @class */ (function (_super) {
    __extends(ThrottlingRetryPolicy, _super);
    function ThrottlingRetryPolicy(nextPolicy, options, _handleResponse) {
        var _this = _super.call(this, nextPolicy, options) || this;
        _this._handleResponse = _handleResponse || _this._defaultResponseHandler;
        return _this;
    }
    ThrottlingRetryPolicy.prototype.sendRequest = function (httpRequest) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, this._nextPolicy.sendRequest(httpRequest.clone()).then(function (response) {
                        if (response.status !== StatusCodes.TooManyRequests) {
                            return response;
                        }
                        else {
                            return _this._handleResponse(httpRequest, response);
                        }
                    })];
            });
        });
    };
    ThrottlingRetryPolicy.prototype._defaultResponseHandler = function (httpRequest, httpResponse) {
        return __awaiter(this, void 0, void 0, function () {
            var retryAfterHeader, delayInMs;
            var _this = this;
            return __generator(this, function (_a) {
                retryAfterHeader = httpResponse.headers.get(Constants.HeaderConstants.RETRY_AFTER);
                if (retryAfterHeader) {
                    delayInMs = ThrottlingRetryPolicy.parseRetryAfterHeader(retryAfterHeader);
                    if (delayInMs) {
                        return [2 /*return*/, delay(delayInMs).then(function (_) { return _this._nextPolicy.sendRequest(httpRequest); })];
                    }
                }
                return [2 /*return*/, httpResponse];
            });
        });
    };
    ThrottlingRetryPolicy.parseRetryAfterHeader = function (headerValue) {
        var retryAfterInSeconds = Number(headerValue);
        if (Number.isNaN(retryAfterInSeconds)) {
            return ThrottlingRetryPolicy.parseDateRetryAfterHeader(headerValue);
        }
        else {
            return retryAfterInSeconds * 1000;
        }
    };
    ThrottlingRetryPolicy.parseDateRetryAfterHeader = function (headerValue) {
        try {
            var now = Date.now();
            var date = Date.parse(headerValue);
            var diff = date - now;
            return Number.isNaN(diff) ? undefined : diff;
        }
        catch (error) {
            return undefined;
        }
    };
    return ThrottlingRetryPolicy;
}(BaseRequestPolicy));
export { ThrottlingRetryPolicy };
//# sourceMappingURL=throttlingRetryPolicy.js.map