import { ServiceType } from "@protobuf-ts/runtime-rpc";
import type { BinaryWriteOptions } from "@protobuf-ts/runtime";
import type { IBinaryWriter } from "@protobuf-ts/runtime";
import type { BinaryReadOptions } from "@protobuf-ts/runtime";
import type { IBinaryReader } from "@protobuf-ts/runtime";
import type { PartialMessage } from "@protobuf-ts/runtime";
import { MessageType } from "@protobuf-ts/runtime";
import { CacheEntry } from "../../entities/v1/cacheentry";
import { CacheMetadata } from "../../entities/v1/cachemetadata";
/**
 * @generated from protobuf message github.actions.results.api.v1.CreateCacheEntryRequest
 */
export interface CreateCacheEntryRequest {
    /**
     * Scope and other metadata for the cache entry
     *
     * @generated from protobuf field: github.actions.results.entities.v1.CacheMetadata metadata = 1;
     */
    metadata?: CacheMetadata;
    /**
     * An explicit key for a cache entry
     *
     * @generated from protobuf field: string key = 2;
     */
    key: string;
    /**
     * Hash of the compression tool, runner OS and paths cached
     *
     * @generated from protobuf field: string version = 3;
     */
    version: string;
}
/**
 * @generated from protobuf message github.actions.results.api.v1.CreateCacheEntryResponse
 */
export interface CreateCacheEntryResponse {
    /**
     * @generated from protobuf field: bool ok = 1;
     */
    ok: boolean;
    /**
     * SAS URL to upload the cache archive
     *
     * @generated from protobuf field: string signed_upload_url = 2;
     */
    signedUploadUrl: string;
}
/**
 * @generated from protobuf message github.actions.results.api.v1.FinalizeCacheEntryUploadRequest
 */
export interface FinalizeCacheEntryUploadRequest {
    /**
     * Scope and other metadata for the cache entry
     *
     * @generated from protobuf field: github.actions.results.entities.v1.CacheMetadata metadata = 1;
     */
    metadata?: CacheMetadata;
    /**
     * An explicit key for a cache entry
     *
     * @generated from protobuf field: string key = 2;
     */
    key: string;
    /**
     * Size of the cache archive in Bytes
     *
     * @generated from protobuf field: int64 size_bytes = 3;
     */
    sizeBytes: string;
    /**
     * Hash of the compression tool, runner OS and paths cached
     *
     * @generated from protobuf field: string version = 4;
     */
    version: string;
}
/**
 * @generated from protobuf message github.actions.results.api.v1.FinalizeCacheEntryUploadResponse
 */
export interface FinalizeCacheEntryUploadResponse {
    /**
     * @generated from protobuf field: bool ok = 1;
     */
    ok: boolean;
    /**
     * Cache entry database ID
     *
     * @generated from protobuf field: int64 entry_id = 2;
     */
    entryId: string;
}
/**
 * @generated from protobuf message github.actions.results.api.v1.GetCacheEntryDownloadURLRequest
 */
export interface GetCacheEntryDownloadURLRequest {
    /**
     * Scope and other metadata for the cache entry
     *
     * @generated from protobuf field: github.actions.results.entities.v1.CacheMetadata metadata = 1;
     */
    metadata?: CacheMetadata;
    /**
     * An explicit key for a cache entry
     *
     * @generated from protobuf field: string key = 2;
     */
    key: string;
    /**
     * Restore keys used for prefix searching
     *
     * @generated from protobuf field: repeated string restore_keys = 3;
     */
    restoreKeys: string[];
    /**
     * Hash of the compression tool, runner OS and paths cached
     *
     * @generated from protobuf field: string version = 4;
     */
    version: string;
}
/**
 * @generated from protobuf message github.actions.results.api.v1.GetCacheEntryDownloadURLResponse
 */
export interface GetCacheEntryDownloadURLResponse {
    /**
     * @generated from protobuf field: bool ok = 1;
     */
    ok: boolean;
    /**
     * SAS URL to download the cache archive
     *
     * @generated from protobuf field: string signed_download_url = 2;
     */
    signedDownloadUrl: string;
    /**
     * Key or restore key that matches the lookup
     *
     * @generated from protobuf field: string matched_key = 3;
     */
    matchedKey: string;
}
/**
 * @generated from protobuf message github.actions.results.api.v1.DeleteCacheEntryRequest
 */
export interface DeleteCacheEntryRequest {
    /**
     * Scope and other metadata for the cache entry
     *
     * @generated from protobuf field: github.actions.results.entities.v1.CacheMetadata metadata = 1;
     */
    metadata?: CacheMetadata;
    /**
     * An explicit key for a cache entry
     *
     * @generated from protobuf field: string key = 2;
     */
    key: string;
}
/**
 * @generated from protobuf message github.actions.results.api.v1.DeleteCacheEntryResponse
 */
