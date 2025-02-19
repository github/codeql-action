type IncomingMessage = any;
type ServerResponse = any;
import type { OAuthApp } from "../../index.js";
import type { HandlerOptions } from "../types.js";
import type { ClientType, Options } from "../../types.js";
export declare function createNodeMiddleware(app: OAuthApp<Options<ClientType>>, options?: HandlerOptions): (request: IncomingMessage, response: ServerResponse, next?: Function) => Promise<boolean>;
export {};
