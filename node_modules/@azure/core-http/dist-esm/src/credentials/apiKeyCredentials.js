// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { HttpHeaders } from "../httpHeaders";
/**
 * Authenticates to a service using an API key.
 */
export class ApiKeyCredentials {
    /**
     * @param options - Specifies the options to be provided for auth. Either header or query needs to be provided.
     */
    constructor(options) {
        if (!options || (options && !options.inHeader && !options.inQuery)) {
            throw new Error(`options cannot be null or undefined. Either "inHeader" or "inQuery" property of the options object needs to be provided.`);
        }
        this.inHeader = options.inHeader;
        this.inQuery = options.inQuery;
    }
    /**
     * Signs a request with the values provided in the inHeader and inQuery parameter.
     *
     * @param webResource - The WebResourceLike to be signed.
     * @returns The signed request object.
     */
    signRequest(webResource) {
        if (!webResource) {
            return Promise.reject(new Error(`webResource cannot be null or undefined and must be of type "object".`));
        }
        if (this.inHeader) {
            if (!webResource.headers) {
                webResource.headers = new HttpHeaders();
            }
            for (const headerName in this.inHeader) {
                webResource.headers.set(headerName, this.inHeader[headerName]);
            }
        }
        if (this.inQuery) {
            if (!webResource.url) {
                return Promise.reject(new Error(`url cannot be null in the request object.`));
            }
            if (webResource.url.indexOf("?") < 0) {
                webResource.url += "?";
            }
            for (const key in this.inQuery) {
                if (!webResource.url.endsWith("?")) {
                    webResource.url += "&";
                }
                webResource.url += `${key}=${this.inQuery[key]}`;
            }
        }
        return Promise.resolve(webResource);
    }
}
//# sourceMappingURL=apiKeyCredentials.js.map