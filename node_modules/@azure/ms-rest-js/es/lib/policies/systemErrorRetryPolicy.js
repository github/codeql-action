// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.
import { __extends } from "tslib";
import * as utils from "../util/utils";
import { BaseRequestPolicy } from "./requestPolicy";
export function systemErrorRetryPolicy(retryCount, retryInterval, minRetryInterval, maxRetryInterval) {
    return {
        create: function (nextPolicy, options) {
            return new SystemErrorRetryPolicy(nextPolicy, options, retryCount, retryInterval, minRetryInterval, maxRetryInterval);
        }
    };
}
/**
 * @class
 * Instantiates a new "ExponentialRetryPolicyFilter" instance.
 *
 * @constructor
 * @param {number} retryCount        The client retry count.
 * @param {number} retryInterval     The client retry interval, in milliseconds.
 * @param {number} minRetryInterval  The minimum retry interval, in milliseconds.
 * @param {number} maxRetryInterval  The maximum retry interval, in milliseconds.
 */
var SystemErrorRetryPolicy = /** @class */ (function (_super) {
    __extends(SystemErrorRetryPolicy, _super);
    function SystemErrorRetryPolicy(nextPolicy, options, retryCount, retryInterval, minRetryInterval, maxRetryInterval) {
        var _this = _super.call(this, nextPolicy, options) || this;
        _this.DEFAULT_CLIENT_RETRY_INTERVAL = 1000 * 30;
        _this.DEFAULT_CLIENT_RETRY_COUNT = 3;
        _this.DEFAULT_CLIENT_MAX_RETRY_INTERVAL = 1000 * 90;
        _this.DEFAULT_CLIENT_MIN_RETRY_INTERVAL = 1000 * 3;
        _this.retryCount = typeof retryCount === "number" ? retryCount : _this.DEFAULT_CLIENT_RETRY_COUNT;
        _this.retryInterval = typeof retryInterval === "number" ? retryInterval : _this.DEFAULT_CLIENT_RETRY_INTERVAL;
        _this.minRetryInterval = typeof minRetryInterval === "number" ? minRetryInterval : _this.DEFAULT_CLIENT_MIN_RETRY_INTERVAL;
        _this.maxRetryInterval = typeof maxRetryInterval === "number" ? maxRetryInterval : _this.DEFAULT_CLIENT_MAX_RETRY_INTERVAL;
        return _this;
    }
    SystemErrorRetryPolicy.prototype.sendRequest = function (request) {
        var _this = this;
        return this._nextPolicy.sendRequest(request.clone()).then(function (response) { return retry(_this, request, response); });
    };
    return SystemErrorRetryPolicy;
}(BaseRequestPolicy));
export { SystemErrorRetryPolicy };
/**
 * Determines if the operation should be retried and how long to wait until the next retry.
 *
 * @param {number} statusCode The HTTP status code.
 * @param {RetryData} retryData  The retry data.
 * @return {boolean} True if the operation qualifies for a retry; false otherwise.
 */
function shouldRetry(policy, retryData) {
    var currentCount;
    if (!retryData) {
        throw new Error("retryData for the SystemErrorRetryPolicyFilter cannot be null.");
    }
    else {
        currentCount = (retryData && retryData.retryCount);
    }
    return (currentCount < policy.retryCount);
}
/**
 * Updates the retry data for the next attempt.
 *
 * @param {RetryData} retryData  The retry data.
 * @param {object} err        The operation"s error, if any.
 */
function updateRetryData(policy, retryData, err) {
    if (!retryData) {
        retryData = {
            retryCount: 0,
            retryInterval: 0
        };
    }
    if (err) {
        if (retryData.error) {
            err.innerError = retryData.error;
        }
        retryData.error = err;
    }
    // Adjust retry count
    retryData.retryCount++;
    // Adjust retry interval
    var incrementDelta = Math.pow(2, retryData.retryCount) - 1;
    var boundedRandDelta = policy.retryInterval * 0.8 +
        Math.floor(Math.random() * (policy.retryInterval * 1.2 - policy.retryInterval * 0.8));
    incrementDelta *= boundedRandDelta;
    retryData.retryInterval = Math.min(policy.minRetryInterval + incrementDelta, policy.maxRetryInterval);
    return retryData;
}
function retry(policy, request, operationResponse, retryData, err) {
    retryData = updateRetryData(policy, retryData, err);
    if (err && err.code && shouldRetry(policy, retryData) &&
        (err.code === "ETIMEDOUT" || err.code === "ESOCKETTIMEDOUT" || err.code === "ECONNREFUSED" ||
            err.code === "ECONNRESET" || err.code === "ENOENT")) {
        // If previous operation ended with an error and the policy allows a retry, do that
        return utils.delay(retryData.retryInterval)
            .then(function () { return policy._nextPolicy.sendRequest(request.clone()); })
            .then(function (res) { return retry(policy, request, res, retryData, err); })
            .catch(function (err) { return retry(policy, request, operationResponse, retryData, err); });
    }
    else {
        if (err != undefined) {
            // If the operation failed in the end, return all errors instead of just the last one
            err = retryData.error;
            return Promise.reject(err);
        }
        return Promise.resolve(operationResponse);
    }
}
//# sourceMappingURL=systemErrorRetryPolicy.js.map