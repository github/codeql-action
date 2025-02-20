import type { OAuthAppState, GitHubAppState, OAuthAppAuthentication, GitHubAppAuthentication, GitHubAppAuthenticationWithExpiration } from "./types.js";
export declare function getAuthentication(state: OAuthAppState): Promise<OAuthAppAuthentication>;
export declare function getAuthentication(state: GitHubAppState): Promise<GitHubAppAuthentication | GitHubAppAuthenticationWithExpiration>;
