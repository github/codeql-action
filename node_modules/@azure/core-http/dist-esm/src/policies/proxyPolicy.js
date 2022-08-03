// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, } from "./requestPolicy";
import { Constants } from "../util/constants";
import { URLBuilder } from "../url";
import { getEnvironmentValue } from "../util/utils";
/**
 * Stores the patterns specified in NO_PROXY environment variable.
 * @internal
 */
export const globalNoProxyList = [];
let noProxyListLoaded = false;
/** A cache of whether a host should bypass the proxy. */
const globalBypassedMap = new Map();
function loadEnvironmentProxyValue() {
    if (!process) {
        return undefined;
    }
    const httpsProxy = getEnvironmentValue(Constants.HTTPS_PROXY);
    const allProxy = getEnvironmentValue(Constants.ALL_PROXY);
    const httpProxy = getEnvironmentValue(Constants.HTTP_PROXY);
    return httpsProxy || allProxy || httpProxy;
}
/**
 * Check whether the host of a given `uri` matches any pattern in the no proxy list.
 * If there's a match, any request sent to the same host shouldn't have the proxy settings set.
 * This implementation is a port of https://github.com/Azure/azure-sdk-for-net/blob/8cca811371159e527159c7eb65602477898683e2/sdk/core/Azure.Core/src/Pipeline/Internal/HttpEnvironmentProxy.cs#L210
 */
function isBypassed(uri, noProxyList, bypassedMap) {
    if (noProxyList.length === 0) {
        return false;
    }
    const host = URLBuilder.parse(uri).getHost();
    if (bypassedMap === null || bypassedMap === void 0 ? void 0 : bypassedMap.has(host)) {
        return bypassedMap.get(host);
    }
    let isBypassedFlag = false;
    for (const pattern of noProxyList) {
        if (pattern[0] === ".") {
            // This should match either domain it self or any subdomain or host
            // .foo.com will match foo.com it self or *.foo.com
            if (host.endsWith(pattern)) {
                isBypassedFlag = true;
            }
            else {
                if (host.length === pattern.length - 1 && host === pattern.slice(1)) {
                    isBypassedFlag = true;
                }
            }
        }
        else {
            if (host === pattern) {
                isBypassedFlag = true;
            }
        }
    }
    bypassedMap === null || bypassedMap === void 0 ? void 0 : bypassedMap.set(host, isBypassedFlag);
    return isBypassedFlag;
}
/**
 * @internal
 */
export function loadNoProxy() {
    const noProxy = getEnvironmentValue(Constants.NO_PROXY);
    noProxyListLoaded = true;
    if (noProxy) {
        return noProxy
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length);
    }
    return [];
}
/**
 * Converts a given URL of a proxy server into `ProxySettings` or attempts to retrieve `ProxySettings` from the current environment if one is not passed.
 * @param proxyUrl - URL of the proxy
 * @returns The default proxy settings, or undefined.
 */
export function getDefaultProxySettings(proxyUrl) {
    if (!proxyUrl) {
        proxyUrl = loadEnvironmentProxyValue();
        if (!proxyUrl) {
            return undefined;
        }
    }
    const { username, password, urlWithoutAuth } = extractAuthFromUrl(proxyUrl);
    const parsedUrl = URLBuilder.parse(urlWithoutAuth);
    const schema = parsedUrl.getScheme() ? parsedUrl.getScheme() + "://" : "";
    return {
        host: schema + parsedUrl.getHost(),
        port: Number.parseInt(parsedUrl.getPort() || "80"),
        username,
        password,
    };
}
/**
 * A policy that allows one to apply proxy settings to all requests.
 * If not passed static settings, they will be retrieved from the HTTPS_PROXY
 * or HTTP_PROXY environment variables.
 * @param proxySettings - ProxySettings to use on each request.
 * @param options - additional settings, for example, custom NO_PROXY patterns
 */
export function proxyPolicy(proxySettings, options) {
    if (!proxySettings) {
        proxySettings = getDefaultProxySettings();
    }
    if (!noProxyListLoaded) {
        globalNoProxyList.push(...loadNoProxy());
    }
    return {
        create: (nextPolicy, requestPolicyOptions) => {
            return new ProxyPolicy(nextPolicy, requestPolicyOptions, proxySettings, options === null || options === void 0 ? void 0 : options.customNoProxyList);
        },
    };
}
function extractAuthFromUrl(url) {
    const atIndex = url.indexOf("@");
    if (atIndex === -1) {
        return { urlWithoutAuth: url };
    }
    const schemeIndex = url.indexOf("://");
    const authStart = schemeIndex !== -1 ? schemeIndex + 3 : 0;
    const auth = url.substring(authStart, atIndex);
    const colonIndex = auth.indexOf(":");
    const hasPassword = colonIndex !== -1;
    const username = hasPassword ? auth.substring(0, colonIndex) : auth;
    const password = hasPassword ? auth.substring(colonIndex + 1) : undefined;
    const urlWithoutAuth = url.substring(0, authStart) + url.substring(atIndex + 1);
    return {
        username,
        password,
        urlWithoutAuth,
    };
}
export class ProxyPolicy extends BaseRequestPolicy {
    constructor(nextPolicy, options, proxySettings, customNoProxyList) {
        super(nextPolicy, options);
        this.proxySettings = proxySettings;
        this.customNoProxyList = customNoProxyList;
    }
    sendRequest(request) {
        var _a;
        if (!request.proxySettings &&
            !isBypassed(request.url, (_a = this.customNoProxyList) !== null && _a !== void 0 ? _a : globalNoProxyList, this.customNoProxyList ? undefined : globalBypassedMap)) {
            request.proxySettings = this.proxySettings;
        }
        return this._nextPolicy.sendRequest(request);
    }
}
//# sourceMappingURL=proxyPolicy.js.map