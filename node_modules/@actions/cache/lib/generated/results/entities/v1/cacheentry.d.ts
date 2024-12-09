import type { BinaryWriteOptions } from "@protobuf-ts/runtime";
import type { IBinaryWriter } from "@protobuf-ts/runtime";
import type { BinaryReadOptions } from "@protobuf-ts/runtime";
import type { IBinaryReader } from "@protobuf-ts/runtime";
import type { PartialMessage } from "@protobuf-ts/runtime";
import { MessageType } from "@protobuf-ts/runtime";
import { Timestamp } from "../../../google/protobuf/timestamp";
/**
 * @generated from protobuf message github.actions.results.entities.v1.CacheEntry
 */
export interface CacheEntry {
    /**
     * An explicit key for a cache entry
     *
     * @generated from protobuf field: string key = 1;
     */
    key: string;
    /**
     * SHA256 hex digest of the cache archive
     *
     * @generated from protobuf field: string hash = 2;
     */
    hash: string;
    /**
     * Cache entry size in bytes
     *
     * @generated from protobuf field: int64 size_bytes = 3;
     */
    sizeBytes: string;
    /**
     * Access scope
     *
     * @generated from protobuf field: string scope = 4;
     */
    scope: string;
    /**
     * Version SHA256 hex digest
     *
     * @generated from protobuf field: string version = 5;
     */
    version: string;
    /**
     * When the cache entry was created
     *
     * @generated from protobuf field: google.protobuf.Timestamp created_at = 6;
     */
    createdAt?: Timestamp;
    /**
     * When the cache entry was last accessed
     *
     * @generated from protobuf field: google.protobuf.Timestamp last_accessed_at = 7;
     */
    lastAccessedAt?: Timestamp;
    /**
     * When the cache entry is set to expire
     *
     * @generated from protobuf field: google.protobuf.Timestamp expires_at = 8;
     */
    expiresAt?: Timestamp;
}
declare class CacheEntry$Type extends MessageType<CacheEntry> {
    constructor();
    create(value?: PartialMessage<CacheEntry>): CacheEntry;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: CacheEntry): CacheEntry;
    internalBinaryWrite(message: CacheEntry, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.entities.v1.CacheEntry
 */
export declare const CacheEntry: CacheEntry$Type;
export {};
