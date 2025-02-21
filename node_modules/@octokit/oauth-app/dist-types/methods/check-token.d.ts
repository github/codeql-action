import * as OAuthMethods from "@octokit/oauth-methods";
import type { ClientType, State } from "../types.js";
export type CheckTokenOptions = {
    token: string;
};
export declare function checkTokenWithState(state: State, options: CheckTokenOptions): Promise<any>;
export interface CheckTokenInterface<TClientType extends ClientType> {
    (options: CheckTokenOptions): (TClientType extends "oauth-app" ? Promise<OAuthMethods.CheckTokenOAuthAppResponse> : Promise<OAuthMethods.CheckTokenGitHubAppResponse>) & {
        authentication: {
            type: "token";
            tokenType: "oauth";
        };
    };
}
