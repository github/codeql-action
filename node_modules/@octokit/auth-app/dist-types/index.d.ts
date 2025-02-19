import type { AuthInterface, StrategyOptions } from "./types.js";
export { createOAuthUserAuth } from "@octokit/auth-oauth-user";
export type { StrategyOptions, AppAuthOptions, OAuthAppAuthOptions, InstallationAuthOptions, OAuthWebFlowAuthOptions, OAuthDeviceFlowAuthOptions, Authentication, AppAuthentication, OAuthAppAuthentication, InstallationAccessTokenAuthentication, GitHubAppUserAuthentication, GitHubAppUserAuthenticationWithExpiration, } from "./types.js";
export declare function createAppAuth(options: StrategyOptions): AuthInterface;
