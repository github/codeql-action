import { OctokitOptions } from '@octokit/core/dist-types/types';
import { RequestRequestOptions } from '@octokit/types';
export type RetryOptions = {
    doNotRetry?: number[];
    enabled?: boolean;
};
export declare function getRetryOptions(defaultOptions: OctokitOptions, retries?: number, exemptStatusCodes?: number[]): [RetryOptions, RequestRequestOptions | undefined];
