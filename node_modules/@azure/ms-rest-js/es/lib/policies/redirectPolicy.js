// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.
import { __extends } from "tslib";
import { URLBuilder } from "../url";
import { BaseRequestPolicy } from "./requestPolicy";
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
        return this._nextPolicy.sendRequest(request).then(function (response) { return handleRedirect(_this, response, 0); });
    };
    return RedirectPolicy;
}(BaseRequestPolicy));
export { RedirectPolicy };
function handleRedirect(policy, response, currentRetries) {
    var request = response.request, status = response.status;
    var locationHeader = response.headers.get("location");
    if (locationHeader &&
        (status === 300 || status === 307 || (status === 303 && request.method === "POST")) &&
        (!policy.maxRetries || currentRetries < policy.maxRetries)) {
        var builder = URLBuilder.parse(request.url);
        builder.setPath(locationHeader);
        request.url = builder.toString();
        // POST request with Status code 303 should be converted into a
        // redirected GET request if the redirect url is present in the location header
        if (status === 303) {
            request.method = "GET";
        }
        return policy._nextPolicy.sendRequest(request)
            .then(function (res) { return handleRedirect(policy, res, currentRetries + 1); });
    }
    return Promise.resolve(response);
}
//# sourceMappingURL=redirectPolicy.js.map