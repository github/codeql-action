import type { CacheData, InstallationAccessTokenAuthentication, WithInstallationId } from "./types.js";
export declare function toTokenAuthentication({ installationId, token, createdAt, expiresAt, repositorySelection, permissions, repositoryIds, repositoryNames, singleFileName, }: CacheData & WithInstallationId): InstallationAccessTokenAuthentication;
