import { CompressionMethod } from './constants';
import { ArtifactCacheEntry, InternalCacheOptions } from './contracts';
import { DownloadOptions, UploadOptions } from '../options';
export declare function getCacheVersion(paths: string[], compressionMethod?: CompressionMethod): string;
export declare function getCacheEntry(keys: string[], paths: string[], options?: InternalCacheOptions): Promise<ArtifactCacheEntry | null>;
export declare function downloadCache(archiveLocation: string, archivePath: string, options?: DownloadOptions): Promise<void>;
export declare function reserveCache(key: string, paths: string[], options?: InternalCacheOptions): Promise<number>;
export declare function saveCache(cacheId: number, archivePath: string, options?: UploadOptions): Promise<void>;
