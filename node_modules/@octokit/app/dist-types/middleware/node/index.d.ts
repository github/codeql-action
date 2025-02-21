type IncomingMessage = any;
type ServerResponse = any;
import type { App } from "../../index.js";
import type { Options } from "../../types.js";
export type MiddlewareOptions = {
    pathPrefix?: string;
    log?: Options["log"];
};
export declare function createNodeMiddleware(app: App, options?: MiddlewareOptions): (request: any, response: any, next?: Function | undefined) => Promise<boolean>;
export declare function middleware(pathPrefix: string, webhooksMiddleware: any, oauthMiddleware: any, request: IncomingMessage, response: ServerResponse, next?: Function): Promise<boolean>;
export {};
