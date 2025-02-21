import type { RequestInterface, Endpoints } from "@octokit/types";
export type DeleteTokenOAuthAppOptions = {
    clientType: "oauth-app";
    clientId: string;
    clientSecret: string;
    token: string;
    request?: RequestInterface;
};
export type DeleteTokenGitHubAppOptions = {
    clientType: "github-app";
    clientId: string;
    clientSecret: string;
    token: string;
    request?: RequestInterface;
};
export type DeleteTokenResponse = Endpoints["DELETE /applications/{client_id}/token"]["response"];
export declare function deleteToken(options: DeleteTokenOAuthAppOptions): Promise<DeleteTokenResponse>;
export declare function deleteToken(options: DeleteTokenGitHubAppOptions): Promise<DeleteTokenResponse>;
