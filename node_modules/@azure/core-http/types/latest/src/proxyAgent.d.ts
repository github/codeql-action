/// <reference types="node" />
/// <reference types="node" />
import * as http from "http";
import * as https from "https";
import * as tunnel from "tunnel";
import { HttpHeadersLike } from "./httpHeaders";
import { ProxySettings } from "./serviceClient";
export declare type ProxyAgent = {
    isHttps: boolean;
    agent: http.Agent | https.Agent;
};
export declare function createProxyAgent(requestUrl: string, proxySettings: ProxySettings, headers?: HttpHeadersLike): ProxyAgent;
export declare function isUrlHttps(url: string): boolean;
export declare function createTunnel(isRequestHttps: boolean, isProxyHttps: boolean, tunnelOptions: tunnel.HttpsOverHttpsOptions): http.Agent | https.Agent;
//# sourceMappingURL=proxyAgent.d.ts.map