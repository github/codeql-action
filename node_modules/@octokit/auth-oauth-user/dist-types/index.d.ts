import type { OAuthAppStrategyOptions, GitHubAppStrategyOptions, OAuthAppAuthInterface, GitHubAppAuthInterface } from "./types.js";
export type { OAuthAppStrategyOptionsWebFlow, GitHubAppStrategyOptionsWebFlow, OAuthAppStrategyOptionsDeviceFlow, GitHubAppStrategyOptionsDeviceFlow, OAuthAppStrategyOptionsExistingAuthentication, GitHubAppStrategyOptionsExistingAuthentication, GitHubAppStrategyOptionsExistingAuthenticationWithExpiration, OAuthAppStrategyOptions, GitHubAppStrategyOptions, OAuthAppAuthOptions, GitHubAppAuthOptions, OAuthAppAuthentication, GitHubAppAuthentication, GitHubAppAuthenticationWithExpiration, } from "./types.js";
export { requiresBasicAuth } from "./requires-basic-auth.js";
export declare function createOAuthUserAuth(options: OAuthAppStrategyOptions): OAuthAppAuthInterface;
export declare function createOAuthUserAuth(options: GitHubAppStrategyOptions): GitHubAppAuthInterface;
export declare namespace createOAuthUserAuth {
    var VERSION: string;
}
