import type { MethodInfo } from "./reflection-info";
import type { RpcMetadata } from "./rpc-metadata";
import type { RpcStatus } from "./rpc-status";
declare type CancelCallback = () => void;
declare type RemoveListenerFn = () => void;
declare type SendResponseHeadersFn = (headers: RpcMetadata) => void;
export declare class ServerCallContextController implements ServerCallContext {
    private _cancelled;
    private readonly _sendRH;
    private readonly _listeners;
    constructor(method: MethodInfo, headers: Readonly<RpcMetadata>, deadline: Date, sendResponseHeadersFn: SendResponseHeadersFn, defaultStatus?: RpcStatus);
    /**
     * Set the call cancelled.
     *
     * Invokes all callbacks registered with onCancel() and
     * sets `cancelled = true`.
     */
    notifyCancelled(): void;
    /**
     * Reflection information about this call.
     */
    readonly method: MethodInfo;
    /**
     * Request headers.
     */
    readonly headers: Readonly<RpcMetadata>;
    /**
     * Deadline for this call.
     */
    readonly deadline: Date;
    /**
     * Trailers to send when the response is finished.
     */
    trailers: RpcMetadata;
    /**
     * Status to send when the response is finished.
     */
    status: RpcStatus;
    /**
     * Send response headers.
     */
    sendResponseHeaders(data: RpcMetadata): void;
    /**
     * Is the call cancelled?
     *
     * When the client closes the connection before the server
     * is done, the call is cancelled.
     *
     * If you want to cancel a request on the server, throw a
     * RpcError with the CANCELLED status code.
     */
    get cancelled(): boolean;
    /**
     * Add a callback for cancellation.
     */
    onCancel(callback: CancelCallback): RemoveListenerFn;
}
/**
 * Context for a RPC call on the server side.
 */
export interface ServerCallContext {
    /**
     * Reflection information about this call.
     */
    readonly method: MethodInfo;
    /**
     * Request headers.
     */
    readonly headers: Readonly<RpcMetadata>;
    /**
     * Deadline for this call.
     */
    readonly deadline: Date;
    /**
     * Trailers to send when the response is finished.
     */
    trailers: RpcMetadata;
    /**
     * Status to send when the response is finished.
     */
    status: RpcStatus;
    /**
     * Send response headers.
     */
    sendResponseHeaders(data: RpcMetadata): void;
    /**
     * Is the call cancelled?
     *
     * When the client closes the connection before the server
     * is done, the call is cancelled.
     *
     * If you want to cancel a request on the server, throw a
     * RpcError with the CANCELLED status code.
     */
    readonly cancelled: boolean;
    /**
     * Add a callback for cancellation.
     */
    onCancel(cb: CancelCallback): RemoveListenerFn;
}
export {};
