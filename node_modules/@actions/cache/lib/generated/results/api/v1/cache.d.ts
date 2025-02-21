import { ServiceType } from "@protobuf-ts/runtime-rpc";
import type { BinaryWriteOptions } from "@protobuf-ts/runtime";
import type { IBinaryWriter } from "@protobuf-ts/runtime";
import type { BinaryReadOptions } from "@protobuf-ts/runtime";
import type { IBinaryReader } from "@protobuf-ts/runtime";
import type { PartialMessage } from "@protobuf-ts/runtime";
import { MessageType } from "@protobuf-ts/runtime";
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
/**
 * @generated ServiceType for protobuf service github.actions.results.api.v1.CacheService
 */
export declare const CacheService: ServiceType;
export {};
