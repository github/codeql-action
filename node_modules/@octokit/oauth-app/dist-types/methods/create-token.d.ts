import * as OAuthAppAuth from "@octokit/auth-oauth-app";
import type { ClientType, GithubAppUserAuthenticationWithOptionalExpiration, State } from "../types.js";
export type CreateTokenWebFlowOptions = Omit<OAuthAppAuth.WebFlowAuthOptions, "type">;
export type CreateTokenOAuthAppDeviceFlowOptions = Omit<OAuthAppAuth.OAuthAppDeviceFlowAuthOptions, "type">;
export type CreateTokenGitHubAppDeviceFlowOptions = Omit<OAuthAppAuth.GitHubAppDeviceFlowAuthOptions, "type">;
export declare function createTokenWithState(state: State, options: CreateTokenWebFlowOptions | CreateTokenOAuthAppDeviceFlowOptions | CreateTokenGitHubAppDeviceFlowOptions): Promise<{
    authentication: OAuthAppAuth.OAuthAppUserAuthentication | OAuthAppAuth.GitHubAppUserAuthentication | OAuthAppAuth.GitHubAppUserAuthenticationWithExpiration;
}>;
export interface CreateTokenInterface<TClientType extends ClientType> {
    (options: CreateTokenWebFlowOptions): TClientType extends "oauth-app" ? Promise<{
        authentication: OAuthAppAuth.OAuthAppUserAuthentication;
    }> : Promise<{
        authentication: GithubAppUserAuthenticationWithOptionalExpiration;
    }>;
    (options: TClientType extends "oauth-app" ? CreateTokenOAuthAppDeviceFlowOptions : CreateTokenGitHubAppDeviceFlowOptions): TClientType extends "oauth-app" ? Promise<{
        authentication: OAuthAppAuth.OAuthAppUserAuthentication;
    }> : Promise<{
        authentication: GithubAppUserAuthenticationWithOptionalExpiration;
    }>;
}
