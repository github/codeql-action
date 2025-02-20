import type { Webhooks } from "../../index.js";
import type { MiddlewareOptions } from "./types.js";
export declare function createNodeMiddleware(webhooks: Webhooks, { path, log, }?: MiddlewareOptions): (request: import("http").IncomingMessage, response: import("http").ServerResponse<import("http").IncomingMessage>, next?: Function | undefined) => Promise<boolean>;
