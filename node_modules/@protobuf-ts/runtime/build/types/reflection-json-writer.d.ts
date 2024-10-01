import type { JsonValue } from "./json-typings";
import type { JsonWriteOptions } from "./json-format-contract";
import type { EnumInfo, FieldInfo, PartialMessageInfo } from "./reflection-info";
import { ScalarType } from "./reflection-info";
import type { IMessageType } from "./message-type-contract";
/**
 * Writes proto3 messages in canonical JSON format using reflection
 * information.
 *
 * https://developers.google.com/protocol-buffers/docs/proto3#json
 */
export declare class ReflectionJsonWriter {
    private readonly fields;
    constructor(info: PartialMessageInfo);
    /**
     * Converts the message to a JSON object, based on the field descriptors.
     */
    write<T extends object>(message: T, options: JsonWriteOptions): JsonValue;
    field(field: FieldInfo, value: unknown, options: JsonWriteOptions): JsonValue | undefined;
    /**
     * Returns `null` as the default for google.protobuf.NullValue.
     */
    enum(type: EnumInfo, value: unknown, fieldName: string, optional: boolean, emitDefaultValues: boolean, enumAsInteger: boolean): JsonValue | undefined;
    message(type: IMessageType<any>, value: unknown, fieldName: string, options: JsonWriteOptions): JsonValue | undefined;
    scalar(type: ScalarType, value: unknown, fieldName: string, optional: false, emitDefaultValues: boolean): JsonValue;
    scalar(type: ScalarType, value: unknown, fieldName: string, optional: boolean, emitDefaultValues: boolean): JsonValue | undefined;
}
