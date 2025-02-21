import * as OAuthMethods from "@octokit/oauth-methods";
import type { State } from "../types.js";
export type RefreshTokenOptions = {
    refreshToken: string;
};
export declare function refreshTokenWithState(state: State, options: RefreshTokenOptions): Promise<OAuthMethods.RefreshTokenResponse & {
    authentication: {
        type: "token";
        tokenType: "oauth";
    };
}>;
export interface RefreshTokenInterface {
    (options: RefreshTokenOptions): Promise<OAuthMethods.RefreshTokenResponse & {
        authentication: {
            type: "token";
            tokenType: "oauth";
        };
    }>;
}
