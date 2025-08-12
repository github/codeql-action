"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcOutputStreamController = void 0;
const deferred_1 = require("./deferred");
const runtime_1 = require("@protobuf-ts/runtime");
/**
 * A `RpcOutputStream` that you control.
 */
class RpcOutputStreamController {
    constructor() {
        this._lis = {
            nxt: [],
            msg: [],
            err: [],
            cmp: [],
        };
        this._closed = false;
        // --- RpcOutputStream async iterator API
        // iterator state.
        // is undefined when no iterator has been acquired yet.
        this._itState = { q: [] };
    }
    // --- RpcOutputStream callback API
    onNext(callback) {
        return this.addLis(callback, this._lis.nxt);
    }
    onMessage(callback) {
        return this.addLis(callback, this._lis.msg);
    }
    onError(callback) {
        return this.addLis(callback, this._lis.err);
    }
    onComplete(callback) {
        return this.addLis(callback, this._lis.cmp);
    }
    addLis(callback, list) {
        list.push(callback);
        return () => {
            let i = list.indexOf(callback);
            if (i >= 0)
                list.splice(i, 1);
        };
    }
    // remove all listeners
    clearLis() {
        for (let l of Object.values(this._lis))
            l.splice(0, l.length);
    }
    // --- Controller API
    /**
     * Is this stream already closed by a completion or error?
     */
    get closed() {
        return this._closed !== false;
    }
    /**
     * Emit message, close with error, or close successfully, but only one
     * at a time.
     * Can be used to wrap a stream by using the other stream's `onNext`.
     */
    notifyNext(message, error, complete) {
        runtime_1.assert((message ? 1 : 0) + (error ? 1 : 0) + (complete ? 1 : 0) <= 1, 'only one emission at a time');
        if (message)
            this.notifyMessage(message);
        if (error)
            this.notifyError(error);
        if (complete)
            this.notifyComplete();
    }
    /**
     * Emits a new message. Throws if stream is closed.
     *
     * Triggers onNext and onMessage callbacks.
     */
    notifyMessage(message) {
        runtime_1.assert(!this.closed, 'stream is closed');
        this.pushIt({ value: message, done: false });
        this._lis.msg.forEach(l => l(message));
        this._lis.nxt.forEach(l => l(message, undefined, false));
    }
    /**
     * Closes the stream with an error. Throws if stream is closed.
     *
     * Triggers onNext and onError callbacks.
     */
    notifyError(error) {
        runtime_1.assert(!this.closed, 'stream is closed');
        this._closed = error;
        this.pushIt(error);
        this._lis.err.forEach(l => l(error));
        this._lis.nxt.forEach(l => l(undefined, error, false));
        this.clearLis();
    }
    /**
     * Closes the stream successfully. Throws if stream is closed.
     *
     * Triggers onNext and onComplete callbacks.
     */
    notifyComplete() {
        runtime_1.assert(!this.closed, 'stream is closed');
        this._closed = true;
        this.pushIt({ value: null, done: true });
        this._lis.cmp.forEach(l => l());
        this._lis.nxt.forEach(l => l(undefined, undefined, true));
        this.clearLis();
    }
    /**
     * Creates an async iterator (that can be used with `for await {...}`)
     * to consume the stream.
     *
     * Some things to note:
     * - If an error occurs, the `for await` will throw it.
     * - If an error occurred before the `for await` was started, `for await`
     *   will re-throw it.
     * - If the stream is already complete, the `for await` will be empty.
     * - If your `for await` consumes slower than the stream produces,
     *   for example because you are relaying messages in a slow operation,
     *   messages are queued.
     */
    [Symbol.asyncIterator]() {
        // if we are closed, we are definitely not receiving any more messages.
        // but we can't let the iterator get stuck. we want to either:
        // a) finish the new iterator immediately, because we are completed
        // b) reject the new iterator, because we errored
        if (this._closed === true)
            this.pushIt({ value: null, done: true });
        else if (this._closed !== false)
            this.pushIt(this._closed);
        // the async iterator
        return {
            next: () => {
                let state = this._itState;
                runtime_1.assert(state, "bad state"); // if we don't have a state here, code is broken
                // there should be no pending result.
                // did the consumer call next() before we resolved our previous result promise?
                runtime_1.assert(!state.p, "iterator contract broken");
                // did we produce faster than the iterator consumed?
                // return the oldest result from the queue.
                let first = state.q.shift();
                if (first)
                    return ("value" in first) ? Promise.resolve(first) : Promise.reject(first);
                // we have no result ATM, but we promise one.
                // as soon as we have a result, we must resolve promise.
                state.p = new deferred_1.Deferred();
                return state.p.promise;
            },
        };
    }
    // "push" a new iterator result.
    // this either resolves a pending promise, or enqueues the result.
    pushIt(result) {
        let state = this._itState;
        // is the consumer waiting for us?
        if (state.p) {
            // yes, consumer is waiting for this promise.
            const p = state.p;
            runtime_1.assert(p.state == deferred_1.DeferredState.PENDING, "iterator contract broken");
            // resolve the promise
            ("value" in result) ? p.resolve(result) : p.reject(result);
            // must cleanup, otherwise iterator.next() would pick it up again.
            delete state.p;
        }
        else {
            // we are producing faster than the iterator consumes.
            // push result onto queue.
            state.q.push(result);
        }
    }
}
exports.RpcOutputStreamController = RpcOutputStreamController;
