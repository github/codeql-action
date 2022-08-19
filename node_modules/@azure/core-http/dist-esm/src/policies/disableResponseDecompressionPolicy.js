// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, } from "./requestPolicy";
/**
 * Returns a request policy factory that can be used to create an instance of
 * {@link DisableResponseDecompressionPolicy}.
 */
export function disableResponseDecompressionPolicy() {
    return {
        create: (nextPolicy, options) => {
            return new DisableResponseDecompressionPolicy(nextPolicy, options);
        },
    };
}
/**
 * A policy to disable response decompression according to Accept-Encoding header
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Encoding
 */
export class DisableResponseDecompressionPolicy extends BaseRequestPolicy {
    /**
     * Creates an instance of DisableResponseDecompressionPolicy.
     *
     * @param nextPolicy -
     * @param options -
     */
    // The parent constructor is protected.
    /* eslint-disable-next-line @typescript-eslint/no-useless-constructor */
    constructor(nextPolicy, options) {
        super(nextPolicy, options);
    }
    /**
     * Sends out request.
     *
     * @param request -
     * @returns
     */
    async sendRequest(request) {
        request.decompressResponse = false;
        return this._nextPolicy.sendRequest(request);
    }
}
//# sourceMappingURL=disableResponseDecompressionPolicy.js.map