import { Lru } from "toad-cache";
import type { CacheableInstallationAuthOptions, Cache, CacheData, InstallationAccessTokenData } from "./types.js";
export declare function getCache(): Lru<string>;
export declare function get(cache: Cache, options: CacheableInstallationAuthOptions): Promise<InstallationAccessTokenData | void>;
export declare function set(cache: Cache, options: CacheableInstallationAuthOptions, data: CacheData): Promise<void>;
export declare function optionsToCacheKey({ installationId, permissions, repositoryIds, repositoryNames, }: CacheableInstallationAuthOptions): string;
