// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { __awaiter, __extends, __generator } from "tslib";
import * as tough from "tough-cookie";
import * as http from "http";
import * as https from "https";
import node_fetch from "node-fetch";
import { FetchHttpClient } from "./fetchHttpClient";
import { createProxyAgent, isUrlHttps } from "./proxyAgent";
function getCachedAgent(isHttps, agentCache) {
    return isHttps ? agentCache.httpsAgent : agentCache.httpAgent;
}
var NodeFetchHttpClient = /** @class */ (function (_super) {
    __extends(NodeFetchHttpClient, _super);
    function NodeFetchHttpClient() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.proxyAgents = {};
        _this.keepAliveAgents = {};
        _this.cookieJar = new tough.CookieJar(undefined, { looseMode: true });
        return _this;
    }
    NodeFetchHttpClient.prototype.getOrCreateAgent = function (httpRequest) {
        var isHttps = isUrlHttps(httpRequest.url);
        // At the moment, proxy settings and keepAlive are mutually
        // exclusive because the 'tunnel' library currently lacks the
        // ability to create a proxy with keepAlive turned on.
        if (httpRequest.proxySettings) {
            var agent = getCachedAgent(isHttps, this.proxyAgents);
            if (agent) {
                return agent;
            }
            var tunnel = createProxyAgent(httpRequest.url, httpRequest.proxySettings, httpRequest.headers);
            agent = tunnel.agent;
            if (tunnel.isHttps) {
                this.proxyAgents.httpsAgent = tunnel.agent;
            }
            else {
                this.proxyAgents.httpAgent = tunnel.agent;
            }
            return agent;
        }
        else if (httpRequest.keepAlive) {
            var agent = getCachedAgent(isHttps, this.keepAliveAgents);
            if (agent) {
                return agent;
            }
            var agentOptions = {
                keepAlive: httpRequest.keepAlive
            };
            if (isHttps) {
                agent = this.keepAliveAgents.httpsAgent = new https.Agent(agentOptions);
            }
            else {
                agent = this.keepAliveAgents.httpAgent = new http.Agent(agentOptions);
            }
            return agent;
        }
        else {
            return isHttps ? https.globalAgent : http.globalAgent;
        }
    };
    // eslint-disable-next-line @azure/azure-sdk/ts-apisurface-standardized-verbs
    NodeFetchHttpClient.prototype.fetch = function (input, init) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, node_fetch(input, init)];
            });
        });
    };
    NodeFetchHttpClient.prototype.prepareRequest = function (httpRequest) {
        return __awaiter(this, void 0, void 0, function () {
            var requestInit, cookieString;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
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
                        cookieString = _a.sent();
                        httpRequest.headers.set("Cookie", cookieString);
                        _a.label = 2;
                    case 2:
                        // Set the http(s) agent
                        requestInit.agent = this.getOrCreateAgent(httpRequest);
                        requestInit.compress = httpRequest.decompressResponse;
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
                        if (!(setCookieHeader_1 !== undefined)) return [3 /*break*/, 2];
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