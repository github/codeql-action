import type { InstallationAuthOptions, InstallationAccessTokenAuthentication, RequestInterface, State } from "./types.js";
export declare function getInstallationAuthentication(state: State, options: InstallationAuthOptions, customRequest?: RequestInterface): Promise<InstallationAccessTokenAuthentication>;
