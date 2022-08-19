// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, } from "./requestPolicy";
/**
 * Creates a policy that signs outgoing requests by calling to the provided `authenticationProvider`'s `signRequest` method.
 * @param authenticationProvider - The authentication provider.
 * @returns An instance of the {@link SigningPolicy}.
 */
export function signingPolicy(authenticationProvider) {
    return {
        create: (nextPolicy, options) => {
            return new SigningPolicy(nextPolicy, options, authenticationProvider);
        },
    };
}
/**
 * A policy that signs outgoing requests by calling to the provided `authenticationProvider`'s `signRequest` method.
 */
export class SigningPolicy extends BaseRequestPolicy {
    constructor(nextPolicy, options, authenticationProvider) {
        super(nextPolicy, options);
        this.authenticationProvider = authenticationProvider;
    }
    signRequest(request) {
        return this.authenticationProvider.signRequest(request);
    }
    sendRequest(request) {
        return this.signRequest(request).then((nextRequest) => this._nextPolicy.sendRequest(nextRequest));
    }
}
//# sourceMappingURL=signingPolicy.js.map