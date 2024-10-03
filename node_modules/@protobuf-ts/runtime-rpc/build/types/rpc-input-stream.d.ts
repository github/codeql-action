/**
 * A stream of input messages.
 */
export interface RpcInputStream<T> {
    /**
     * Send a message down the stream.
     * Only one message can be send at a time.
     */
    send(message: T): Promise<void>;
    /**
     * Complete / close the stream.
     * Can only be called if there is no pending send().
     * No send() should follow this call.
     */
    complete(): Promise<void>;
}
