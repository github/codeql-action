// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/*
 * NOTE: When moving this file, please update "browser" section in package.json
 */
import { BaseRequestPolicy, } from "./requestPolicy";
const DisbleResponseDecompressionNotSupportedInBrowser = new Error("DisableResponseDecompressionPolicy is not supported in browser environment");
/**
 * {@link DisableResponseDecompressionPolicy} is not supported in browser and attempting
 * to use it will results in error being thrown.
 */
export function disableResponseDecompressionPolicy() {
    return {
        create: (_nextPolicy, _options) => {
            throw DisbleResponseDecompressionNotSupportedInBrowser;
        },
    };
}
export class DisableResponseDecompressionPolicy extends BaseRequestPolicy {
    constructor(nextPolicy, options) {
        super(nextPolicy, options);
        throw DisbleResponseDecompressionNotSupportedInBrowser;
    }
    async sendRequest(_request) {
        throw DisbleResponseDecompressionNotSupportedInBrowser;
    }
}
//# sourceMappingURL=disableResponseDecompressionPolicy.browser.js.map