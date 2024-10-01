/// <reference types="node" />
import { TwirpContext } from "./context";
import http from "http";
/**
 * Supported Twirp Content-Type
 */
export declare enum TwirpContentType {
    Protobuf = 0,
    JSON = 1,
    Unknown = 2
}
/**
 * Represent a Twirp request
 */
export interface TwirpRequest {
    prefix?: string;
    pkgService: string;
    method: string;
    contentType: TwirpContentType;
    mimeContentType: string;
}
/**
 * Get supported content-type
 * @param mimeType
 */
export declare function getContentType(mimeType: string | undefined): TwirpContentType;
/**
 * Validate a twirp request
 * @param ctx
 * @param request
 * @param pathPrefix
 */
export declare function validateRequest(ctx: TwirpContext, request: http.IncomingMessage, pathPrefix: string): TwirpRequest;
/**
 * Get request data from the body
 * @param req
 */
export declare function getRequestData(req: http.IncomingMessage): Promise<Buffer>;
/**
 * Parses twirp url path
 * @param path
 */
export declare function parseTwirpPath(path: string): Omit<TwirpRequest, "contentType" | "mimeContentType">;
