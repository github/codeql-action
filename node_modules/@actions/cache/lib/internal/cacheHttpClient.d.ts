import { ArtifactCacheEntry, InternalCacheOptions, ReserveCacheResponse, ITypedResponseWithError } from './contracts';
import { DownloadOptions, UploadOptions } from '../options';
export declare function getCacheEntry(keys: string[], paths: string[], options?: InternalCacheOptions): Promise<ArtifactCacheEntry | null>;
export declare function downloadCache(archiveLocation: string, archivePath: string, options?: DownloadOptions): Promise<void>;
export declare function reserveCache(key: string, paths: string[], options?: InternalCacheOptions): Promise<ITypedResponseWithError<ReserveCacheResponse>>;
export declare function saveCache(cacheId: number, archivePath: string, signedUploadURL?: string, options?: UploadOptions): Promise<void>;
