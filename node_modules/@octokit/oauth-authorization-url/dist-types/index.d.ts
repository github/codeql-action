import type { OAuthAppOptions, GitHubAppOptions, OAuthAppResult, GitHubAppResult } from "./types.js";
export type { ClientType, OAuthAppOptions, GitHubAppOptions, OAuthAppResult, GitHubAppResult, } from "./types.js";
export declare function oauthAuthorizationUrl(options: OAuthAppOptions): OAuthAppResult;
export declare function oauthAuthorizationUrl(options: GitHubAppOptions): GitHubAppResult;
