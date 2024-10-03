import type { RpcCallShared } from "./rpc-call-shared";
import type { RpcInputStream } from "./rpc-input-stream";
import type { RpcOutputStream } from "./rpc-output-stream";
import type { RpcStatus } from "./rpc-status";
import type { MethodInfo } from "./reflection-info";
import type { RpcMetadata } from "./rpc-metadata";
/**
 * A duplex streaming RPC call. This means that the clients sends an
 * arbitrary amount of messages to the server, while at the same time,
 * the server sends an arbitrary amount of messages to the client.
 */
export declare class DuplexStreamingCall<I extends object = object, O extends object = object> implements RpcCallShared<I, O> {
    /**
     * Reflection information about this call.
     */
    readonly method: MethodInfo<I, O>;
    /**
     * Request headers being sent with the request.
     *
     * Request headers are provided in the `meta` property of the
     * `RpcOptions` passed to a call.
     */
    readonly requestHeaders: Readonly<RpcMetadata>;
    /**
     * Request messages from the client.
     */
    readonly requests: RpcInputStream<I>;
    /**
     * The response headers that the server sent.
     *
     * This promise will reject with a `RpcError` when the server sends a
     * error status code.
     */
    readonly headers: Promise<RpcMetadata>;
    /**
     * Response messages from the server.
     */
    readonly responses: RpcOutputStream<O>;
    /**
     * The response status the server replied with.
     *
     * This promise will resolve when the server has finished the request
     * successfully.
     *
     * If the server replies with an error status, this promise will
     * reject with a `RpcError`.
     */
    readonly status: Promise<RpcStatus>;
    /**
     * The trailers the server attached to the response.
     *
     * This promise will resolve when the server has finished the request
     * successfully.
     *
     * If the server replies with an error status, this promise will
     * reject with a `RpcError`.
     */
    readonly trailers: Promise<RpcMetadata>;
    constructor(method: MethodInfo<I, O>, requestHeaders: Readonly<RpcMetadata>, request: RpcInputStream<I>, headers: Promise<RpcMetadata>, response: RpcOutputStream<O>, status: Promise<RpcStatus>, trailers: Promise<RpcMetadata>);
    /**
     * Instead of awaiting the response status and trailers, you can
     * just as well await this call itself to receive the server outcome.
     * Note that it may still be valid to send more request messages.
     */
    then<TResult1 = FinishedDuplexStreamingCall<I, O>, TResult2 = never>(onfulfilled?: ((value: FinishedDuplexStreamingCall<I, O>) => (PromiseLike<TResult1> | TResult1)) | undefined | null, onrejected?: ((reason: any) => (PromiseLike<TResult2> | TResult2)) | undefined | null): Promise<TResult1 | TResult2>;
    private promiseFinished;
}
/**
 * A completed duplex streaming RPC call. The server will not send any more
 * messages, but it may still be valid to send request messages.
 */
export interface FinishedDuplexStreamingCall<I extends object, O extends object> {
    /**
     * Reflection information about this call.
     */
    readonly method: MethodInfo<I, O>;
    /**
     * Request headers being sent with the request.
     */
    readonly requestHeaders: Readonly<RpcMetadata>;
    /**
     * The response headers that the server sent.
     */
    readonly headers: RpcMetadata;
    /**
     * The response status the server replied with.
     * The status code will always be OK.
     */
    readonly status: RpcStatus;
    /**
     * The trailers the server attached to the response.
     */
    readonly trailers: RpcMetadata;
}
