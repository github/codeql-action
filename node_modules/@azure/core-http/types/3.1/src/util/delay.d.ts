import { AbortSignalLike } from "@azure/abort-controller";
/**
 * A wrapper for setTimeout that resolves a promise after delayInMs milliseconds.
 * @param delayInMs - The number of milliseconds to be delayed.
 * @param value - The value to be resolved with after a timeout of t milliseconds.
 * @param options - The options for delay - currently abort options
 *   @param abortSignal - The abortSignal associated with containing operation.
 *   @param abortErrorMsg - The abort error message associated with containing operation.
 * @returns - Resolved promise
 */
export declare function delay<T>(delayInMs: number, value?: T, options?: {
    abortSignal?: AbortSignalLike;
    abortErrorMsg?: string;
}): Promise<T | void>;
//# sourceMappingURL=delay.d.ts.map
