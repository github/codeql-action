import { Octokit as OctokitCore } from "@octokit/core";
import { OAuthApp } from "@octokit/oauth-app";
import type { Webhooks } from "@octokit/webhooks";
import type { Options, ConstructorOptions, EachInstallationInterface, EachRepositoryInterface, GetInstallationOctokitInterface, GetInstallationUrlInterface } from "./types.js";
export type { EachInstallationInterface, EachRepositoryInterface, GetInstallationOctokitInterface, GetInstallationUrlInterface, } from "./types.js";
type Constructor<T> = new (...args: any[]) => T;
type OctokitType<TOptions extends Options> = TOptions["Octokit"] extends typeof OctokitCore ? InstanceType<TOptions["Octokit"]> : OctokitCore;
type OctokitClassType<TOptions extends Options> = TOptions["Octokit"] extends typeof OctokitCore ? TOptions["Octokit"] : typeof OctokitCore;
export declare class App<TOptions extends Options = Options> {
    static VERSION: string;
    static defaults<TDefaults extends Options, S extends Constructor<App<TDefaults>>>(this: S, defaults: Partial<TDefaults>): ({
        new (...args: any[]): {
            octokit: OctokitType<TDefaults>;
            webhooks: Webhooks<{
                octokit: OctokitType<TDefaults>;
            }>;
            oauth: OAuthApp<{
                clientType: "github-app";
                Octokit: OctokitClassType<TDefaults>;
            }>;
            getInstallationOctokit: GetInstallationOctokitInterface<OctokitType<TDefaults>>;
            eachInstallation: EachInstallationInterface<OctokitType<TDefaults>>;
            eachRepository: EachRepositoryInterface<OctokitType<TDefaults>>;
            getInstallationUrl: GetInstallationUrlInterface;
            log: {
                debug: (message: string, additionalInfo?: object) => void;
                info: (message: string, additionalInfo?: object) => void;
                warn: (message: string, additionalInfo?: object) => void;
                error: (message: string, additionalInfo?: object) => void;
                [key: string]: unknown;
            };
        };
    } & S) & typeof this;
    octokit: OctokitType<TOptions>;
    webhooks: Webhooks<{
        octokit: OctokitType<TOptions>;
    }>;
    oauth: OAuthApp<{
        clientType: "github-app";
        Octokit: OctokitClassType<TOptions>;
    }>;
    getInstallationOctokit: GetInstallationOctokitInterface<OctokitType<TOptions>>;
    eachInstallation: EachInstallationInterface<OctokitType<TOptions>>;
    eachRepository: EachRepositoryInterface<OctokitType<TOptions>>;
    getInstallationUrl: GetInstallationUrlInterface;
    log: {
        debug: (message: string, additionalInfo?: object) => void;
        info: (message: string, additionalInfo?: object) => void;
        warn: (message: string, additionalInfo?: object) => void;
        error: (message: string, additionalInfo?: object) => void;
        [key: string]: unknown;
    };
    constructor(options: ConstructorOptions<TOptions>);
}
export { createNodeMiddleware } from "./middleware/node/index.js";