export interface DeleteCacheEntryResponse {
    /**
     * @generated from protobuf field: bool ok = 1;
     */
    ok: boolean;
    /**
     * Cache entry database ID
     *
     * @generated from protobuf field: int64 entry_id = 2;
     */
    entryId: string;
}
/**
 * @generated from protobuf message github.actions.results.api.v1.ListCacheEntriesRequest
 */
export interface ListCacheEntriesRequest {
    /**
     * Scope and other metadata for the cache entry
     *
     * @generated from protobuf field: github.actions.results.entities.v1.CacheMetadata metadata = 1;
     */
    metadata?: CacheMetadata;
    /**
     * An explicit key for a cache entry
     *
     * @generated from protobuf field: string key = 2;
     */
    key: string;
    /**
     * Restore keys used for prefix searching
     *
     * @generated from protobuf field: repeated string restore_keys = 3;
     */
    restoreKeys: string[];
}
/**
 * @generated from protobuf message github.actions.results.api.v1.ListCacheEntriesResponse
 */
export interface ListCacheEntriesResponse {
    /**
     * Cache entries in the defined scope
     *
     * @generated from protobuf field: repeated github.actions.results.entities.v1.CacheEntry entries = 1;
     */
    entries: CacheEntry[];
}
/**
 * @generated from protobuf message github.actions.results.api.v1.LookupCacheEntryRequest
 */
export interface LookupCacheEntryRequest {
    /**
     * Scope and other metadata for the cache entry
     *
     * @generated from protobuf field: github.actions.results.entities.v1.CacheMetadata metadata = 1;
     */
    metadata?: CacheMetadata;
    /**
     * An explicit key for a cache entry
     *
     * @generated from protobuf field: string key = 2;
     */
    key: string;
    /**
     * Restore keys used for prefix searching
     *
     * @generated from protobuf field: repeated string restore_keys = 3;
     */
    restoreKeys: string[];
    /**
     * Hash of the compression tool, runner OS and paths cached
     *
     * @generated from protobuf field: string version = 4;
     */
    version: string;
}
/**
 * @generated from protobuf message github.actions.results.api.v1.LookupCacheEntryResponse
 */
