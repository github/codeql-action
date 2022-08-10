// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
// BaseRequestPolicy has a protected constructor.
/* eslint-disable @typescript-eslint/no-useless-constructor */
import { BaseRequestPolicy, } from "./requestPolicy";
export function ndJsonPolicy() {
    return {
        create: (nextPolicy, options) => {
            return new NdJsonPolicy(nextPolicy, options);
        },
    };
}
/**
 * NdJsonPolicy that formats a JSON array as newline-delimited JSON
 */
class NdJsonPolicy extends BaseRequestPolicy {
    /**
     * Creates an instance of KeepAlivePolicy.
     */
    constructor(nextPolicy, options) {
        super(nextPolicy, options);
    }
    /**
     * Sends a request.
     */
    async sendRequest(request) {
        // There currently isn't a good way to bypass the serializer
        if (typeof request.body === "string" && request.body.startsWith("[")) {
            const body = JSON.parse(request.body);
            if (Array.isArray(body)) {
                request.body = body.map((item) => JSON.stringify(item) + "\n").join("");
            }
        }
        return this._nextPolicy.sendRequest(request);
    }
}
//# sourceMappingURL=ndJsonPolicy.js.map