// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { __awaiter, __extends, __generator } from "tslib";
/*
 * NOTE: When moving this file, please update "browser" section in package.json
 */
import { BaseRequestPolicy } from "./requestPolicy";
var DisbleResponseDecompressionNotSupportedInBrowser = new Error("DisableResponseDecompressionPolicy is not supported in browser environment");
/**
 * {@link DisableResponseDecompressionPolicy} is not supported in browser and attempting
 * to use it will results in error being thrown.
 */
export function disableResponseDecompressionPolicy() {
    return {
        create: function (_nextPolicy, _options) {
            throw DisbleResponseDecompressionNotSupportedInBrowser;
        }
    };
}
var DisableResponseDecompressionPolicy = /** @class */ (function (_super) {
    __extends(DisableResponseDecompressionPolicy, _super);
    function DisableResponseDecompressionPolicy(nextPolicy, options) {
        var _this = _super.call(this, nextPolicy, options) || this;
        throw DisbleResponseDecompressionNotSupportedInBrowser;
        return _this;
    }
    DisableResponseDecompressionPolicy.prototype.sendRequest = function (_request) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                throw DisbleResponseDecompressionNotSupportedInBrowser;
            });
        });
    };
    return DisableResponseDecompressionPolicy;
}(BaseRequestPolicy));
export { DisableResponseDecompressionPolicy };
//# sourceMappingURL=disableResponseDecompressionPolicy.browser.js.map