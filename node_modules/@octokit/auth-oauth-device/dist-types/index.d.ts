import type { GitHubAppAuthInterface, GitHubAppStrategyOptions, OAuthAppAuthInterface, OAuthAppStrategyOptions } from "./types.js";
export type { OAuthAppStrategyOptions, OAuthAppAuthOptions, OAuthAppAuthentication, GitHubAppStrategyOptions, GitHubAppAuthOptions, GitHubAppAuthentication, GitHubAppAuthenticationWithExpiration, } from "./types.js";
export declare function createOAuthDeviceAuth(options: OAuthAppStrategyOptions): OAuthAppAuthInterface;
export declare function createOAuthDeviceAuth(options: GitHubAppStrategyOptions): GitHubAppAuthInterface;
