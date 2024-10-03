/// <reference types="node" />
import * as http from "http";
import * as https from "https";
import { TwirpError } from "./errors";
export interface Rpc {
    request(service: string, method: string, contentType: "application/json" | "application/protobuf", data: object | Uint8Array): Promise<object | Uint8Array>;
}
export declare type HttpClientOptions = Omit<http.RequestOptions | https.RequestOptions, "path" | "host" | "port"> & {
    baseUrl: string;
};
/**
 * a node HTTP RPC implementation
 * @param options
 * @constructor
 */
export declare const NodeHttpRPC: (options: HttpClientOptions) => Rpc;
export declare function wrapErrorResponseToTwirpError(errorResponse: string): TwirpError;
export declare type FetchRPCOptions = Omit<RequestInit, "body" | "method"> & {
    baseUrl: string;
};
/**
 * a browser fetch RPC implementation
 */
export declare const FetchRPC: (options: FetchRPCOptions) => Rpc;
