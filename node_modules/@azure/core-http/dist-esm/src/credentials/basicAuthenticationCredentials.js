// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import * as base64 from "../util/base64";
import { Constants } from "../util/constants";
import { HttpHeaders } from "../httpHeaders";
const HeaderConstants = Constants.HeaderConstants;
const DEFAULT_AUTHORIZATION_SCHEME = "Basic";
/**
 * A simple {@link ServiceClientCredential} that authenticates with a username and a password.
 */
export class BasicAuthenticationCredentials {
    /**
     * Creates a new BasicAuthenticationCredentials object.
     *
     * @param userName - User name.
     * @param password - Password.
     * @param authorizationScheme - The authorization scheme.
     */
    constructor(userName, password, authorizationScheme = DEFAULT_AUTHORIZATION_SCHEME) {
        /**
         * Authorization scheme. Defaults to "Basic".
         * More information about authorization schemes is available here: https://developer.mozilla.org/docs/Web/HTTP/Authentication#authentication_schemes
         */
        this.authorizationScheme = DEFAULT_AUTHORIZATION_SCHEME;
        if (userName === null || userName === undefined || typeof userName.valueOf() !== "string") {
            throw new Error("userName cannot be null or undefined and must be of type string.");
        }
        if (password === null || password === undefined || typeof password.valueOf() !== "string") {
            throw new Error("password cannot be null or undefined and must be of type string.");
        }
        this.userName = userName;
        this.password = password;
        this.authorizationScheme = authorizationScheme;
    }
    /**
     * Signs a request with the Authentication header.
     *
     * @param webResource - The WebResourceLike to be signed.
     * @returns The signed request object.
     */
    signRequest(webResource) {
        const credentials = `${this.userName}:${this.password}`;
        const encodedCredentials = `${this.authorizationScheme} ${base64.encodeString(credentials)}`;
        if (!webResource.headers)
            webResource.headers = new HttpHeaders();
        webResource.headers.set(HeaderConstants.AUTHORIZATION, encodedCredentials);
        return Promise.resolve(webResource);
    }
}
//# sourceMappingURL=basicAuthenticationCredentials.js.map