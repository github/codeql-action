import type { EndpointOptions, RequestParameters, Route, RequestInterface, OctokitResponse } from "@octokit/types";
import type * as AuthOAuthUser from "@octokit/auth-oauth-user";
import type * as DeviceTypes from "@octokit/auth-oauth-device";
export type ClientType = "oauth-app" | "github-app";
export type OAuthAppStrategyOptions = {
    clientType?: "oauth-app";
    clientId: string;
    clientSecret: string;
    request?: RequestInterface;
};
export type GitHubAppStrategyOptions = {
    clientType: "github-app";
    clientId: string;
    clientSecret: string;
    request?: RequestInterface;
};
export type AppAuthOptions = {
    type: "oauth-app";
};
export type WebFlowAuthOptions = {
    type: "oauth-user";
    code: string;
    redirectUrl?: string;
    state?: string;
};
export type OAuthAppDeviceFlowAuthOptions = {
    type: "oauth-user";
    onVerification: DeviceTypes.OAuthAppStrategyOptions["onVerification"];
    scopes?: string[];
};
export type GitHubAppDeviceFlowAuthOptions = {
    type: "oauth-user";
    onVerification: DeviceTypes.OAuthAppStrategyOptions["onVerification"];
};
export type AppAuthentication = {
    type: "oauth-app";
    clientId: string;
    clientSecret: string;
    clientType: ClientType;
    headers: {
        authorization: string;
    };
};
export type OAuthAppUserAuthentication = AuthOAuthUser.OAuthAppAuthentication;
export type GitHubAppUserAuthentication = AuthOAuthUser.GitHubAppAuthentication;
export type GitHubAppUserAuthenticationWithExpiration = AuthOAuthUser.GitHubAppAuthenticationWithExpiration;
export type FactoryOAuthAppWebFlowOptions = OAuthAppStrategyOptions & Omit<WebFlowAuthOptions, "type"> & {
    clientType: "oauth-app";
};
export type FactoryOAuthAppDeviceFlowOptions = OAuthAppStrategyOptions & Omit<OAuthAppDeviceFlowAuthOptions, "type"> & {
    clientType: "oauth-app";
};
export type FactoryGitHubAppWebFlowOptions = GitHubAppStrategyOptions & Omit<WebFlowAuthOptions, "type">;
export type FactoryGitHubAppDeviceFlowOptions = GitHubAppStrategyOptions & Omit<GitHubAppDeviceFlowAuthOptions, "type">;
export interface FactoryOAuthAppWebFlow<T> {
    (options: FactoryOAuthAppWebFlowOptions): T;
}
export interface FactoryOAuthAppDeviceFlow<T> {
    (options: FactoryOAuthAppDeviceFlowOptions): T;
}
export interface FactoryGitHubWebFlow<T> {
    (options: FactoryGitHubAppWebFlowOptions): T;
}
export interface FactoryGitHubDeviceFlow<T> {
    (options: FactoryGitHubAppDeviceFlowOptions): T;
}
export interface OAuthAppAuthInterface {
    (options: AppAuthOptions): Promise<AppAuthentication>;
    <T = unknown>(options: WebFlowAuthOptions & {
        factory: FactoryOAuthAppWebFlow<T>;
    }): Promise<T>;
    <T = unknown>(options: OAuthAppDeviceFlowAuthOptions & {
        factory: FactoryOAuthAppDeviceFlow<T>;
    }): Promise<T>;
    (options: WebFlowAuthOptions): Promise<OAuthAppUserAuthentication>;
    (options: OAuthAppDeviceFlowAuthOptions): Promise<OAuthAppUserAuthentication>;
    hook(request: RequestInterface, route: Route | EndpointOptions, parameters?: RequestParameters): Promise<OctokitResponse<any>>;
}
export interface GitHubAuthInterface {
    (options?: AppAuthOptions): Promise<AppAuthentication>;
    <T = unknown>(options: WebFlowAuthOptions & {
        factory: FactoryGitHubWebFlow<T>;
    }): Promise<T>;
    <T = unknown>(options: GitHubAppDeviceFlowAuthOptions & {
        factory: FactoryGitHubDeviceFlow<T>;
    }): Promise<T>;
    (options?: WebFlowAuthOptions): Promise<GitHubAppUserAuthentication | GitHubAppUserAuthenticationWithExpiration>;
    (options?: GitHubAppDeviceFlowAuthOptions): Promise<GitHubAppUserAuthentication | GitHubAppUserAuthenticationWithExpiration>;
    hook(request: RequestInterface, route: Route | EndpointOptions, parameters?: RequestParameters): Promise<OctokitResponse<any>>;
}
export type OAuthAppState = OAuthAppStrategyOptions & {
    clientType: "oauth-app";
    request: RequestInterface;
};
export type GitHubAppState = GitHubAppStrategyOptions & {
    clientType: "github-app";
    request: RequestInterface;
};
