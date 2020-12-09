// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.
import { __extends } from "tslib";
import { BaseRequestPolicy } from "./requestPolicy";
import { Constants } from "../util/constants";
import { URLBuilder } from "../url";
function loadEnvironmentProxyValue() {
    if (!process) {
        return undefined;
    }
    if (process.env[Constants.HTTPS_PROXY]) {
        return process.env[Constants.HTTPS_PROXY];
    }
    else if (process.env[Constants.HTTPS_PROXY.toLowerCase()]) {
        return process.env[Constants.HTTPS_PROXY.toLowerCase()];
    }
    else if (process.env[Constants.HTTP_PROXY]) {
        return process.env[Constants.HTTP_PROXY];
    }
    else if (process.env[Constants.HTTP_PROXY.toLowerCase()]) {
        return process.env[Constants.HTTP_PROXY.toLowerCase()];
    }
    return undefined;
}
export function getDefaultProxySettings(proxyUrl) {
    if (!proxyUrl) {
        proxyUrl = loadEnvironmentProxyValue();
        if (!proxyUrl) {
            return undefined;
        }
    }
    var parsedUrl = URLBuilder.parse(proxyUrl);
    return {
        host: parsedUrl.getScheme() + "://" + parsedUrl.getHost(),
        port: Number.parseInt(parsedUrl.getPort() || "80")
    };
}
export function proxyPolicy(proxySettings) {
    return {
        create: function (nextPolicy, options) {
            return new ProxyPolicy(nextPolicy, options, proxySettings);
        }
    };
}
var ProxyPolicy = /** @class */ (function (_super) {
    __extends(ProxyPolicy, _super);
    function ProxyPolicy(nextPolicy, options, proxySettings) {
        var _this = _super.call(this, nextPolicy, options) || this;
        _this.proxySettings = proxySettings;
        return _this;
    }
    ProxyPolicy.prototype.sendRequest = function (request) {
        if (!request.proxySettings) {
            request.proxySettings = this.proxySettings;
        }
        return this._nextPolicy.sendRequest(request);
    };
    return ProxyPolicy;
}(BaseRequestPolicy));
export { ProxyPolicy };
//# sourceMappingURL=proxyPolicy.js.map