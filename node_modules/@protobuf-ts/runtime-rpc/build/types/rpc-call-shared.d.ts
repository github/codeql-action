import type { MethodInfo } from "./reflection-info";
import type { RpcStatus } from "./rpc-status";
import type { RpcMetadata } from "./rpc-metadata";
export interface RpcCallShared<I extends object, O extends object> {
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
     * The response headers that the server sent.
     *
     * This promise will reject with a `RpcError` when the server sends an
     * error status code.
     */
    readonly headers: Promise<RpcMetadata>;
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
}
