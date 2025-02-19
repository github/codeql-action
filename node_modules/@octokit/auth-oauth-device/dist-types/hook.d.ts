import type { RequestInterface, OctokitResponse, EndpointOptions, RequestParameters, Route } from "@octokit/types";
import type { OAuthAppState, GitHubAppState } from "./types.js";
export declare function hook(state: OAuthAppState | GitHubAppState, request: RequestInterface, route: Route | EndpointOptions, parameters?: RequestParameters): Promise<OctokitResponse<any>>;
