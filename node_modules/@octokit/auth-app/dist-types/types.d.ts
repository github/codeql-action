import type * as OctokitTypes from "@octokit/types";
import type { Lru } from "toad-cache";
import type * as OAuthAppAuth from "@octokit/auth-oauth-app";
type OAuthStrategyOptions = {
    clientId?: string;
    clientSecret?: string;
};
type CommonStrategyOptions = {
    appId: number | string;
    privateKey: string;
    installationId?: number | string;
    request?: OctokitTypes.RequestInterface;
    cache?: Cache;
    log?: {
        warn: (message: string, additionalInfo?: object) => any;
        [key: string]: any;
    };
};
export type StrategyOptions = OAuthStrategyOptions & CommonStrategyOptions & Record<string, unknown>;
export type AppAuthOptions = {
    type: "app";
};
/**
Users SHOULD only enter repositoryIds || repositoryNames.
However, this module still passes both to the backend API to
let the API decide how to handle the logic. We just throw the
response back to the client making the request.
**/
export type InstallationAuthOptions = {
    type: "installation";
    installationId?: number | string;
    repositoryIds?: number[];
    repositoryNames?: string[];
    permissions?: Permissions;
    refresh?: boolean;
    factory?: never;
    [key: string]: unknown;
};
export type InstallationAuthOptionsWithFactory<T> = {
    type: "installation";
    installationId?: number | string;
    repositoryIds?: number[];
    repositoryNames?: string[];
    permissions?: Permissions;
    refresh?: boolean;
    factory: FactoryInstallation<T>;
    [key: string]: unknown;
};
export type OAuthAppAuthOptions = OAuthAppAuth.AppAuthOptions;
export type OAuthWebFlowAuthOptions = OAuthAppAuth.WebFlowAuthOptions;
export type OAuthDeviceFlowAuthOptions = OAuthAppAuth.GitHubAppDeviceFlowAuthOptions;
export type Authentication = AppAuthentication | OAuthAppAuthentication | InstallationAccessTokenAuthentication | GitHubAppUserAuthentication | GitHubAppUserAuthenticationWithExpiration;
export type FactoryInstallationOptions = StrategyOptions & Omit<InstallationAuthOptions, "type">;
export interface FactoryInstallation<T> {
    (options: FactoryInstallationOptions): T;
}
export interface AuthInterface {
    (options: AppAuthOptions): Promise<AppAuthentication>;
    (options: OAuthAppAuthOptions): Promise<OAuthAppAuthentication>;
    (options: InstallationAuthOptions): Promise<InstallationAccessTokenAuthentication>;
    <T = unknown>(options: InstallationAuthOptionsWithFactory<T>): Promise<T>;
    (options: OAuthWebFlowAuthOptions): Promise<GitHubAppUserAuthentication | GitHubAppUserAuthenticationWithExpiration>;
    (options: OAuthDeviceFlowAuthOptions): Promise<GitHubAppUserAuthentication | GitHubAppUserAuthenticationWithExpiration>;
    <T = unknown>(options: OAuthWebFlowAuthOptions & {
        factory: OAuthAppAuth.FactoryGitHubWebFlow<T>;
    }): Promise<T>;
    <T = unknown>(options: OAuthDeviceFlowAuthOptions & {
        factory: OAuthAppAuth.FactoryGitHubDeviceFlow<T>;
    }): Promise<T>;
    hook(request: RequestInterface, route: Route | EndpointOptions, parameters?: RequestParameters): Promise<OctokitTypes.OctokitResponse<any>>;
}
export type AnyResponse = OctokitTypes.OctokitResponse<any>;
export type EndpointDefaults = OctokitTypes.EndpointDefaults;
export type EndpointOptions = OctokitTypes.EndpointOptions;
export type RequestParameters = OctokitTypes.RequestParameters;
export type Route = OctokitTypes.Route;
export type RequestInterface = OctokitTypes.RequestInterface;
export type Cache = Lru<string> | {
    get: (key: string) => string | Promise<string>;
    set: (key: string, value: string) => any;
};
export type APP_TYPE = "app";
export type TOKEN_TYPE = "token";
export type INSTALLATION_TOKEN_TYPE = "installation";
export type OAUTH_TOKEN_TYPE = "oauth";
export type REPOSITORY_SELECTION = "all" | "selected";
export type JWT = string;
export type ACCESS_TOKEN = string;
export type UTC_TIMESTAMP = string;
export type AppAuthentication = {
    type: APP_TYPE;
    token: JWT;
    appId: number | string;
    expiresAt: string;
};
export type InstallationAccessTokenData = {
    token: ACCESS_TOKEN;
    createdAt: UTC_TIMESTAMP;
    expiresAt: UTC_TIMESTAMP;
    permissions: Permissions;
    repositorySelection: REPOSITORY_SELECTION;
    repositoryIds?: number[] | undefined;
    repositoryNames?: string[] | undefined;
    singleFileName?: string | undefined;
};
export type CacheData = InstallationAccessTokenData;
export type InstallationAccessTokenAuthentication = InstallationAccessTokenData & {
    type: TOKEN_TYPE;
    tokenType: INSTALLATION_TOKEN_TYPE;
    installationId: number;
};
export type OAuthAppAuthentication = OAuthAppAuth.AppAuthentication;
export type GitHubAppUserAuthentication = OAuthAppAuth.GitHubAppUserAuthentication;
export type GitHubAppUserAuthenticationWithExpiration = OAuthAppAuth.GitHubAppUserAuthenticationWithExpiration;
export type FactoryOptions = Required<Omit<StrategyOptions, keyof State>> & State;
export type Permissions = Record<string, string>;
export type WithInstallationId = {
    installationId: number;
};
export type State = Required<Omit<CommonStrategyOptions, "installationId">> & {
    installationId?: number;
} & OAuthStrategyOptions & {
    oauthApp: OAuthAppAuth.GitHubAuthInterface;
};
export {};
