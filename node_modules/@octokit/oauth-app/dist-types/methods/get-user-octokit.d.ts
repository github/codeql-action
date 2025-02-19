import type { OAuthAppStrategyOptionsWebFlow, OAuthAppStrategyOptionsDeviceFlow, OAuthAppStrategyOptionsExistingAuthentication, GitHubAppStrategyOptionsWebFlow, GitHubAppStrategyOptionsDeviceFlow, GitHubAppStrategyOptionsExistingAuthentication, GitHubAppStrategyOptionsExistingAuthenticationWithExpiration } from "@octokit/auth-oauth-user";
import type { State, OctokitInstance, ClientType } from "../types.js";
type StateOptions = "clientType" | "clientId" | "clientSecret" | "request";
export type GetUserOctokitOAuthAppOptions = Omit<OAuthAppStrategyOptionsWebFlow, StateOptions> | Omit<OAuthAppStrategyOptionsDeviceFlow, StateOptions> | Omit<OAuthAppStrategyOptionsExistingAuthentication, StateOptions>;
export type GetUserOctokitGitHubAppOptions = Omit<GitHubAppStrategyOptionsWebFlow, StateOptions> | Omit<GitHubAppStrategyOptionsDeviceFlow, StateOptions> | Omit<GitHubAppStrategyOptionsExistingAuthentication, StateOptions> | Omit<GitHubAppStrategyOptionsExistingAuthenticationWithExpiration, StateOptions>;
export declare function getUserOctokitWithState(state: State, options: GetUserOctokitOAuthAppOptions | GetUserOctokitGitHubAppOptions): Promise<import("@octokit/core").Octokit>;
export interface GetUserOctokitWithStateInterface<TClientType extends ClientType> {
    (options: TClientType extends "oauth-app" ? GetUserOctokitOAuthAppOptions : GetUserOctokitGitHubAppOptions): Promise<OctokitInstance>;
}
export {};
