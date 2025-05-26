import type { Octokit } from "@octokit/core";
import { createIterator } from "./iterator.js";
import { createPaginate } from "./paginate.js";
export type { PageInfoForward, PageInfoBackward } from "./page-info.js";
export { VERSION } from "./version.js";
export type paginateGraphQLInterface = {
    graphql: Octokit["graphql"] & {
        paginate: ReturnType<typeof createPaginate> & {
            iterator: ReturnType<typeof createIterator>;
        };
    };
};
export declare function paginateGraphQL(octokit: Octokit): paginateGraphQLInterface;
