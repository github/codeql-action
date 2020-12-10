// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { __extends } from "tslib";
import { custom } from "./util/inspect";
import { Sanitizer } from "./util/sanitizer";
var errorSanitizer = new Sanitizer();
var RestError = /** @class */ (function (_super) {
    __extends(RestError, _super);
    function RestError(message, code, statusCode, request, response) {
        var _this = _super.call(this, message) || this;
        _this.name = "RestError";
        _this.code = code;
        _this.statusCode = statusCode;
        _this.request = request;
        _this.response = response;
        Object.setPrototypeOf(_this, RestError.prototype);
        return _this;
    }
    /**
     * Logging method for util.inspect in Node
     */
    RestError.prototype[custom] = function () {
        return "RestError: " + this.message + " \n " + errorSanitizer.sanitize(this);
    };
    RestError.REQUEST_SEND_ERROR = "REQUEST_SEND_ERROR";
    RestError.PARSE_ERROR = "PARSE_ERROR";
    return RestError;
}(Error));
export { RestError };
//# sourceMappingURL=restError.js.map