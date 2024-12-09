import type { BinaryWriteOptions } from "@protobuf-ts/runtime";
import type { IBinaryWriter } from "@protobuf-ts/runtime";
import type { BinaryReadOptions } from "@protobuf-ts/runtime";
import type { IBinaryReader } from "@protobuf-ts/runtime";
import type { PartialMessage } from "@protobuf-ts/runtime";
import { MessageType } from "@protobuf-ts/runtime";
/**
 * @generated from protobuf message github.actions.results.entities.v1.CacheScope
 */
export interface CacheScope {
    /**
     * Determines the scope of the cache entry
     *
     * @generated from protobuf field: string scope = 1;
     */
    scope: string;
    /**
     * None: 0 | Read: 1 | Write: 2 | All: (1|2)
     *
     * @generated from protobuf field: int64 permission = 2;
     */
    permission: string;
}
declare class CacheScope$Type extends MessageType<CacheScope> {
    constructor();
    create(value?: PartialMessage<CacheScope>): CacheScope;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: CacheScope): CacheScope;
    internalBinaryWrite(message: CacheScope, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message github.actions.results.entities.v1.CacheScope
 */
export declare const CacheScope: CacheScope$Type;
export {};
