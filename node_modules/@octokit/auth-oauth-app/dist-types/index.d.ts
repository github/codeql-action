import type { OAuthAppStrategyOptions, GitHubAppStrategyOptions, OAuthAppAuthInterface, GitHubAuthInterface } from "./types.js";
export type { OAuthAppStrategyOptions, GitHubAppStrategyOptions, AppAuthOptions, WebFlowAuthOptions, OAuthAppDeviceFlowAuthOptions, GitHubAppDeviceFlowAuthOptions, OAuthAppAuthInterface, GitHubAuthInterface, AppAuthentication, OAuthAppUserAuthentication, GitHubAppUserAuthentication, GitHubAppUserAuthenticationWithExpiration, FactoryGitHubWebFlow, FactoryGitHubDeviceFlow, } from "./types.js";
export { createOAuthUserAuth } from "@octokit/auth-oauth-user";
export declare function createOAuthAppAuth(options: OAuthAppStrategyOptions): OAuthAppAuthInterface;
export declare function createOAuthAppAuth(options: GitHubAppStrategyOptions): GitHubAuthInterface;
