// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, } from "./requestPolicy";
/**
 * Creates a policy that assigns a unique request id to outgoing requests.
 * @param requestIdHeaderName - The name of the header to use when assigning the unique id to the request.
 */
export function generateClientRequestIdPolicy(requestIdHeaderName = "x-ms-client-request-id") {
    return {
        create: (nextPolicy, options) => {
            return new GenerateClientRequestIdPolicy(nextPolicy, options, requestIdHeaderName);
        },
    };
}
export class GenerateClientRequestIdPolicy extends BaseRequestPolicy {
    constructor(nextPolicy, options, _requestIdHeaderName) {
        super(nextPolicy, options);
        this._requestIdHeaderName = _requestIdHeaderName;
    }
    sendRequest(request) {
        if (!request.headers.contains(this._requestIdHeaderName)) {
            request.headers.set(this._requestIdHeaderName, request.requestId);
        }
        return this._nextPolicy.sendRequest(request);
    }
}
//# sourceMappingURL=generateClientRequestIdPolicy.js.map