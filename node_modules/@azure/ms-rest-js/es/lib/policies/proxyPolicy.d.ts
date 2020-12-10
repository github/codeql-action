import { BaseRequestPolicy, RequestPolicy, RequestPolicyFactory, RequestPolicyOptionsLike } from "./requestPolicy";
import { HttpOperationResponse } from "../httpOperationResponse";
import { ProxySettings } from "../serviceClient";
import { WebResourceLike } from "../webResource";
export declare function getDefaultProxySettings(proxyUrl?: string): ProxySettings | undefined;
export declare function proxyPolicy(proxySettings?: ProxySettings): RequestPolicyFactory;
export declare class ProxyPolicy extends BaseRequestPolicy {
    proxySettings: ProxySettings;
    constructor(nextPolicy: RequestPolicy, options: RequestPolicyOptionsLike, proxySettings: ProxySettings);
    sendRequest(request: WebResourceLike): Promise<HttpOperationResponse>;
}
//# sourceMappingURL=proxyPolicy.d.ts.map