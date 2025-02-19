import type { StrategyInterface, Options, Authentication } from "./types.js";
export type Types = {
    StrategyOptions: Options;
    AuthOptions: never;
    Authentication: Authentication;
};
export declare const createUnauthenticatedAuth: StrategyInterface;
