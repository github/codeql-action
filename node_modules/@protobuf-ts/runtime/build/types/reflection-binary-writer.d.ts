import type { BinaryWriteOptions, IBinaryWriter } from "./binary-format-contract";
import { WireType } from "./binary-format-contract";
import type { FieldInfo } from "./reflection-info";
import { PartialMessageInfo, ScalarType } from "./reflection-info";
import type { IMessageType } from "./message-type-contract";
/**
 * Writes proto3 messages in binary format using reflection information.
 *
 * https://developers.google.com/protocol-buffers/docs/encoding
 */
export declare class ReflectionBinaryWriter {
    private readonly info;
    protected fields?: readonly FieldInfo[];
    constructor(info: PartialMessageInfo);
    protected prepare(): void;
    /**
     * Writes the message to binary format.
     */
    write<T extends object>(message: T, writer: IBinaryWriter, options: BinaryWriteOptions): void;
    protected mapEntry(writer: IBinaryWriter, options: BinaryWriteOptions, field: FieldInfo & {
        kind: 'map';
    }, key: any, value: any): void;
    protected message(writer: IBinaryWriter, options: BinaryWriteOptions, handler: IMessageType<any>, fieldNo: number, value: any): void;
    /**
     * Write a single scalar value.
     */
    protected scalar(writer: IBinaryWriter, type: ScalarType, fieldNo: number, value: any, emitDefault: boolean): void;
    /**
     * Write an array of scalar values in packed format.
     */
    protected packed(writer: IBinaryWriter, type: ScalarType, fieldNo: number, value: any[]): void;
    /**
     * Get information for writing a scalar value.
     *
     * Returns tuple:
     * [0]: appropriate WireType
     * [1]: name of the appropriate method of IBinaryWriter
     * [2]: whether the given value is a default value
     *
     * If argument `value` is omitted, [2] is always false.
     */
    protected scalarInfo(type: ScalarType, value?: any): [WireType, "int32" | "string" | "bool" | "uint32" | "double" | "float" | "int64" | "uint64" | "fixed64" | "bytes" | "fixed32" | "sfixed32" | "sfixed64" | "sint32" | "sint64", boolean];
}
