// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { __extends } from "tslib";
import { FetchHttpClient } from "./fetchHttpClient";
var BrowserFetchHttpClient = /** @class */ (function (_super) {
    __extends(BrowserFetchHttpClient, _super);
    function BrowserFetchHttpClient() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    BrowserFetchHttpClient.prototype.prepareRequest = function (_httpRequest) {
        return Promise.resolve({});
    };
    BrowserFetchHttpClient.prototype.processRequest = function (_operationResponse) {
        return Promise.resolve();
    };
    // eslint-disable-next-line @azure/azure-sdk/ts-apisurface-standardized-verbs
    BrowserFetchHttpClient.prototype.fetch = function (input, init) {
        return fetch(input, init);
    };
    return BrowserFetchHttpClient;
}(FetchHttpClient));
export { BrowserFetchHttpClient };
//# sourceMappingURL=browserFetchHttpClient.js.map