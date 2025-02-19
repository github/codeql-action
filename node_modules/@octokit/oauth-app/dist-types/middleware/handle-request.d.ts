import { OAuthApp } from "../index.js";
import type { HandlerOptions, OctokitRequest, OctokitResponse } from "./types.js";
import type { ClientType, Options } from "../types.js";
export declare function handleRequest(app: OAuthApp<Options<ClientType>>, { pathPrefix }: HandlerOptions, request: OctokitRequest): Promise<OctokitResponse | undefined>;
