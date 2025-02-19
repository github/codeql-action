import { Octokit as OctokitCore } from "@octokit/core";
export { RequestError } from "@octokit/request-error";
export type { PageInfoForward, PageInfoBackward, } from "@octokit/plugin-paginate-graphql";
export declare const Octokit: typeof OctokitCore & import("@octokit/core/types").Constructor<{
    paginate: import("@octokit/plugin-paginate-rest").PaginateInterface;
} & import("@octokit/plugin-paginate-graphql").paginateGraphQLInterface & import("@octokit/plugin-rest-endpoint-methods").Api & {
    retry: {
        retryRequest: (error: import("@octokit/request-error").RequestError, retries: number, retryAfter: number) => import("@octokit/request-error").RequestError;
    };
}>;
export type Octokit = InstanceType<typeof Octokit>;
