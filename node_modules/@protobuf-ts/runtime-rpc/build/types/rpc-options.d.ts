import type { RpcMetadata } from "./rpc-metadata";
import type { BinaryReadOptions, BinaryWriteOptions, JsonReadOptions, JsonWriteOptions } from "@protobuf-ts/runtime";
import type { RpcInterceptor } from "./rpc-interceptor";
/**
 * User-provided options for Remote Procedure Calls.
 *
 * Every generated service method accepts these options.
 * They are passed on to the `RpcTransport` and can be evaluated there.
 */
export interface RpcOptions {
    /**
     * Meta data for the call.
     *
     * RPC meta data are simple key-value pairs that usually translate
     * directly to HTTP request headers.
     *
     * If a key ends with `-bin`, it should contain binary data in base64
     * encoding, allowing you to send serialized messages.
     */
    meta?: RpcMetadata;
    /**
     * Timeout for the call in milliseconds.
     * If a Date object is given, it is used as a deadline.
     */
    timeout?: number | Date;
    /**
     * Interceptors can be used to manipulate request and response data.
     * The most common use case is adding a "Authorization" header.
     */
    interceptors?: RpcInterceptor[];
    /**
     * Options for the JSON wire format.
     *
     * To send or receive `google.protobuf.Any` in JSON format, you must
     * provide `jsonOptions.typeRegistry` so that the runtime can discriminate
     * the packed type.
     */
    jsonOptions?: Partial<JsonReadOptions & JsonWriteOptions>;
    /**
     * Options for the binary wire format.
     */
    binaryOptions?: Partial<BinaryReadOptions & BinaryWriteOptions>;
    /**
     * A signal to cancel a call. Can be created with an [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).
     * The npm package `abort-controller` provides a polyfill for Node.js.
     */
    abort?: AbortSignal;
    /**
     * A `RpcTransport` implementation may allow arbitrary
     * other options.
     */
    [extra: string]: unknown;
}
/**
 * Merges custom RPC options with defaults. Returns a new instance and keeps
 * the "defaults" and the "options" unmodified.
 *
 * Merges `RpcMetadata` "meta", overwriting values from "defaults" with
 * values from "options". Does not append values to existing entries.
 *
 * Merges "jsonOptions", including "jsonOptions.typeRegistry", by creating
 * a new array that contains types from "options.jsonOptions.typeRegistry"
 * first, then types from "defaults.jsonOptions.typeRegistry".
 *
 * Merges "binaryOptions".
 *
 * Merges "interceptors" by creating a new array that contains interceptors
 * from "defaults" first, then interceptors from "options".
 *
 * Works with objects that extend `RpcOptions`, but only if the added
 * properties are of type Date, primitive like string, boolean, or Array
 * of primitives. If you have other property types, you have to merge them
 * yourself.
 */
export declare function mergeRpcOptions<T extends RpcOptions>(defaults: T, options?: Partial<T>): T;
