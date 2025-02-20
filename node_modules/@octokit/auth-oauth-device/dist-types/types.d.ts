import type { RequestInterface, Route, EndpointOptions, RequestParameters, OctokitResponse } from "@octokit/types";
import type * as OAuthMethodsTypes from "@octokit/oauth-methods";
export type ClientType = "oauth-app" | "github-app";
export type OAuthAppStrategyOptions = {
    clientId: string;
    clientType?: "oauth-app";
    onVerification: OnVerificationCallback;
    scopes?: string[];
    request?: RequestInterface;
};
export type GitHubAppStrategyOptions = {
    clientId: string;
    clientType: "github-app";
    onVerification: OnVerificationCallback;
    request?: RequestInterface;
};
export interface OAuthAppAuthInterface {
    (options: OAuthAppAuthOptions): Promise<OAuthAppAuthentication>;
    hook(request: RequestInterface, route: Route | EndpointOptions, parameters?: RequestParameters): Promise<OctokitResponse<any>>;
}
export interface GitHubAppAuthInterface {
    (options: GitHubAppAuthOptions): Promise<GitHubAppAuthentication | GitHubAppAuthenticationWithExpiration>;
    hook(request: RequestInterface, route: Route | EndpointOptions, parameters?: RequestParameters): Promise<OctokitResponse<any>>;
}
export type OAuthAppAuthOptions = {
    type: "oauth";
    scopes?: string[];
    refresh?: boolean;
};
export type GitHubAppAuthOptions = {
    type: "oauth";
    refresh?: boolean;
};
export type OAuthAppAuthentication = {
    type: "token";
    tokenType: "oauth";
} & Omit<OAuthMethodsTypes.OAuthAppAuthentication, "clientSecret">;
export type GitHubAppAuthentication = {
    type: "token";
    tokenType: "oauth";
} & Omit<OAuthMethodsTypes.GitHubAppAuthenticationWithExpirationDisabled, "clientSecret">;
export type GitHubAppAuthenticationWithExpiration = {
    type: "token";
    tokenType: "oauth";
} & Omit<OAuthMethodsTypes.GitHubAppAuthenticationWithRefreshToken, "clientSecret">;
export type Verification = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
};
export type OnVerificationCallback = (verification: Verification) => any | Promise<any>;
export type OAuthAppState = {
    clientId: string;
    clientType: "oauth-app";
    onVerification: OnVerificationCallback;
    scopes: string[];
    request: RequestInterface;
    authentication?: OAuthAppAuthentication;
};
export type GitHubAppState = {
    clientId: string;
    clientType: "github-app";
    onVerification: OnVerificationCallback;
    request: RequestInterface;
    authentication?: GitHubAppAuthentication | GitHubAppAuthenticationWithExpiration;
};
