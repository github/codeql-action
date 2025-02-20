import { App as DefaultApp } from "@octokit/app";
import { OAuthApp as DefaultOAuthApp } from "@octokit/oauth-app";
export declare const App: (new (...args: any[]) => {
    octokit: import("@octokit/core").Octokit & {
        paginate: import("@octokit/plugin-paginate-rest").PaginateInterface;
    } & import("@octokit/plugin-paginate-graphql").paginateGraphQLInterface & import("@octokit/plugin-rest-endpoint-methods").Api & {
        retry: {
            retryRequest: (error: import("@octokit/request-error").RequestError, retries: number, retryAfter: number) => import("@octokit/request-error").RequestError;
        };
    };
    webhooks: import("@octokit/webhooks").Webhooks<{
        octokit: import("@octokit/core").Octokit & {
            paginate: import("@octokit/plugin-paginate-rest").PaginateInterface;
        } & import("@octokit/plugin-paginate-graphql").paginateGraphQLInterface & import("@octokit/plugin-rest-endpoint-methods").Api & {
            retry: {
                retryRequest: (error: import("@octokit/request-error").RequestError, retries: number, retryAfter: number) => import("@octokit/request-error").RequestError;
            };
        };
    }>;
    oauth: DefaultOAuthApp<{
        clientType: "github-app";
        Octokit: typeof import("@octokit/core").Octokit & import("@octokit/core/types").Constructor<{
            paginate: import("@octokit/plugin-paginate-rest").PaginateInterface;
        } & import("@octokit/plugin-paginate-graphql").paginateGraphQLInterface & import("@octokit/plugin-rest-endpoint-methods").Api & {
            retry: {
                retryRequest: (error: import("@octokit/request-error").RequestError, retries: number, retryAfter: number) => import("@octokit/request-error").RequestError;
            };
        }>;
    }>;
    getInstallationOctokit: import("@octokit/app").GetInstallationOctokitInterface<import("@octokit/core").Octokit & {
        paginate: import("@octokit/plugin-paginate-rest").PaginateInterface;
    } & import("@octokit/plugin-paginate-graphql").paginateGraphQLInterface & import("@octokit/plugin-rest-endpoint-methods").Api & {
        retry: {
            retryRequest: (error: import("@octokit/request-error").RequestError, retries: number, retryAfter: number) => import("@octokit/request-error").RequestError;
        };
    }>;
    eachInstallation: import("@octokit/app").EachInstallationInterface<import("@octokit/core").Octokit & {
        paginate: import("@octokit/plugin-paginate-rest").PaginateInterface;
    } & import("@octokit/plugin-paginate-graphql").paginateGraphQLInterface & import("@octokit/plugin-rest-endpoint-methods").Api & {
        retry: {
            retryRequest: (error: import("@octokit/request-error").RequestError, retries: number, retryAfter: number) => import("@octokit/request-error").RequestError;
        };
    }>;
    eachRepository: import("@octokit/app").EachRepositoryInterface<import("@octokit/core").Octokit & {
        paginate: import("@octokit/plugin-paginate-rest").PaginateInterface;
    } & import("@octokit/plugin-paginate-graphql").paginateGraphQLInterface & import("@octokit/plugin-rest-endpoint-methods").Api & {
        retry: {
            retryRequest: (error: import("@octokit/request-error").RequestError, retries: number, retryAfter: number) => import("@octokit/request-error").RequestError;
        };
    }>;
    getInstallationUrl: import("@octokit/app").GetInstallationUrlInterface;
    log: {
        debug: (message: string, additionalInfo?: object) => void;
        info: (message: string, additionalInfo?: object) => void;
        warn: (message: string, additionalInfo?: object) => void;
        error: (message: string, additionalInfo?: object) => void;
        [key: string]: unknown;
    };
}) & typeof DefaultApp;
export type App = InstanceType<typeof App>;
export declare const OAuthApp: (new (...args: any[]) => {
    type: "oauth-app";
    on: import("@octokit/oauth-app").AddEventHandler<{
        Octokit: typeof import("@octokit/core").Octokit & import("@octokit/core/types").Constructor<{
            paginate: import("@octokit/plugin-paginate-rest").PaginateInterface;
        } & import("@octokit/plugin-paginate-graphql").paginateGraphQLInterface & import("@octokit/plugin-rest-endpoint-methods").Api & {
            retry: {
                retryRequest: (error: import("@octokit/request-error").RequestError, retries: number, retryAfter: number) => import("@octokit/request-error").RequestError;
            };
        }>;
    }>;
    octokit: import("@octokit/core").Octokit & {
        paginate: import("@octokit/plugin-paginate-rest").PaginateInterface;
    } & import("@octokit/plugin-paginate-graphql").paginateGraphQLInterface & import("@octokit/plugin-rest-endpoint-methods").Api & {
        retry: {
            retryRequest: (error: import("@octokit/request-error").RequestError, retries: number, retryAfter: number) => import("@octokit/request-error").RequestError;
        };
    };
    getUserOctokit: import("@octokit/oauth-app").GetUserOctokitWithStateInterface<"oauth-app">;
    getWebFlowAuthorizationUrl: import("@octokit/oauth-app").GetWebFlowAuthorizationUrlInterface<"oauth-app">;
    createToken: import("@octokit/oauth-app").CreateTokenInterface<"oauth-app">;
    checkToken: import("@octokit/oauth-app").CheckTokenInterface<"oauth-app">;
    resetToken: import("@octokit/oauth-app").ResetTokenInterface<"oauth-app">;
    refreshToken: import("@octokit/oauth-app").RefreshTokenInterface;
    scopeToken: import("@octokit/oauth-app").ScopeTokenInterface;
    deleteToken: import("@octokit/oauth-app").DeleteTokenInterface;
    deleteAuthorization: import("@octokit/oauth-app").DeleteAuthorizationInterface;
}) & typeof DefaultOAuthApp;
export type OAuthApp = InstanceType<typeof OAuthApp>;
export { createNodeMiddleware } from "@octokit/app";
