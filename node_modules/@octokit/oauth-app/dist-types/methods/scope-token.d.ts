import * as OAuthMethods from "@octokit/oauth-methods";
import type { State } from "../types.js";
type StateOptions = "clientType" | "clientId" | "clientSecret" | "request";
export type ScopeTokenOptions = Omit<OAuthMethods.ScopeTokenOptions, StateOptions>;
export declare function scopeTokenWithState(state: State, options: ScopeTokenOptions): Promise<OAuthMethods.ScopeTokenResponse & {
    authentication: {
        type: "token";
        tokenType: "oauth";
    };
}>;
export interface ScopeTokenInterface {
    (options: ScopeTokenOptions): Promise<OAuthMethods.ScopeTokenResponse & {
        authentication: {
            type: "token";
            tokenType: "oauth";
        };
    }>;
}
export {};
