import { Lru } from "toad-cache";
import type { InstallationAuthOptions, Cache, CacheData, InstallationAccessTokenData } from "./types.js";
export declare function getCache(): Lru<string>;
export declare function get(cache: Cache, options: InstallationAuthOptions): Promise<InstallationAccessTokenData | void>;
export declare function set(cache: Cache, options: InstallationAuthOptions, data: CacheData): Promise<void>;
