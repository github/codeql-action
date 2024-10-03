import type { RpcCallShared } from "./rpc-call-shared";
import type { RpcOutputStream } from "./rpc-output-stream";
import type { RpcStatus } from "./rpc-status";
import type { MethodInfo } from "./reflection-info";
import type { RpcMetadata } from "./rpc-metadata";
/**
 * A server streaming RPC call. The client provides exactly one input message
 * but the server may respond with 0, 1, or more messages.
 */
export declare class ServerStreamingCall<I extends object = object, O extends object = object> implements RpcCallShared<I, O>, PromiseLike<FinishedServerStreamingCall<I, O>> {
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
     * The request message being sent.
     */
    readonly request: Readonly<I>;
    /**
     * The response headers that the server sent.
     *
     * This promise will reject with a `RpcError` when the server sends a
     * error status code.
     */
    readonly headers: Promise<RpcMetadata>;
    /**
     * Response messages from the server.
     * This is an AsyncIterable that can be iterated with `await for .. of`.
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
    constructor(method: MethodInfo<I, O>, requestHeaders: Readonly<RpcMetadata>, request: Readonly<I>, headers: Promise<RpcMetadata>, response: RpcOutputStream<O>, status: Promise<RpcStatus>, trailers: Promise<RpcMetadata>);
    /**
     * Instead of awaiting the response status and trailers, you can
     * just as well await this call itself to receive the server outcome.
     * You should first setup some listeners to the `request` to
     * see the actual messages the server replied with.
     */
    then<TResult1 = FinishedServerStreamingCall<I, O>, TResult2 = never>(onfulfilled?: ((value: FinishedServerStreamingCall<I, O>) => (PromiseLike<TResult1> | TResult1)) | undefined | null, onrejected?: ((reason: any) => (PromiseLike<TResult2> | TResult2)) | undefined | null): Promise<TResult1 | TResult2>;
    private promiseFinished;
}
/**
 * A completed server streaming RPC call. The server will not send any more
 * messages.
 */
export interface FinishedServerStreamingCall<I extends object, O extends object> {
    /**
     * Reflection information about this call.
     */
    readonly method: MethodInfo<I, O>;
    /**
     * Request headers being sent with the request.
     */
    readonly requestHeaders: Readonly<RpcMetadata>;
    /**
     * The request message being sent.
     */
    readonly request: Readonly<I>;
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
