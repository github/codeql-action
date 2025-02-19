import type { RequestInterface } from "@octokit/types";
import type { OAuthAppState, GitHubAppState, OAuthAppAuthOptions, GitHubAppAuthOptions, OAuthAppAuthentication, GitHubAppAuthentication } from "./types.js";
export declare function getOAuthAccessToken(state: OAuthAppState | GitHubAppState, options: {
    request?: RequestInterface;
    auth: OAuthAppAuthOptions | GitHubAppAuthOptions;
}): Promise<OAuthAppAuthentication | GitHubAppAuthentication>;
