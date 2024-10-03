export var DeferredState;
(function (DeferredState) {
    DeferredState[DeferredState["PENDING"] = 0] = "PENDING";
    DeferredState[DeferredState["REJECTED"] = 1] = "REJECTED";
    DeferredState[DeferredState["RESOLVED"] = 2] = "RESOLVED";
})(DeferredState || (DeferredState = {}));
/**
 * A deferred promise. This is a "controller" for a promise, which lets you
 * pass a promise around and reject or resolve it from the outside.
 *
 * Warning: This class is to be used with care. Using it can make code very
 * difficult to read. It is intended for use in library code that exposes
 * promises, not for regular business logic.
 */
export class Deferred {
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
    constructor(preventUnhandledRejectionWarning = true) {
        this._state = DeferredState.PENDING;
        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
        if (preventUnhandledRejectionWarning) {
            this._promise.catch(_ => { });
        }
    }
    /**
     * Get the current state of the promise.
     */
    get state() {
        return this._state;
    }
    /**
     * Get the deferred promise.
     */
    get promise() {
        return this._promise;
    }
    /**
     * Resolve the promise. Throws if the promise is already resolved or rejected.
     */
    resolve(value) {
        if (this.state !== DeferredState.PENDING)
            throw new Error(`cannot resolve ${DeferredState[this.state].toLowerCase()}`);
        this._resolve(value);
        this._state = DeferredState.RESOLVED;
    }
    /**
     * Reject the promise. Throws if the promise is already resolved or rejected.
     */
    reject(reason) {
        if (this.state !== DeferredState.PENDING)
            throw new Error(`cannot reject ${DeferredState[this.state].toLowerCase()}`);
        this._reject(reason);
        this._state = DeferredState.REJECTED;
    }
    /**
     * Resolve the promise. Ignore if not pending.
     */
    resolvePending(val) {
        if (this._state === DeferredState.PENDING)
            this.resolve(val);
    }
    /**
     * Reject the promise. Ignore if not pending.
     */
    rejectPending(reason) {
        if (this._state === DeferredState.PENDING)
            this.reject(reason);
    }
}
