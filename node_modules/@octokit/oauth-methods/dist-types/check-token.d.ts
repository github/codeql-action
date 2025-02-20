import type { RequestInterface, Endpoints } from "@octokit/types";
import type { OAuthAppAuthentication, GitHubAppAuthenticationWithExpirationEnabled, GitHubAppAuthenticationWithExpirationDisabled } from "./types.js";
export type CheckTokenOAuthAppOptions = {
    clientType: "oauth-app";
    clientId: string;
    clientSecret: string;
    token: string;
    request?: RequestInterface;
};
export type CheckTokenGitHubAppOptions = {
    clientType: "github-app";
    clientId: string;
    clientSecret: string;
    token: string;
    request?: RequestInterface;
};
export type CheckTokenOAuthAppResponse = Endpoints["POST /applications/{client_id}/token"]["response"] & {
    authentication: OAuthAppAuthentication;
};
export type CheckTokenGitHubAppResponse = Endpoints["POST /applications/{client_id}/token"]["response"] & {
    authentication: GitHubAppAuthenticationWithExpirationEnabled | GitHubAppAuthenticationWithExpirationDisabled;
};
export declare function checkToken(options: CheckTokenOAuthAppOptions): Promise<CheckTokenOAuthAppResponse>;
export declare function checkToken(options: CheckTokenGitHubAppOptions): Promise<CheckTokenGitHubAppResponse>;
