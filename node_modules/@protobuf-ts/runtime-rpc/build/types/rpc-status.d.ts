/**
 * A RPC status consists of a code and a text message.
 *
 * The status is usually returned from the server as a response trailer,
 * but a `RpcTransport` may also read the status from response headers.
 */
export interface RpcStatus {
    /**
     * A status code as a string. The value depends on the `RpcTransport` being
     * used.
     *
     * For gRPC, it will be the string value of a StatusCode enum value
     * https://github.com/grpc/grpc/blob/a19d8dcfb50caa81cddc25bc1a6afdd7a2f497b7/include/grpcpp/impl/codegen/status_code_enum.h#L24
     *
     * For Twirp, it will be one of the Twirp error codes as string:
     * https://twitchtv.github.io/twirp/docs/spec_v5.html#error-codes
     *
     */
    code: string;
    /**
     * A text message that may describe the condition.
     */
    detail: string;
}
