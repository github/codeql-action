import type { OAuthAppAuthOptions, GitHubAppAuthOptions, OAuthAppAuthentication, GitHubAppAuthentication, OAuthAppState, GitHubAppState } from "./types.js";
export declare function auth(state: OAuthAppState | GitHubAppState, authOptions: OAuthAppAuthOptions | GitHubAppAuthOptions): Promise<OAuthAppAuthentication | GitHubAppAuthentication>;
