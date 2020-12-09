// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { __extends } from "tslib";
import { URLBuilder } from "../url";
import { BaseRequestPolicy } from "./requestPolicy";
/**
 * Methods that are allowed to follow redirects 301 and 302
 */
var allowedRedirect = ["GET", "HEAD"];
export var DefaultRedirectOptions = {
    handleRedirects: true,
    maxRetries: 20
};
export function redirectPolicy(maximumRetries) {
    if (maximumRetries === void 0) { maximumRetries = 20; }
    return {
        create: function (nextPolicy, options) {
            return new RedirectPolicy(nextPolicy, options, maximumRetries);
        }
    };
}
var RedirectPolicy = /** @class */ (function (_super) {
    __extends(RedirectPolicy, _super);
    function RedirectPolicy(nextPolicy, options, maxRetries) {
        if (maxRetries === void 0) { maxRetries = 20; }
        var _this = _super.call(this, nextPolicy, options) || this;
        _this.maxRetries = maxRetries;
        return _this;
    }
    RedirectPolicy.prototype.sendRequest = function (request) {
        var _this = this;
        return this._nextPolicy
            .sendRequest(request)
            .then(function (response) { return handleRedirect(_this, response, 0); });
    };
    return RedirectPolicy;
}(BaseRequestPolicy));
export { RedirectPolicy };
function handleRedirect(policy, response, currentRetries) {
    var request = response.request, status = response.status;
    var locationHeader = response.headers.get("location");
    if (locationHeader &&
        (status === 300 ||
            (status === 301 && allowedRedirect.includes(request.method)) ||
            (status === 302 && allowedRedirect.includes(request.method)) ||
            (status === 303 && request.method === "POST") ||
            status === 307) &&
        (!policy.maxRetries || currentRetries < policy.maxRetries)) {
        var builder = URLBuilder.parse(request.url);
        builder.setPath(locationHeader);
        request.url = builder.toString();
        // POST request with Status code 303 should be converted into a
        // redirected GET request if the redirect url is present in the location header
        if (status === 303) {
            request.method = "GET";
            delete request.body;
        }
        return policy._nextPolicy
            .sendRequest(request)
            .then(function (res) { return handleRedirect(policy, res, currentRetries + 1); });
    }
    return Promise.resolve(response);
}
//# sourceMappingURL=redirectPolicy.js.map