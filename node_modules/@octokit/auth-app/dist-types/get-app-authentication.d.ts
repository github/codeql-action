import type { AppAuthentication, State } from "./types.js";
export declare function getAppAuthentication({ appId, privateKey, timeDifference, }: State & {
    timeDifference?: number | undefined;
}): Promise<AppAuthentication>;
