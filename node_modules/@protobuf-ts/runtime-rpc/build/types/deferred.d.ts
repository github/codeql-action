export declare enum DeferredState {
    PENDING = 0,
    REJECTED = 1,
    RESOLVED = 2
}
/**
 * A deferred promise. This is a "controller" for a promise, which lets you
 * pass a promise around and reject or resolve it from the outside.
 *
 * Warning: This class is to be used with care. Using it can make code very
 * difficult to read. It is intended for use in library code that exposes
 * promises, not for regular business logic.
 */
export declare class Deferred<T> {
    /**
     * Get the current state of the promise.
     */
    get state(): DeferredState;
    /**
     * Get the deferred promise.
     */
    get promise(): Promise<T>;
    private readonly _promise;
    private _state;
    private _resolve;
    private _reject;
    /**
     * @param preventUnhandledRejectionWarning - prevents the warning
     * "Unhandled Promise rejection" by adding a noop rejection handler.
     * Working with calls returned from the runtime-rpc package in an
     * async function usually means awaiting one call property after
     * the other. This means that the "status" is not being awaited when
     * an earlier await for the "headers" is rejected. This causes the
     * "unhandled promise reject" warning. A more correct behaviour for
     * calls might be to become aware whether at least one of the
     * promises is handled and swallow the rejection warning for the
     * others.
     */
    constructor(preventUnhandledRejectionWarning?: boolean);
    /**
     * Resolve the promise. Throws if the promise is already resolved or rejected.
     */
    resolve(value: T | PromiseLike<T>): void;
    /**
     * Reject the promise. Throws if the promise is already resolved or rejected.
     */
    reject(reason: any): void;
    /**
     * Resolve the promise. Ignore if not pending.
     */
    resolvePending(val: T | PromiseLike<T>): void;
    /**
     * Reject the promise. Ignore if not pending.
     */
    rejectPending(reason: any): void;
}
