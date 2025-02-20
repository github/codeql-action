import type { IncomingMessage, ServerResponse } from "node:http";
import type { Webhooks } from "../../index.js";
import type { MiddlewareOptions } from "./types.js";
export declare function middleware(webhooks: Webhooks, options: Required<MiddlewareOptions>, request: IncomingMessage, response: ServerResponse, next?: Function): Promise<boolean>;
