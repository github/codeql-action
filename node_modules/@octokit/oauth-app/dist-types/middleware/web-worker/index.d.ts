import type { OAuthApp } from "../../index.js";
import type { HandlerOptions } from "../types.js";
import type { ClientType, Options } from "../../types.js";
export declare function createWebWorkerHandler<T extends Options<ClientType>>(app: OAuthApp<T>, options?: HandlerOptions): (request: Request) => Promise<Response | undefined>;
