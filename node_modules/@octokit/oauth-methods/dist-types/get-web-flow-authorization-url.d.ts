import type { OAuthAppResult, GitHubAppResult } from "@octokit/oauth-authorization-url";
import type { RequestInterface } from "@octokit/types";
export type GetWebFlowAuthorizationUrlOAuthAppOptions = {
    clientType: "oauth-app";
    clientId: string;
    allowSignup?: boolean;
    login?: string;
    scopes?: string | string[];
    redirectUrl?: string;
    state?: string;
    request?: RequestInterface;
};
export type GetWebFlowAuthorizationUrlGitHubAppOptions = {
    clientType: "github-app";
    clientId: string;
    allowSignup?: boolean;
    login?: string;
    redirectUrl?: string;
    state?: string;
    request?: RequestInterface;
};
export type GetWebFlowAuthorizationUrlOAuthAppResult = OAuthAppResult;
export type GetWebFlowAuthorizationUrlGitHubAppResult = GitHubAppResult;
export declare function getWebFlowAuthorizationUrl(options: GetWebFlowAuthorizationUrlOAuthAppOptions): OAuthAppResult;
export declare function getWebFlowAuthorizationUrl(options: GetWebFlowAuthorizationUrlGitHubAppOptions): GitHubAppResult;
