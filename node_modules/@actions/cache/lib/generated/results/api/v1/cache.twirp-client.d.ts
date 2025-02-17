import { CreateCacheEntryRequest, CreateCacheEntryResponse, FinalizeCacheEntryUploadRequest, FinalizeCacheEntryUploadResponse, GetCacheEntryDownloadURLRequest, GetCacheEntryDownloadURLResponse } from "./cache";
interface Rpc {
    request(service: string, method: string, contentType: "application/json" | "application/protobuf", data: object | Uint8Array): Promise<object | Uint8Array>;
}
export interface CacheServiceClient {
    CreateCacheEntry(request: CreateCacheEntryRequest): Promise<CreateCacheEntryResponse>;
    FinalizeCacheEntryUpload(request: FinalizeCacheEntryUploadRequest): Promise<FinalizeCacheEntryUploadResponse>;
    GetCacheEntryDownloadURL(request: GetCacheEntryDownloadURLRequest): Promise<GetCacheEntryDownloadURLResponse>;
}
export declare class CacheServiceClientJSON implements CacheServiceClient {
    private readonly rpc;
    constructor(rpc: Rpc);
    CreateCacheEntry(request: CreateCacheEntryRequest): Promise<CreateCacheEntryResponse>;
    FinalizeCacheEntryUpload(request: FinalizeCacheEntryUploadRequest): Promise<FinalizeCacheEntryUploadResponse>;
    GetCacheEntryDownloadURL(request: GetCacheEntryDownloadURLRequest): Promise<GetCacheEntryDownloadURLResponse>;
}
export declare class CacheServiceClientProtobuf implements CacheServiceClient {
    private readonly rpc;
    constructor(rpc: Rpc);
    CreateCacheEntry(request: CreateCacheEntryRequest): Promise<CreateCacheEntryResponse>;
    FinalizeCacheEntryUpload(request: FinalizeCacheEntryUploadRequest): Promise<FinalizeCacheEntryUploadResponse>;
    GetCacheEntryDownloadURL(request: GetCacheEntryDownloadURLRequest): Promise<GetCacheEntryDownloadURLResponse>;
}
export {};
