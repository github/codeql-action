import type { OctokitResponse, RequestInterface } from "@octokit/types";
import type { GitHubAppAuthenticationWithRefreshToken, GitHubAppCreateTokenWithExpirationResponseData } from "./types.js";
export type RefreshTokenOptions = {
    clientType: "github-app";
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    request?: RequestInterface;
};
export type RefreshTokenResponse = OctokitResponse<GitHubAppCreateTokenWithExpirationResponseData> & {
    authentication: GitHubAppAuthenticationWithRefreshToken;
};
export declare function refreshToken(options: RefreshTokenOptions): Promise<RefreshTokenResponse>;
