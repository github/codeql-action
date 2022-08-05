// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { BaseRequestPolicy, } from "./requestPolicy";
import { URLBuilder } from "../url";
/**
 * Methods that are allowed to follow redirects 301 and 302
 */
const allowedRedirect = ["GET", "HEAD"];
export const DefaultRedirectOptions = {
    handleRedirects: true,
    maxRetries: 20,
};
/**
 * Creates a redirect policy, which sends a repeats the request to a new destination if a response arrives with a "location" header, and a status code between 300 and 307.
 * @param maximumRetries - Maximum number of redirects to follow.
 * @returns An instance of the {@link RedirectPolicy}
 */
export function redirectPolicy(maximumRetries = 20) {
    return {
        create: (nextPolicy, options) => {
            return new RedirectPolicy(nextPolicy, options, maximumRetries);
        },
    };
}
/**
 * Resends the request to a new destination if a response arrives with a "location" header, and a status code between 300 and 307.
 */
export class RedirectPolicy extends BaseRequestPolicy {
    constructor(nextPolicy, options, maxRetries = 20) {
        super(nextPolicy, options);
        this.maxRetries = maxRetries;
    }
    sendRequest(request) {
        return this._nextPolicy
            .sendRequest(request)
            .then((response) => handleRedirect(this, response, 0));
    }
}
function handleRedirect(policy, response, currentRetries) {
    const { request, status } = response;
    const locationHeader = response.headers.get("location");
    if (locationHeader &&
        (status === 300 ||
            (status === 301 && allowedRedirect.includes(request.method)) ||
            (status === 302 && allowedRedirect.includes(request.method)) ||
            (status === 303 && request.method === "POST") ||
            status === 307) &&
        (!policy.maxRetries || currentRetries < policy.maxRetries)) {
        const builder = URLBuilder.parse(request.url);
        builder.setPath(locationHeader);
        request.url = builder.toString();
        // POST request with Status code 303 should be converted into a
        // redirected GET request if the redirect url is present in the location header
        if (status === 303) {
            request.method = "GET";
            delete request.body;
        }
        return policy._nextPolicy
            .sendRequest(request)
            .then((res) => handleRedirect(policy, res, currentRetries + 1));
    }
    return Promise.resolve(response);
}
//# sourceMappingURL=redirectPolicy.js.map