/**
 * A stream of response messages. Messages can be read from the stream via
 * the AsyncIterable interface:
 *
 * ```typescript
 * for await (let message of response) {...
 * ```
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
export interface RpcOutputStream<T extends object = object> extends AsyncIterable<T> {
    /**
     * Add a callback for every new datum.
     * If a new message arrived, the "message" argument is set.
     * If an error occurred, the "error" argument is set.
     * If the stream is complete, the "complete" argument is `true`.
     * Only one of the arguments is used at a time.
     */
    onNext(callback: NextCallback<T>): RemoveListenerFn;
    /**
     * Add a callback for every new message.
     */
    onMessage(callback: MessageCallback<T>): RemoveListenerFn;
    /**
     * Add a callback for stream completion.
     * Called only when all messages have been read without error.
     * The stream is closed when this callback is called.
     */
    onComplete(callback: CompleteCallback): RemoveListenerFn;
    /**
     * Add a callback for errors.
     * The stream is closed when this callback is called.
     */
    onError(callback: ErrorCallback): RemoveListenerFn;
}
declare type NextCallback<T extends object> = (message: T | undefined, error: Error | undefined, complete: boolean) => void;
declare type MessageCallback<T extends object> = (message: T) => void;
declare type CompleteCallback = () => void;
declare type ErrorCallback = (reason: Error) => void;
declare type RemoveListenerFn = () => void;
/**
 * A `RpcOutputStream` that you control.
 */
export declare class RpcOutputStreamController<T extends object = object> implements RpcOutputStream<T> {
    constructor();
    onNext(callback: NextCallback<T>): RemoveListenerFn;
    onMessage(callback: MessageCallback<T>): RemoveListenerFn;
    onError(callback: ErrorCallback): RemoveListenerFn;
    onComplete(callback: CompleteCallback): RemoveListenerFn;
    private addLis;
    private clearLis;
    private readonly _lis;
    /**
     * Is this stream already closed by a completion or error?
     */
    get closed(): boolean;
    /**
     * Emit message, close with error, or close successfully, but only one
     * at a time.
     * Can be used to wrap a stream by using the other stream's `onNext`.
     */
    notifyNext(message: T | undefined, error: Error | undefined, complete: boolean): void;
    /**
     * Emits a new message. Throws if stream is closed.
     *
     * Triggers onNext and onMessage callbacks.
     */
    notifyMessage(message: T): void;
    /**
     * Closes the stream with an error. Throws if stream is closed.
     *
     * Triggers onNext and onError callbacks.
     */
    notifyError(error: Error): void;
    /**
     * Closes the stream successfully. Throws if stream is closed.
     *
     * Triggers onNext and onComplete callbacks.
     */
    notifyComplete(): void;
    private _closed;
    private _itState;
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
    [Symbol.asyncIterator](): AsyncIterator<T>;
    private pushIt;
}
export {};
