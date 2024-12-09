/// <reference types="node" />
import { TwirpContext, TwirpServer } from "twirp-ts";
import { CreateCacheEntryRequest, CreateCacheEntryResponse, FinalizeCacheEntryUploadRequest, FinalizeCacheEntryUploadResponse, GetCacheEntryDownloadURLRequest, GetCacheEntryDownloadURLResponse, DeleteCacheEntryRequest, DeleteCacheEntryResponse, ListCacheEntriesRequest, ListCacheEntriesResponse, LookupCacheEntryRequest, LookupCacheEntryResponse } from "./cache";
interface Rpc {
    request(service: string, method: string, contentType: "application/json" | "application/protobuf", data: object | Uint8Array): Promise<object | Uint8Array>;
}
export interface CacheServiceClient {
    CreateCacheEntry(request: CreateCacheEntryRequest): Promise<CreateCacheEntryResponse>;
    FinalizeCacheEntryUpload(request: FinalizeCacheEntryUploadRequest): Promise<FinalizeCacheEntryUploadResponse>;
    GetCacheEntryDownloadURL(request: GetCacheEntryDownloadURLRequest): Promise<GetCacheEntryDownloadURLResponse>;
    DeleteCacheEntry(request: DeleteCacheEntryRequest): Promise<DeleteCacheEntryResponse>;
    ListCacheEntries(request: ListCacheEntriesRequest): Promise<ListCacheEntriesResponse>;
    LookupCacheEntry(request: LookupCacheEntryRequest): Promise<LookupCacheEntryResponse>;
}
export declare class CacheServiceClientJSON implements CacheServiceClient {
    private readonly rpc;
    constructor(rpc: Rpc);
    CreateCacheEntry(request: CreateCacheEntryRequest): Promise<CreateCacheEntryResponse>;
    FinalizeCacheEntryUpload(request: FinalizeCacheEntryUploadRequest): Promise<FinalizeCacheEntryUploadResponse>;
    GetCacheEntryDownloadURL(request: GetCacheEntryDownloadURLRequest): Promise<GetCacheEntryDownloadURLResponse>;
    DeleteCacheEntry(request: DeleteCacheEntryRequest): Promise<DeleteCacheEntryResponse>;
    ListCacheEntries(request: ListCacheEntriesRequest): Promise<ListCacheEntriesResponse>;
    LookupCacheEntry(request: LookupCacheEntryRequest): Promise<LookupCacheEntryResponse>;
}
export declare class CacheServiceClientProtobuf implements CacheServiceClient {
    private readonly rpc;
    constructor(rpc: Rpc);
    CreateCacheEntry(request: CreateCacheEntryRequest): Promise<CreateCacheEntryResponse>;
    FinalizeCacheEntryUpload(request: FinalizeCacheEntryUploadRequest): Promise<FinalizeCacheEntryUploadResponse>;
    GetCacheEntryDownloadURL(request: GetCacheEntryDownloadURLRequest): Promise<GetCacheEntryDownloadURLResponse>;
    DeleteCacheEntry(request: DeleteCacheEntryRequest): Promise<DeleteCacheEntryResponse>;
    ListCacheEntries(request: ListCacheEntriesRequest): Promise<ListCacheEntriesResponse>;
    LookupCacheEntry(request: LookupCacheEntryRequest): Promise<LookupCacheEntryResponse>;
}
export interface CacheServiceTwirp<T extends TwirpContext = TwirpContext> {
    CreateCacheEntry(ctx: T, request: CreateCacheEntryRequest): Promise<CreateCacheEntryResponse>;
    FinalizeCacheEntryUpload(ctx: T, request: FinalizeCacheEntryUploadRequest): Promise<FinalizeCacheEntryUploadResponse>;
    GetCacheEntryDownloadURL(ctx: T, request: GetCacheEntryDownloadURLRequest): Promise<GetCacheEntryDownloadURLResponse>;
    DeleteCacheEntry(ctx: T, request: DeleteCacheEntryRequest): Promise<DeleteCacheEntryResponse>;
    ListCacheEntries(ctx: T, request: ListCacheEntriesRequest): Promise<ListCacheEntriesResponse>;
    LookupCacheEntry(ctx: T, request: LookupCacheEntryRequest): Promise<LookupCacheEntryResponse>;
}
export declare enum CacheServiceMethod {
    CreateCacheEntry = "CreateCacheEntry",
    FinalizeCacheEntryUpload = "FinalizeCacheEntryUpload",
    GetCacheEntryDownloadURL = "GetCacheEntryDownloadURL",
    DeleteCacheEntry = "DeleteCacheEntry",
    ListCacheEntries = "ListCacheEntries",
    LookupCacheEntry = "LookupCacheEntry"
}
export declare const CacheServiceMethodList: CacheServiceMethod[];
export declare function createCacheServiceServer<T extends TwirpContext = TwirpContext>(service: CacheServiceTwirp<T>): TwirpServer<CacheServiceTwirp<TwirpContext<import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>>>, T>;
export {};
