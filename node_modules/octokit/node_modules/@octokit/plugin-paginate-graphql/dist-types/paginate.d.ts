import type { Octokit } from "@octokit/core";
declare const createPaginate: (octokit: Octokit) => <ResponseType extends object = any>(query: string, initialParameters?: Record<string, any>) => Promise<ResponseType>;
export { createPaginate };
