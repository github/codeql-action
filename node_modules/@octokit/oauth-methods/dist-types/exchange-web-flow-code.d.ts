import type { OctokitResponse, RequestInterface } from "@octokit/types";
import type { OAuthAppAuthentication, GitHubAppAuthenticationWithExpirationEnabled, GitHubAppAuthenticationWithExpirationDisabled, GitHubAppAuthenticationWithRefreshToken, OAuthAppCreateTokenResponseData, GitHubAppCreateTokenResponseData, GitHubAppCreateTokenWithExpirationResponseData } from "./types.js";
export type ExchangeWebFlowCodeOAuthAppOptions = {
    clientType: "oauth-app";
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUrl?: string;
    request?: RequestInterface;
};
export type ExchangeWebFlowCodeGitHubAppOptions = {
    clientType: "github-app";
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUrl?: string;
    request?: RequestInterface;
};
export type ExchangeWebFlowCodeOAuthAppResponse = OctokitResponse<OAuthAppCreateTokenResponseData> & {
    authentication: OAuthAppAuthentication;
};
export type ExchangeWebFlowCodeGitHubAppResponse = OctokitResponse<GitHubAppCreateTokenResponseData | GitHubAppCreateTokenWithExpirationResponseData> & {
    authentication: GitHubAppAuthenticationWithExpirationEnabled | GitHubAppAuthenticationWithExpirationDisabled | GitHubAppAuthenticationWithRefreshToken;
};
/**
 * Exchange the code from GitHub's OAuth Web flow for OAuth Apps.
 */
export declare function exchangeWebFlowCode(options: ExchangeWebFlowCodeOAuthAppOptions): Promise<ExchangeWebFlowCodeOAuthAppResponse>;
/**
 * Exchange the code from GitHub's OAuth Web flow for GitHub Apps. Note that `scopes` are not supported by GitHub Apps.
 */
export declare function exchangeWebFlowCode(options: ExchangeWebFlowCodeGitHubAppOptions): Promise<ExchangeWebFlowCodeGitHubAppResponse>;
