import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptions } from "./requestPolicy";
import { HttpOperationResponse } from "../httpOperationResponse";
import { ProxySettings } from "../serviceClient";
import { WebResourceLike } from "../webResource";
/**
 * Stores the patterns specified in NO_PROXY environment variable.
 * @internal
 */
export declare const globalNoProxyList: string[];
/**
 * @internal
 */
export declare function loadNoProxy(): string[];
/**
 * Converts a given URL of a proxy server into `ProxySettings` or attempts to retrieve `ProxySettings` from the current environment if one is not passed.
 * @param proxyUrl - URL of the proxy
 * @returns The default proxy settings, or undefined.
 */
export declare function getDefaultProxySettings(proxyUrl?: string): ProxySettings | undefined;
/**
 * A policy that allows one to apply proxy settings to all requests.
 * If not passed static settings, they will be retrieved from the HTTPS_PROXY
 * or HTTP_PROXY environment variables.
 * @param proxySettings - ProxySettings to use on each request.
 * @param options - additional settings, for example, custom NO_PROXY patterns
 */
export declare function proxyPolicy(proxySettings?: ProxySettings, options?: {
    /** a list of patterns to override those loaded from NO_PROXY environment variable. */
    customNoProxyList?: string[];
}): RequestPolicyFactory;
export declare class ProxyPolicy extends BaseRequestPolicy {
    proxySettings: ProxySettings;
    private customNoProxyList?;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptions, proxySettings: ProxySettings, customNoProxyList?: string[] | undefined);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=proxyPolicy.d.ts.map