export interface LookupCacheEntryResponse {
    /**
     * Indicates whether the cache entry exists or not
     *
     * @generated from protobuf field: bool exists = 1;
     */
    exists: boolean;
    /**
     * Matched cache entry metadata
     *
     * @generated from protobuf field: github.actions.results.entities.v1.CacheEntry entry = 2;
     */
    entry?: CacheEntry;
}
declare class CreateCacheEntryRequest$Type extends MessageType<CreateCacheEntryRequest> {
    constructor();
    create(value?: PartialMessage<CreateCacheEntryRequest>): CreateCacheEntryRequest;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: CreateCacheEntryRequest): CreateCacheEntryRequest;
    internalBinaryWrite(message: CreateCacheEntryRequest, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.CreateCacheEntryRequest
 */
export declare const CreateCacheEntryRequest: CreateCacheEntryRequest$Type;
declare class CreateCacheEntryResponse$Type extends MessageType<CreateCacheEntryResponse> {
    constructor();
    create(value?: PartialMessage<CreateCacheEntryResponse>): CreateCacheEntryResponse;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: CreateCacheEntryResponse): CreateCacheEntryResponse;
    internalBinaryWrite(message: CreateCacheEntryResponse, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.CreateCacheEntryResponse
 */
export declare const CreateCacheEntryResponse: CreateCacheEntryResponse$Type;
declare class FinalizeCacheEntryUploadRequest$Type extends MessageType<FinalizeCacheEntryUploadRequest> {
    constructor();
    create(value?: PartialMessage<FinalizeCacheEntryUploadRequest>): FinalizeCacheEntryUploadRequest;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: FinalizeCacheEntryUploadRequest): FinalizeCacheEntryUploadRequest;
    internalBinaryWrite(message: FinalizeCacheEntryUploadRequest, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.FinalizeCacheEntryUploadRequest
 */
export declare const FinalizeCacheEntryUploadRequest: FinalizeCacheEntryUploadRequest$Type;
declare class FinalizeCacheEntryUploadResponse$Type extends MessageType<FinalizeCacheEntryUploadResponse> {
    constructor();
    create(value?: PartialMessage<FinalizeCacheEntryUploadResponse>): FinalizeCacheEntryUploadResponse;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: FinalizeCacheEntryUploadResponse): FinalizeCacheEntryUploadResponse;
    internalBinaryWrite(message: FinalizeCacheEntryUploadResponse, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.FinalizeCacheEntryUploadResponse
 */
export declare const FinalizeCacheEntryUploadResponse: FinalizeCacheEntryUploadResponse$Type;
declare class GetCacheEntryDownloadURLRequest$Type extends MessageType<GetCacheEntryDownloadURLRequest> {
    constructor();
    create(value?: PartialMessage<GetCacheEntryDownloadURLRequest>): GetCacheEntryDownloadURLRequest;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: GetCacheEntryDownloadURLRequest): GetCacheEntryDownloadURLRequest;
    internalBinaryWrite(message: GetCacheEntryDownloadURLRequest, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.GetCacheEntryDownloadURLRequest
 */
export declare const GetCacheEntryDownloadURLRequest: GetCacheEntryDownloadURLRequest$Type;
declare class GetCacheEntryDownloadURLResponse$Type extends MessageType<GetCacheEntryDownloadURLResponse> {
    constructor();
    create(value?: PartialMessage<GetCacheEntryDownloadURLResponse>): GetCacheEntryDownloadURLResponse;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: GetCacheEntryDownloadURLResponse): GetCacheEntryDownloadURLResponse;
    internalBinaryWrite(message: GetCacheEntryDownloadURLResponse, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.GetCacheEntryDownloadURLResponse
 */
export declare const GetCacheEntryDownloadURLResponse: GetCacheEntryDownloadURLResponse$Type;
declare class DeleteCacheEntryRequest$Type extends MessageType<DeleteCacheEntryRequest> {
    constructor();
    create(value?: PartialMessage<DeleteCacheEntryRequest>): DeleteCacheEntryRequest;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: DeleteCacheEntryRequest): DeleteCacheEntryRequest;
    internalBinaryWrite(message: DeleteCacheEntryRequest, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.DeleteCacheEntryRequest
 */
export declare const DeleteCacheEntryRequest: DeleteCacheEntryRequest$Type;
declare class DeleteCacheEntryResponse$Type extends MessageType<DeleteCacheEntryResponse> {
    constructor();
    create(value?: PartialMessage<DeleteCacheEntryResponse>): DeleteCacheEntryResponse;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: DeleteCacheEntryResponse): DeleteCacheEntryResponse;
    internalBinaryWrite(message: DeleteCacheEntryResponse, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.DeleteCacheEntryResponse
 */
export declare const DeleteCacheEntryResponse: DeleteCacheEntryResponse$Type;
declare class ListCacheEntriesRequest$Type extends MessageType<ListCacheEntriesRequest> {
    constructor();
    create(value?: PartialMessage<ListCacheEntriesRequest>): ListCacheEntriesRequest;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: ListCacheEntriesRequest): ListCacheEntriesRequest;
    internalBinaryWrite(message: ListCacheEntriesRequest, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.ListCacheEntriesRequest
 */
export declare const ListCacheEntriesRequest: ListCacheEntriesRequest$Type;
declare class ListCacheEntriesResponse$Type extends MessageType<ListCacheEntriesResponse> {
    constructor();
    create(value?: PartialMessage<ListCacheEntriesResponse>): ListCacheEntriesResponse;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: ListCacheEntriesResponse): ListCacheEntriesResponse;
    internalBinaryWrite(message: ListCacheEntriesResponse, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.ListCacheEntriesResponse
 */
export declare const ListCacheEntriesResponse: ListCacheEntriesResponse$Type;
declare class LookupCacheEntryRequest$Type extends MessageType<LookupCacheEntryRequest> {
    constructor();
    create(value?: PartialMessage<LookupCacheEntryRequest>): LookupCacheEntryRequest;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: LookupCacheEntryRequest): LookupCacheEntryRequest;
    internalBinaryWrite(message: LookupCacheEntryRequest, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.LookupCacheEntryRequest
 */
export declare const LookupCacheEntryRequest: LookupCacheEntryRequest$Type;
declare class LookupCacheEntryResponse$Type extends MessageType<LookupCacheEntryResponse> {
    constructor();
    create(value?: PartialMessage<LookupCacheEntryResponse>): LookupCacheEntryResponse;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: LookupCacheEntryResponse): LookupCacheEntryResponse;
    internalBinaryWrite(message: LookupCacheEntryResponse, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.api.v1.LookupCacheEntryResponse
 */
export declare const LookupCacheEntryResponse: LookupCacheEntryResponse$Type;
/**
 * @generated ServiceType for protobuf service github.actions.results.api.v1.CacheService
 */
export declare const CacheService: ServiceType;
export {};
