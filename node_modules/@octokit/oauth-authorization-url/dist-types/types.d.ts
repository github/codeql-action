export type ClientType = "oauth-app" | "github-app";
export type OAuthAppOptions = {
    clientId: string;
    clientType?: "oauth-app";
    allowSignup?: boolean;
    login?: string;
    scopes?: string | string[];
    redirectUrl?: string;
    state?: string;
    baseUrl?: string;
};
export type GitHubAppOptions = {
    clientId: string;
    clientType: "github-app";
    allowSignup?: boolean;
    login?: string;
    redirectUrl?: string;
    state?: string;
    baseUrl?: string;
};
export type OAuthAppResult = {
    allowSignup: boolean;
    clientId: string;
    clientType: "oauth-app";
    login: string | null;
    redirectUrl: string | null;
    scopes: string[];
    state: string;
    url: string;
};
export type GitHubAppResult = {
    allowSignup: boolean;
    clientId: string;
    clientType: "github-app";
    login: string | null;
    redirectUrl: string | null;
    state: string;
    url: string;
};
