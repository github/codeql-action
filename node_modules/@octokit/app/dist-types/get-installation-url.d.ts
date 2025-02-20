import type { App } from "./index.js";
import type { GetInstallationUrlOptions } from "./types.js";
export declare function getInstallationUrlFactory(app: App): (options?: GetInstallationUrlOptions) => Promise<string>;
