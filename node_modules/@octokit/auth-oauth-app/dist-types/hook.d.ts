import type { EndpointOptions, RequestParameters, Route, RequestInterface, OctokitResponse } from "@octokit/types";
import type { OAuthAppState, GitHubAppState } from "./types.js";
export declare function hook(state: OAuthAppState | GitHubAppState, request: RequestInterface, route: Route | EndpointOptions, parameters?: RequestParameters): Promise<OctokitResponse<any>>;
