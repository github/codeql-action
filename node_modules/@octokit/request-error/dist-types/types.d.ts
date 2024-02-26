import type { RequestOptions, OctokitResponse } from "@octokit/types";
export type RequestErrorOptions = {
    response?: OctokitResponse<unknown>;
    request: RequestOptions;
};
