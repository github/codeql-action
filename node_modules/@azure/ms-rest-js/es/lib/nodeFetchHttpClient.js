// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.
import { __awaiter, __extends, __generator } from "tslib";
import * as tough from "tough-cookie";
import * as http from "http";
import * as https from "https";
import node_fetch from "node-fetch";
import { FetchHttpClient, } from "./fetchHttpClient";
import { createProxyAgent } from "./proxyAgent";
var NodeFetchHttpClient = /** @class */ (function (_super) {
    __extends(NodeFetchHttpClient, _super);
    function NodeFetchHttpClient() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.cookieJar = new tough.CookieJar(undefined, { looseMode: true });
        return _this;
    }
    NodeFetchHttpClient.prototype.fetch = function (input, init) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, node_fetch(input, init)];
            });
        });
    };
    NodeFetchHttpClient.prototype.prepareRequest = function (httpRequest) {
        return __awaiter(this, void 0, void 0, function () {
            var requestInit, cookieString, _a, httpAgent, httpsAgent, tunnel, options, agent;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        requestInit = {};
                        if (!(this.cookieJar && !httpRequest.headers.get("Cookie"))) return [3 /*break*/, 2];
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                _this.cookieJar.getCookieString(httpRequest.url, function (err, cookie) {
                                    if (err) {
                                        reject(err);
                                    }
                                    else {
                                        resolve(cookie);
                                    }
                                });
                            })];
                    case 1:
                        cookieString = _b.sent();
                        httpRequest.headers.set("Cookie", cookieString);
                        _b.label = 2;
                    case 2:
                        if (httpRequest.agentSettings) {
                            _a = httpRequest.agentSettings, httpAgent = _a.http, httpsAgent = _a.https;
                            if (httpsAgent && httpRequest.url.startsWith("https")) {
                                requestInit.agent = httpsAgent;
                            }
                            else if (httpAgent) {
                                requestInit.agent = httpAgent;
                            }
                        }
                        else if (httpRequest.proxySettings) {
                            tunnel = createProxyAgent(httpRequest.url, httpRequest.proxySettings, httpRequest.headers);
                            requestInit.agent = tunnel.agent;
                        }
                        if (httpRequest.keepAlive === true) {
                            if (requestInit.agent) {
                                requestInit.agent.keepAlive = true;
                            }
                            else {
                                options = { keepAlive: true };
                                agent = httpRequest.url.startsWith("https")
                                    ? new https.Agent(options)
                                    : new http.Agent(options);
                                requestInit.agent = agent;
                            }
                        }
                        return [2 /*return*/, requestInit];
                }
            });
        });
    };
    NodeFetchHttpClient.prototype.processRequest = function (operationResponse) {
        return __awaiter(this, void 0, void 0, function () {
            var setCookieHeader_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.cookieJar) return [3 /*break*/, 2];
                        setCookieHeader_1 = operationResponse.headers.get("Set-Cookie");
                        if (!(setCookieHeader_1 != undefined)) return [3 /*break*/, 2];
                        return [4 /*yield*/, new Promise(function (resolve, reject) {
                                _this.cookieJar.setCookie(setCookieHeader_1, operationResponse.request.url, { ignoreError: true }, function (err) {
                                    if (err) {
                                        reject(err);
                                    }
                                    else {
                                        resolve();
                                    }
                                });
                            })];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    return NodeFetchHttpClient;
}(FetchHttpClient));
export { NodeFetchHttpClient };
//# sourceMappingURL=nodeFetchHttpClient.js.map