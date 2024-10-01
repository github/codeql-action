import { ServiceType } from "@protobuf-ts/runtime-rpc";
import type { BinaryWriteOptions } from "@protobuf-ts/runtime";
import type { IBinaryWriter } from "@protobuf-ts/runtime";
import type { BinaryReadOptions } from "@protobuf-ts/runtime";
import type { IBinaryReader } from "@protobuf-ts/runtime";
import { MessageType } from "@protobuf-ts/runtime";
/**
 * @generated from protobuf message twirp.example.haberdasher.FindHatRPC
 */
export interface FindHatRPC {
    /**
     * @generated from protobuf field: string hat_id = 1;
     */
    hatId: string;
}
/**
 * @generated from protobuf message twirp.example.haberdasher.ListHatRPC
 */
export interface ListHatRPC {
    /**
     * @generated from protobuf field: repeated twirp.example.haberdasher.Filter filters = 1;
     */
    filters: Filter[];
}
/**
 * Size of a Hat, in inches.
 *
 * @generated from protobuf message twirp.example.haberdasher.Size
 */
export interface Size {
    /**
     * @generated from protobuf field: int32 inches = 1;
     */
    inches: number;
}
/**
 * A Hat is a piece of headwear made by a Haberdasher.
 *
 * @generated from protobuf message twirp.example.haberdasher.Hat
 */
export interface Hat {
    /**
     * @generated from protobuf field: string id = 1;
     */
    id: string;
    /**
     * @generated from protobuf field: int32 inches = 2;
     */
    inches: number;
    /**
     * @generated from protobuf field: string color = 3;
     */
    color: string;
    /**
     * @generated from protobuf field: string name = 4;
     */
    name: string;
    /**
     * @generated from protobuf field: repeated twirp.example.haberdasher.Hat variants = 5;
     */
    variants: Hat[];
}
/**
 * @generated from protobuf message twirp.example.haberdasher.Filter
 */
export interface Filter {
    /**
     * @generated from protobuf field: string order_by = 1;
     */
    orderBy: string;
    /**
     * @generated from protobuf field: twirp.example.haberdasher.Pagination pagination = 2;
     */
    pagination?: Pagination;
}
/**
 * @generated from protobuf message twirp.example.haberdasher.Pagination
 */
export interface Pagination {
    /**
     * @generated from protobuf field: int32 limit = 1;
     */
    limit: number;
    /**
     * @generated from protobuf field: int32 offset = 2;
     */
    offset: number;
}
declare class FindHatRPC$Type extends MessageType<FindHatRPC> {
    constructor();
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: FindHatRPC): FindHatRPC;
    internalBinaryWrite(message: FindHatRPC, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message twirp.example.haberdasher.FindHatRPC
 */
export declare const FindHatRPC: FindHatRPC$Type;
declare class ListHatRPC$Type extends MessageType<ListHatRPC> {
    constructor();
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: ListHatRPC): ListHatRPC;
    internalBinaryWrite(message: ListHatRPC, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message twirp.example.haberdasher.ListHatRPC
 */
export declare const ListHatRPC: ListHatRPC$Type;
declare class Size$Type extends MessageType<Size> {
    constructor();
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: Size): Size;
    internalBinaryWrite(message: Size, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message twirp.example.haberdasher.Size
 */
export declare const Size: Size$Type;
declare class Hat$Type extends MessageType<Hat> {
    constructor();
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: Hat): Hat;
    internalBinaryWrite(message: Hat, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message twirp.example.haberdasher.Hat
 */
export declare const Hat: Hat$Type;
declare class Filter$Type extends MessageType<Filter> {
    constructor();
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: Filter): Filter;
    internalBinaryWrite(message: Filter, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message twirp.example.haberdasher.Filter
 */
export declare const Filter: Filter$Type;
declare class Pagination$Type extends MessageType<Pagination> {
    constructor();
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: Pagination): Pagination;
    internalBinaryWrite(message: Pagination, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message twirp.example.haberdasher.Pagination
 */
export declare const Pagination: Pagination$Type;
/**
 * @generated ServiceType for protobuf service twirp.example.haberdasher.Haberdasher
 */
export declare const Haberdasher: ServiceType;
export {};
