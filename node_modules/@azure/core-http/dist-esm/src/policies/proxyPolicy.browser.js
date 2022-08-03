// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, } from "./requestPolicy";
const proxyNotSupportedInBrowser = new Error("ProxyPolicy is not supported in browser environment");
export function getDefaultProxySettings(_proxyUrl) {
    return undefined;
}
export function proxyPolicy(_proxySettings) {
    return {
        create: (_nextPolicy, _options) => {
            throw proxyNotSupportedInBrowser;
        },
    };
}
export class ProxyPolicy extends BaseRequestPolicy {
    constructor(nextPolicy, options) {
        super(nextPolicy, options);
        throw proxyNotSupportedInBrowser;
    }
    sendRequest(_request) {
        throw proxyNotSupportedInBrowser;
    }
}
//# sourceMappingURL=proxyPolicy.browser.js.map