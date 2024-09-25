import type { RpcCallShared } from "./rpc-call-shared";
import type { RpcStatus } from "./rpc-status";
import type { MethodInfo } from "./reflection-info";
import type { RpcMetadata } from "./rpc-metadata";
/**
 * A unary RPC call. Unary means there is exactly one input message and
 * exactly one output message unless an error occurred.
 */
export declare class UnaryCall<I extends object = object, O extends object = object> implements RpcCallShared<I, O>, PromiseLike<FinishedUnaryCall<I, O>> {
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
     * This promise will reject with a `RpcError` when the server sends an
     * error status code.
     */
    readonly headers: Promise<RpcMetadata>;
    /**
     * The message the server replied with.
     *
     * If the server does not send a message, this promise will reject with a
     * `RpcError`.
     */
    readonly response: Promise<O>;
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
    constructor(method: MethodInfo<I, O>, requestHeaders: RpcMetadata, request: I, headers: Promise<RpcMetadata>, response: Promise<O>, status: Promise<RpcStatus>, trailers: Promise<RpcMetadata>);
    /**
     * If you are only interested in the final outcome of this call,
     * you can await it to receive a `FinishedUnaryCall`.
     */
    then<TResult1 = FinishedUnaryCall<I, O>, TResult2 = never>(onfulfilled?: ((value: FinishedUnaryCall<I, O>) => (PromiseLike<TResult1> | TResult1)) | undefined | null, onrejected?: ((reason: any) => (PromiseLike<TResult2> | TResult2)) | undefined | null): Promise<TResult1 | TResult2>;
    private promiseFinished;
}
/**
 * A completed unary RPC call. This will only exists if the RPC was
 * successful.
 */
export interface FinishedUnaryCall<I extends object, O extends object> {
    /**
     * Reflection information about this call.
     */
    readonly method: MethodInfo<I, O>;
    /**
     * Request headers being sent with the request.
     */
    readonly requestHeaders: Readonly<RpcMetadata>;
    /**
     * The request message that has been sent.
     */
    readonly request: Readonly<I>;
    /**
     * The response headers that the server sent.
     */
    readonly headers: RpcMetadata;
    /**
     * The message the server replied with.
     */
    readonly response: O;
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
