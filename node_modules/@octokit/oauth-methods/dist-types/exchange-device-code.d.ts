import type { OctokitResponse, RequestInterface } from "@octokit/types";
import type { OAuthAppAuthentication, GitHubAppAuthenticationWithExpirationEnabled, GitHubAppAuthenticationWithExpirationDisabled, GitHubAppAuthenticationWithRefreshToken, OAuthAppCreateTokenResponseData, GitHubAppCreateTokenResponseData, GitHubAppCreateTokenWithExpirationResponseData } from "./types.js";
export type ExchangeDeviceCodeOAuthAppOptionsWithoutClientSecret = {
    clientType: "oauth-app";
    clientId: string;
    code: string;
    redirectUrl?: string;
    state?: string;
    request?: RequestInterface;
    scopes?: string[];
};
export type ExchangeDeviceCodeOAuthAppOptions = ExchangeDeviceCodeOAuthAppOptionsWithoutClientSecret & {
    clientSecret: string;
};
export type ExchangeDeviceCodeGitHubAppOptionsWithoutClientSecret = {
    clientType: "github-app";
    clientId: string;
    code: string;
    redirectUrl?: string;
    state?: string;
    request?: RequestInterface;
};
export type ExchangeDeviceCodeGitHubAppOptions = ExchangeDeviceCodeGitHubAppOptionsWithoutClientSecret & {
    clientSecret: string;
};
type OAuthAppAuthenticationWithoutClientSecret = Omit<OAuthAppAuthentication, "clientSecret">;
type GitHubAppAuthenticationWithoutClientSecret = Omit<GitHubAppAuthenticationWithExpirationEnabled | GitHubAppAuthenticationWithExpirationDisabled, "clientSecret">;
type GitHubAppAuthenticationWithExpirationWithoutClientSecret = Omit<GitHubAppAuthenticationWithRefreshToken, "clientSecret">;
export type ExchangeDeviceCodeOAuthAppResponse = OctokitResponse<OAuthAppCreateTokenResponseData> & {
    authentication: OAuthAppAuthentication;
};
export type ExchangeDeviceCodeOAuthAppResponseWithoutClientSecret = OctokitResponse<OAuthAppCreateTokenResponseData> & {
    authentication: OAuthAppAuthenticationWithoutClientSecret;
};
export type ExchangeDeviceCodeGitHubAppResponse = OctokitResponse<GitHubAppCreateTokenResponseData | GitHubAppCreateTokenWithExpirationResponseData> & {
    authentication: GitHubAppAuthenticationWithExpirationEnabled | GitHubAppAuthenticationWithExpirationDisabled | GitHubAppAuthenticationWithRefreshToken;
};
export type ExchangeDeviceCodeGitHubAppResponseWithoutClientSecret = OctokitResponse<GitHubAppCreateTokenResponseData | GitHubAppCreateTokenWithExpirationResponseData> & {
    authentication: GitHubAppAuthenticationWithoutClientSecret | GitHubAppAuthenticationWithExpirationWithoutClientSecret;
};
/**
 * Exchange the code from GitHub's OAuth Web flow for OAuth Apps.
 */
export declare function exchangeDeviceCode(options: ExchangeDeviceCodeOAuthAppOptions): Promise<ExchangeDeviceCodeOAuthAppResponse>;
/**
 * Exchange the code from GitHub's OAuth Web flow for OAuth Apps without clientSecret
 */
export declare function exchangeDeviceCode(options: ExchangeDeviceCodeOAuthAppOptionsWithoutClientSecret): Promise<ExchangeDeviceCodeOAuthAppResponseWithoutClientSecret>;
/**
 * Exchange the code from GitHub's OAuth Web flow for GitHub Apps. `scopes` are not supported by GitHub Apps.
 */
export declare function exchangeDeviceCode(options: ExchangeDeviceCodeGitHubAppOptions): Promise<ExchangeDeviceCodeGitHubAppResponse>;
/**
 * Exchange the code from GitHub's OAuth Web flow for GitHub Apps without using `clientSecret`. `scopes` are not supported by GitHub Apps.
 */
export declare function exchangeDeviceCode(options: ExchangeDeviceCodeGitHubAppOptionsWithoutClientSecret): Promise<ExchangeDeviceCodeGitHubAppResponseWithoutClientSecret>;
export {};
