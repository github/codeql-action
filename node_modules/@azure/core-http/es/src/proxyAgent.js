// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as tunnel from "tunnel";
import { URLBuilder } from "./url";
export function createProxyAgent(requestUrl, proxySettings, headers) {
    var host = URLBuilder.parse(proxySettings.host).getHost();
    if (!host) {
        throw new Error("Expecting a non-empty host in proxy settings.");
    }
    if (!isValidPort(proxySettings.port)) {
        throw new Error("Expecting a valid port number in the range of [0, 65535] in proxy settings.");
    }
    var tunnelOptions = {
        proxy: {
            host: host,
            port: proxySettings.port,
            headers: (headers && headers.rawHeaders()) || {}
        }
    };
    if (proxySettings.username && proxySettings.password) {
        tunnelOptions.proxy.proxyAuth = proxySettings.username + ":" + proxySettings.password;
    }
    var isRequestHttps = isUrlHttps(requestUrl);
    var isProxyHttps = isUrlHttps(proxySettings.host);
    var proxyAgent = {
        isHttps: isRequestHttps,
        agent: createTunnel(isRequestHttps, isProxyHttps, tunnelOptions)
    };
    return proxyAgent;
}
export function isUrlHttps(url) {
    var urlScheme = URLBuilder.parse(url).getScheme() || "";
    return urlScheme.toLowerCase() === "https";
}
export function createTunnel(isRequestHttps, isProxyHttps, tunnelOptions) {
    if (isRequestHttps && isProxyHttps) {
        return tunnel.httpsOverHttps(tunnelOptions);
    }
    else if (isRequestHttps && !isProxyHttps) {
        return tunnel.httpsOverHttp(tunnelOptions);
    }
    else if (!isRequestHttps && isProxyHttps) {
        return tunnel.httpOverHttps(tunnelOptions);
    }
    else {
        return tunnel.httpOverHttp(tunnelOptions);
    }
}
function isValidPort(port) {
    // any port in 0-65535 range is valid (RFC 793) even though almost all implementations
    // will reserve 0 for a specific purpose, and a range of numbers for ephemeral ports
    return 0 <= port && port <= 65535;
}
//# sourceMappingURL=proxyAgent.js.map