import { RpcError } from "./rpc-error";
import type { RpcMetadata } from "./rpc-metadata";
import type { RpcStatus } from "./rpc-status";
import type { RpcTransport } from "./rpc-transport";
import type { MethodInfo } from "./reflection-info";
import { RpcOptions } from "./rpc-options";
import { UnaryCall } from "./unary-call";
import { ServerStreamingCall } from "./server-streaming-call";
import { ClientStreamingCall } from "./client-streaming-call";
import { DuplexStreamingCall } from "./duplex-streaming-call";
/**
 * Mock data for the TestTransport.
 */
interface TestTransportMockData {
    /**
     * Input stream behaviour for client streaming and bidi calls.
     * If RpcError, sending a message rejects with this error.
     * If number, sending message is delayed for N milliseconds.
     * If omitted, sending a message is delayed for 10 milliseconds.
     */
    inputMessage?: RpcError | number;
    /**
     * Input stream behaviour for client streaming and bidi calls.
     * If RpcError, completing the stream rejects with this error.
     * If number, completing the stream is delayed for N milliseconds.
     * If omitted, completing the stream is delayed for 10 milliseconds.
     */
    inputComplete?: RpcError | number;
    /**
     * If not provided, defaults to `{ responseHeader: "test" }`
     * If RpcError, the "headers" promise is rejected with this error.
     */
    headers?: RpcMetadata | RpcError;
    /**
     * If not provided, transport creates default output message using method info
     * If RpcError, the "response" promise / stream is rejected with this error.
     */
    response?: object | readonly object[] | RpcError;
    /**
     * If not provided, defaults to `{ code: "OK", detail: "all good" }`
     * If RpcError, the "status" promise is rejected with this error.
     */
    status?: RpcStatus | RpcError;
    /**
     * If not provided, defaults to `{ responseTrailer: "test" }`
     * If RpcError, the "trailers" promise is rejected with this error.
     */
    trailers?: RpcMetadata | RpcError;
}
/**
 * Transport for testing.
 */
export declare class TestTransport implements RpcTransport {
    static readonly defaultHeaders: Readonly<RpcMetadata>;
    static readonly defaultStatus: Readonly<RpcStatus>;
    static readonly defaultTrailers: Readonly<RpcMetadata>;
    /**
     * Sent message(s) during the last operation.
     */
    get sentMessages(): any[];
    /**
     * Sending message(s) completed?
     */
    get sendComplete(): boolean;
    /**
     * Suppress warning / error about uncaught rejections of
     * "status" and "trailers".
     */
    suppressUncaughtRejections: boolean;
    private readonly data;
    private readonly headerDelay;
    private readonly responseDelay;
    private readonly betweenResponseDelay;
    private readonly afterResponseDelay;
    private lastInput;
    /**
     * Initialize with mock data. Omitted fields have default value.
     */
    constructor(data?: TestTransportMockData);
    private promiseHeaders;
    private promiseSingleResponse;
    /**
     * Pushes response messages from the mock data to the output stream.
     * If an error response, status or trailers are mocked, the stream is
     * closed with the respective error.
     * Otherwise, stream is completed successfully.
     *
     * The returned promise resolves when the stream is closed. It should
     * not reject. If it does, code is broken.
     */
    private streamResponses;
    private promiseStatus;
    private promiseTrailers;
    private maybeSuppressUncaught;
    mergeOptions(options?: Partial<RpcOptions>): RpcOptions;
    unary<I extends object, O extends object>(method: MethodInfo<I, O>, input: I, options: RpcOptions): UnaryCall<I, O>;
    serverStreaming<I extends object, O extends object>(method: MethodInfo<I, O>, input: I, options: RpcOptions): ServerStreamingCall<I, O>;
    clientStreaming<I extends object, O extends object>(method: MethodInfo<I, O>, options: RpcOptions): ClientStreamingCall<I, O>;
    duplex<I extends object, O extends object>(method: MethodInfo<I, O>, options: RpcOptions): DuplexStreamingCall<I, O>;
}
export {};
