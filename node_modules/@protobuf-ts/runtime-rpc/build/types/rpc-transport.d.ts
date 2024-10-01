import type { UnaryCall } from "./unary-call";
import type { ServerStreamingCall } from "./server-streaming-call";
import type { ClientStreamingCall } from "./client-streaming-call";
import type { DuplexStreamingCall } from "./duplex-streaming-call";
import type { MethodInfo } from "./reflection-info";
import type { RpcOptions } from "./rpc-options";
/**
 * A `RpcTransport` executes Remote Procedure Calls defined by a protobuf
 * service.
 *
 * This interface is the contract between a generated service client and
 * some wire protocol like grpc, grpc-web, Twirp or other.
 *
 * The transport receives reflection information about the service and
 * method being called.
 *
 * Some rules:
 *
 * a) An implementation **should** accept default `RpcOptions` (or an
 * interface that extends `RpcOptions`) in the constructor.
 *
 * b) An implementation **must** merge the options given to `mergeOptions()`
 * with its default options. If no extra options are implemented, or only
 * primitive option values are used, using `mergeRpcOptions()` will
 * produce the required behaviour.
 *
 * c) An implementation **must** pass `RpcOptions.jsonOptions` and
 * `RpcOptions.binaryOptions` to the `fromBinary`, `toBinary`, `fromJson`
 * and `toJson` methods when preparing a request or parsing a response.
 *
 * d) An implementation may support arbitrary other options, but they **must
 * not** interfere with options keys of the binary or JSON options.
 */
export interface RpcTransport {
    /**
     * Merge call options with default options.
     * Generated service clients will call this method with the users'
     * call options and pass the result to the execute-method below.
     */
    mergeOptions(options?: Partial<RpcOptions>): RpcOptions;
    /**
     * Execute an unary RPC.
     */
    unary<I extends object, O extends object>(method: MethodInfo<I, O>, input: I, options: RpcOptions): UnaryCall<I, O>;
    /**
     * Execute a server streaming RPC.
     */
    serverStreaming<I extends object, O extends object>(method: MethodInfo<I, O>, input: I, options: RpcOptions): ServerStreamingCall<I, O>;
    /**
     * Execute a client streaming RPC.
     */
    clientStreaming<I extends object, O extends object>(method: MethodInfo<I, O>, options: RpcOptions): ClientStreamingCall<I, O>;
    /**
     * Execute a duplex streaming RPC.
     */
    duplex<I extends object, O extends object>(method: MethodInfo<I, O>, options: RpcOptions): DuplexStreamingCall<I, O>;
}
