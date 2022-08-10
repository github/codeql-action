import { ServiceClientCredentials } from "./serviceClientCredentials";
import { WebResourceLike } from "../webResource";
/**
 * A simple {@link ServiceClientCredential} that authenticates with a username and a password.
 */
export declare class BasicAuthenticationCredentials implements ServiceClientCredentials {
    /**
     * Username
     */
    userName: string;
    /**
     * Password
     */
    password: string;
    /**
     * Authorization scheme. Defaults to "Basic".
     * More information about authorization schemes is available here: https://developer.mozilla.org/docs/Web/HTTP/Authentication#authentication_schemes
     */
    authorizationScheme: string;
    /**
     * Creates a new BasicAuthenticationCredentials object.
     *
     * @param userName - User name.
     * @param password - Password.
     * @param authorizationScheme - The authorization scheme.
     */
    constructor(userName: string, password: string, authorizationScheme?: string);
    /**
     * Signs a request with the Authentication header.
     *
     * @param webResource - The WebResourceLike to be signed.
     * @returns The signed request object.
     */
    signRequest(webResource: WebResourceLike): Promise<WebResourceLike>;
}
//# sourceMappingURL=basicAuthenticationCredentials.d.ts.map
