/// <reference types="node" />
import * as http from "http";
import { TwirpContext } from "./context";
import { ServerHooks } from "./hooks";
import { Interceptor } from "./interceptors";
import { TwirpError } from "./errors";
/**
 * Twirp Server options
 */
interface TwirpServerOptions<T extends object, S extends TwirpContext = TwirpContext> {
    service: T;
    packageName: string;
    serviceName: string;
    methodList: keys<T>;
    matchRoute: (method: string, events: RouterEvents<S>) => TwirpHandler<T, S>;
}
/**
 * httpHandler options
 */
export interface HttpHandlerOptions {
    prefix?: string | false;
}
/**
 * Handles a twirp request
 */
export declare type TwirpHandler<T, S extends TwirpContext = TwirpContext> = (ctx: S, service: T, data: Buffer, interceptors?: Interceptor<S, any, any>[]) => Promise<Uint8Array | string>;
/**
 * Callback events for route matching
 */
export interface RouterEvents<T extends TwirpContext = TwirpContext> {
    onMatch: (ctx: T) => Promise<void> | void;
    onNotFound: () => Promise<void> | void;
}
declare type keys<T extends object> = Array<keyof T>;
/**
 * Runtime server implementation of a TwirpServer
 */
export declare class TwirpServer<T extends object, S extends TwirpContext = TwirpContext> {
    readonly packageName: string;
    readonly serviceName: string;
    readonly methodList: keys<T>;
    private service;
    private pathPrefix;
    private hooks;
    private interceptors;
    private matchRoute;
    constructor(options: TwirpServerOptions<T, S>);
    /**
     * Returns the prefix for this server
     */
    get prefix(): string;
    /**
     * The http handler for twirp complaint endpoints
     * @param options
     */
    httpHandler(options?: HttpHandlerOptions): (req: http.IncomingMessage, resp: http.ServerResponse) => Promise<void>;
    /**
     * Adds interceptors or hooks to the request stack
     * @param middlewares
     */
    use(...middlewares: (ServerHooks<S> | Interceptor<S, any, any>)[]): this;
    /**
     * Adds a prefix to the service url path
     * @param prefix
     */
    withPrefix(prefix: string | false): this;
    /**
     * Returns the regex matching path for this twirp server
     */
    matchingPath(): RegExp;
    /**
     * Returns the base URI for this twirp server
     */
    baseURI(): string;
    /**
     * Create a twirp context
     * @param req
     * @param res
     * @private
     */
    protected createContext(req: http.IncomingMessage, res: http.ServerResponse): S;
    /**
     * Twrip server http handler implementation
     * @param req
     * @param resp
     * @private
     */
    private _httpHandler;
    /**
     * Invoke a hook
     * @param hookName
     * @param ctx
     * @param err
     * @protected
     */
    protected invokeHook(hookName: keyof ServerHooks<S>, ctx: S, err?: TwirpError): Promise<void>;
}
/**
 * Write http error response
 * @param res
 * @param error
 */
export declare function writeError(res: http.ServerResponse, error: Error | TwirpError): void;
export {};
