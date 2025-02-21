import type { OctokitResponse, StrategyInterface as OctokitStrategyInterface } from "@octokit/types";
export type AnyResponse = OctokitResponse<any>;
export type StrategyInterface = OctokitStrategyInterface<[
    Options
], [
], Authentication>;
export type { EndpointDefaults, EndpointOptions, RequestParameters, RequestInterface, Route, } from "@octokit/types";
export type Options = {
    reason: string;
};
export type Authentication = {
    type: "unauthenticated";
    reason: string;
};
