/// <reference types="node" />
import * as http from "http";
import { MatchFunction, MatchResult } from "path-to-regexp";
import { HttpClientOptions } from "./http.client";
export declare enum Pattern {
    POST = "post",
    GET = "get",
    PATCH = "patch",
    PUT = "put",
    DELETE = "delete"
}
export interface HttpRoute {
    serviceName: string;
    methodName: string;
    packageName: string;
    matchingPath: string;
    matcher: MatchFunction;
    httpMethod: Pattern;
    bodyKey?: string;
    responseBodyKey?: string;
    additionalBindings?: HttpRoute;
}
declare type RouteRules = {
    [key in Pattern]: HttpRoute[];
};
/**
 * The Gateway proxies http requests to Twirp Compliant
 * handlers
 */
export declare class Gateway {
    readonly routes: RouteRules;
    constructor(routes: RouteRules);
    /**
     * Middleware that rewrite the current request
     * to a Twirp compliant request
     */
    twirpRewrite(prefix?: string): (req: http.IncomingMessage, resp: http.ServerResponse, next: (err?: Error | undefined) => void) => void;
    /**
     * Rewrite an incoming request to a Twirp compliant request
     * @param req
     * @param resp
     * @param prefix
     */
    rewrite(req: http.IncomingMessage, resp: http.ServerResponse, prefix?: string): Promise<void>;
    /**
     * Create a reverse proxy handler to
     * proxy http requests to Twirp Compliant handlers
     * @param httpClientOption
     */
    reverseProxy(httpClientOption: HttpClientOptions): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;
    /**
     * Prepares twirp body requests using http.google.annotions
     * compliant spec
     *
     * @param req
     * @param match
     * @param route
     * @protected
     */
    protected prepareTwirpBody(req: http.IncomingMessage, match: MatchResult, route: HttpRoute): Promise<Record<string, any>>;
    /**
     * Matches a route
     * @param req
     */
    matchRoute(req: http.IncomingMessage): [MatchResult, HttpRoute];
    /**
     * Parse query string
     * @param queryString
     */
    parseQueryString(queryString: string): object;
}
export {};
