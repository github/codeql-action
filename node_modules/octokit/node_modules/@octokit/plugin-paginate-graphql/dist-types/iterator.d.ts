import type { Octokit } from "@octokit/core";
declare const createIterator: (octokit: Octokit) => <ResponseType = any>(query: string, initialParameters?: Record<string, any>) => {
    [Symbol.asyncIterator]: () => {
        next(): Promise<{
            done: boolean;
            value: ResponseType;
        }>;
    };
};
export { createIterator };
