// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * Helps the core-http token authentication policies with requesting a new token if we're not currently waiting for a new token.
 *
 * @deprecated No longer used in the bearer authorization policy.
 */
export class AccessTokenRefresher {
    constructor(credential, scopes, requiredMillisecondsBeforeNewRefresh = 30000) {
        this.credential = credential;
        this.scopes = scopes;
        this.requiredMillisecondsBeforeNewRefresh = requiredMillisecondsBeforeNewRefresh;
        this.lastCalled = 0;
    }
    /**
     * Returns true if the required milliseconds(defaulted to 30000) have been passed signifying
     * that we are ready for a new refresh.
     */
    isReady() {
        // We're only ready for a new refresh if the required milliseconds have passed.
        return (!this.lastCalled || Date.now() - this.lastCalled > this.requiredMillisecondsBeforeNewRefresh);
    }
    /**
     * Stores the time in which it is called,
     * then requests a new token,
     * then sets this.promise to undefined,
     * then returns the token.
     */
    async getToken(options) {
        this.lastCalled = Date.now();
        const token = await this.credential.getToken(this.scopes, options);
        this.promise = undefined;
        return token || undefined;
    }
    /**
     * Requests a new token if we're not currently waiting for a new token.
     * Returns null if the required time between each call hasn't been reached.
     */
    refresh(options) {
        if (!this.promise) {
            this.promise = this.getToken(options);
        }
        return this.promise;
    }
}
//# sourceMappingURL=accessTokenRefresher.js.map