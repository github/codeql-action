import type { ServerStreamingCall } from "./server-streaming-call";
import type { ClientStreamingCall } from "./client-streaming-call";
import type { DuplexStreamingCall } from "./duplex-streaming-call";
import type { RpcTransport } from "./rpc-transport";
import type { MethodInfo } from "./reflection-info";
import type { RpcOptions } from "./rpc-options";
import type { UnaryCall } from "./unary-call";
/**
 * Interceptors can be used to manipulate request and response data.
 *
 * They are commonly used to add authentication metadata, log requests
 * or implement client side caching.
 *
 * Interceptors are stacked. Call next() to invoke the next interceptor
 * on the stack. To manipulate the request, change the data passed to
 * next(). To manipulate a response, change the data returned by next().
 *
 * The following example adds an 'Authorization' header to unary calls:
 *
 * ```typescript
 * interceptUnary(next, method, input, options): UnaryCall {
 *   if (!options.meta) {
 *     options.meta = {};
 *   }
 *   options.meta['Authorization'] = 'xxx';
 *   return next(method, input, options);
 * }
 * ```
 *
 * The following example intercepts server streaming calls. Every
 * message that the server sends is emitted twice to the client:
 *
 * ```typescript
 * interceptServerStreaming(next, method, input, options) {
 *   let original = next(method, input, options);
 *   let response = new RpcOutputStreamController();
 *   original.response.onNext((message, error, done) => {
 *     if (message) {
 *       response.notifyMessage(message);
 *       response.notifyMessage(message);
 *     }
 *     if (error)
 *       response.notifyError(error);
 *     if (done)
 *       response.notifyComplete();
 *   });
 *   return new ServerStreamingCall(
 *     original.method,
 *     original.requestHeaders,
 *     original.request,
 *     original.headers,
 *     response,
 *     original.status,
 *     original.trailers
 *   );
 * }
 * ```
 *
 */
export interface RpcInterceptor {
    interceptUnary?(next: NextUnaryFn, method: MethodInfo, input: object, options: RpcOptions): UnaryCall;
    interceptServerStreaming?(next: NextServerStreamingFn, method: MethodInfo, input: object, options: RpcOptions): ServerStreamingCall;
    interceptClientStreaming?(next: NextClientStreamingFn, method: MethodInfo, options: RpcOptions): ClientStreamingCall;
    interceptDuplex?(next: NextDuplexStreamingFn, method: MethodInfo, options: RpcOptions): DuplexStreamingCall;
}
/**
 * Invokes the next interceptor on the stack and returns its result.
 */
export declare type NextUnaryFn = (method: MethodInfo, input: object, options: RpcOptions) => UnaryCall;
/**
 * Invokes the next interceptor on the stack and returns its result.
 */
export declare type NextServerStreamingFn = (method: MethodInfo, input: object, options: RpcOptions) => ServerStreamingCall;
/**
 * Invokes the next interceptor on the stack and returns its result.
 */
export declare type NextClientStreamingFn = (method: MethodInfo, options: RpcOptions) => ClientStreamingCall;
/**
 * Invokes the next interceptor on the stack and returns its result.
 */
export declare type NextDuplexStreamingFn = (method: MethodInfo, options: RpcOptions) => DuplexStreamingCall;
/**
 * Creates a "stack" of of all unary interceptors specified in the given `RpcOptions`.
 * Used by generated client implementations.
 * @internal
 */
export declare function stackIntercept<I extends object, O extends object>(kind: "unary", transport: RpcTransport, method: MethodInfo<I, O>, options: RpcOptions, input: I): UnaryCall<I, O>;
/**
 * Creates a "stack" of of all server streaming interceptors specified in the given `RpcOptions`.
 * Used by generated client implementations.
 * @internal
 */
export declare function stackIntercept<I extends object, O extends object>(kind: "serverStreaming", transport: RpcTransport, method: MethodInfo<I, O>, options: RpcOptions, input: I): ServerStreamingCall<I, O>;
/**
 * Creates a "stack" of of all client streaming interceptors specified in the given `RpcOptions`.
 * Used by generated client implementations.
 * @internal
 */
export declare function stackIntercept<I extends object, O extends object>(kind: "clientStreaming", transport: RpcTransport, method: MethodInfo<I, O>, options: RpcOptions): ClientStreamingCall<I, O>;
/**
 * Creates a "stack" of of all duplex streaming interceptors specified in the given `RpcOptions`.
 * Used by generated client implementations.
 * @internal
 */
export declare function stackIntercept<I extends object, O extends object>(kind: "duplex", transport: RpcTransport, method: MethodInfo<I, O>, options: RpcOptions): DuplexStreamingCall<I, O>;
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
export declare function stackUnaryInterceptors<I extends object, O extends object>(transport: RpcTransport, method: MethodInfo<I, O>, input: I, options: RpcOptions): UnaryCall<I, O>;
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
export declare function stackServerStreamingInterceptors<I extends object, O extends object>(transport: RpcTransport, method: MethodInfo<I, O>, input: I, options: RpcOptions): ServerStreamingCall<I, O>;
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
export declare function stackClientStreamingInterceptors<I extends object, O extends object>(transport: RpcTransport, method: MethodInfo<I, O>, options: RpcOptions): ClientStreamingCall<I, O>;
/**
 * @deprecated replaced by `stackIntercept()`, still here to support older generated code
 */
export declare function stackDuplexStreamingInterceptors<I extends object, O extends object>(transport: RpcTransport, method: MethodInfo<I, O>, options: RpcOptions): DuplexStreamingCall<I, O>;
