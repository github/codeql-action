import type { BinaryWriteOptions } from "@protobuf-ts/runtime";
import type { IBinaryWriter } from "@protobuf-ts/runtime";
import type { BinaryReadOptions } from "@protobuf-ts/runtime";
import type { IBinaryReader } from "@protobuf-ts/runtime";
import type { PartialMessage } from "@protobuf-ts/runtime";
import { MessageType } from "@protobuf-ts/runtime";
import { CacheScope } from "./cachescope";
/**
 * @generated from protobuf message github.actions.results.entities.v1.CacheMetadata
 */
export interface CacheMetadata {
    /**
     * Backend repository id
     *
     * @generated from protobuf field: int64 repository_id = 1;
     */
    repositoryId: string;
    /**
     * Scopes for the cache entry
     *
     * @generated from protobuf field: repeated github.actions.results.entities.v1.CacheScope scope = 2;
     */
    scope: CacheScope[];
}
declare class CacheMetadata$Type extends MessageType<CacheMetadata> {
    constructor();
    create(value?: PartialMessage<CacheMetadata>): CacheMetadata;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: CacheMetadata): CacheMetadata;
    internalBinaryWrite(message: CacheMetadata, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.entities.v1.CacheMetadata
 */
export declare const CacheMetadata: CacheMetadata$Type;
export {};
