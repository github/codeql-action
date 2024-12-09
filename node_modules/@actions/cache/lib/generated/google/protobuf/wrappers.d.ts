import type { BinaryWriteOptions } from "@protobuf-ts/runtime";
import type { IBinaryWriter } from "@protobuf-ts/runtime";
import type { BinaryReadOptions } from "@protobuf-ts/runtime";
import type { IBinaryReader } from "@protobuf-ts/runtime";
import type { PartialMessage } from "@protobuf-ts/runtime";
import type { JsonValue } from "@protobuf-ts/runtime";
import type { JsonReadOptions } from "@protobuf-ts/runtime";
import type { JsonWriteOptions } from "@protobuf-ts/runtime";
import { MessageType } from "@protobuf-ts/runtime";
/**
 * Wrapper message for `double`.
 *
 * The JSON representation for `DoubleValue` is JSON number.
 *
 * @generated from protobuf message google.protobuf.DoubleValue
 */
export interface DoubleValue {
    /**
     * The double value.
     *
     * @generated from protobuf field: double value = 1;
     */
    value: number;
}
/**
 * Wrapper message for `float`.
 *
 * The JSON representation for `FloatValue` is JSON number.
 *
 * @generated from protobuf message google.protobuf.FloatValue
 */
export interface FloatValue {
    /**
     * The float value.
     *
     * @generated from protobuf field: float value = 1;
     */
    value: number;
}
/**
 * Wrapper message for `int64`.
 *
 * The JSON representation for `Int64Value` is JSON string.
 *
 * @generated from protobuf message google.protobuf.Int64Value
 */
export interface Int64Value {
    /**
     * The int64 value.
     *
     * @generated from protobuf field: int64 value = 1;
     */
    value: string;
}
/**
 * Wrapper message for `uint64`.
 *
 * The JSON representation for `UInt64Value` is JSON string.
 *
 * @generated from protobuf message google.protobuf.UInt64Value
 */
export interface UInt64Value {
    /**
     * The uint64 value.
     *
     * @generated from protobuf field: uint64 value = 1;
     */
    value: string;
}
/**
 * Wrapper message for `int32`.
 *
 * The JSON representation for `Int32Value` is JSON number.
 *
 * @generated from protobuf message google.protobuf.Int32Value
 */
export interface Int32Value {
    /**
     * The int32 value.
     *
     * @generated from protobuf field: int32 value = 1;
     */
    value: number;
}
/**
 * Wrapper message for `uint32`.
 *
 * The JSON representation for `UInt32Value` is JSON number.
 *
 * @generated from protobuf message google.protobuf.UInt32Value
 */
export interface UInt32Value {
    /**
     * The uint32 value.
     *
     * @generated from protobuf field: uint32 value = 1;
     */
    value: number;
}
/**
 * Wrapper message for `bool`.
 *
 * The JSON representation for `BoolValue` is JSON `true` and `false`.
 *
 * @generated from protobuf message google.protobuf.BoolValue
 */
export interface BoolValue {
    /**
     * The bool value.
     *
     * @generated from protobuf field: bool value = 1;
     */
    value: boolean;
}
/**
 * Wrapper message for `string`.
 *
 * The JSON representation for `StringValue` is JSON string.
 *
 * @generated from protobuf message google.protobuf.StringValue
 */
export interface StringValue {
    /**
     * The string value.
     *
     * @generated from protobuf field: string value = 1;
     */
    value: string;
}
/**
 * Wrapper message for `bytes`.
 *
 * The JSON representation for `BytesValue` is JSON string.
 *
 * @generated from protobuf message google.protobuf.BytesValue
 */
export interface BytesValue {
    /**
     * The bytes value.
     *
     * @generated from protobuf field: bytes value = 1;
     */
    value: Uint8Array;
}
declare class DoubleValue$Type extends MessageType<DoubleValue> {
    constructor();
    /**
     * Encode `DoubleValue` to JSON number.
     */
    internalJsonWrite(message: DoubleValue, options: JsonWriteOptions): JsonValue;
    /**
     * Decode `DoubleValue` from JSON number.
     */
    internalJsonRead(json: JsonValue, options: JsonReadOptions, target?: DoubleValue): DoubleValue;
    create(value?: PartialMessage<DoubleValue>): DoubleValue;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: DoubleValue): DoubleValue;
    internalBinaryWrite(message: DoubleValue, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message google.protobuf.DoubleValue
 */
export declare const DoubleValue: DoubleValue$Type;
declare class FloatValue$Type extends MessageType<FloatValue> {
    constructor();
    /**
     * Encode `FloatValue` to JSON number.
     */
    internalJsonWrite(message: FloatValue, options: JsonWriteOptions): JsonValue;
    /**
     * Decode `FloatValue` from JSON number.
     */
    internalJsonRead(json: JsonValue, options: JsonReadOptions, target?: FloatValue): FloatValue;
    create(value?: PartialMessage<FloatValue>): FloatValue;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: FloatValue): FloatValue;
    internalBinaryWrite(message: FloatValue, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message google.protobuf.FloatValue
 */
export declare const FloatValue: FloatValue$Type;
declare class Int64Value$Type extends MessageType<Int64Value> {
    constructor();
    /**
     * Encode `Int64Value` to JSON string.
     */
    internalJsonWrite(message: Int64Value, options: JsonWriteOptions): JsonValue;
    /**
     * Decode `Int64Value` from JSON string.
     */
    internalJsonRead(json: JsonValue, options: JsonReadOptions, target?: Int64Value): Int64Value;
    create(value?: PartialMessage<Int64Value>): Int64Value;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: Int64Value): Int64Value;
    internalBinaryWrite(message: Int64Value, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message google.protobuf.Int64Value
 */
export declare const Int64Value: Int64Value$Type;
declare class UInt64Value$Type extends MessageType<UInt64Value> {
    constructor();
    /**
     * Encode `UInt64Value` to JSON string.
     */
    internalJsonWrite(message: UInt64Value, options: JsonWriteOptions): JsonValue;
    /**
     * Decode `UInt64Value` from JSON string.
     */
    internalJsonRead(json: JsonValue, options: JsonReadOptions, target?: UInt64Value): UInt64Value;
    create(value?: PartialMessage<UInt64Value>): UInt64Value;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: UInt64Value): UInt64Value;
    internalBinaryWrite(message: UInt64Value, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message google.protobuf.UInt64Value
 */
export declare const UInt64Value: UInt64Value$Type;
declare class Int32Value$Type extends MessageType<Int32Value> {
    constructor();
    /**
     * Encode `Int32Value` to JSON string.
     */
    internalJsonWrite(message: Int32Value, options: JsonWriteOptions): JsonValue;
    /**
     * Decode `Int32Value` from JSON string.
     */
    internalJsonRead(json: JsonValue, options: JsonReadOptions, target?: Int32Value): Int32Value;
    create(value?: PartialMessage<Int32Value>): Int32Value;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: Int32Value): Int32Value;
    internalBinaryWrite(message: Int32Value, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message google.protobuf.Int32Value
 */
export declare const Int32Value: Int32Value$Type;
declare class UInt32Value$Type extends MessageType<UInt32Value> {
    constructor();
    /**
     * Encode `UInt32Value` to JSON string.
     */
    internalJsonWrite(message: UInt32Value, options: JsonWriteOptions): JsonValue;
    /**
     * Decode `UInt32Value` from JSON string.
     */
    internalJsonRead(json: JsonValue, options: JsonReadOptions, target?: UInt32Value): UInt32Value;
    create(value?: PartialMessage<UInt32Value>): UInt32Value;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: UInt32Value): UInt32Value;
    internalBinaryWrite(message: UInt32Value, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message google.protobuf.UInt32Value
 */
export declare const UInt32Value: UInt32Value$Type;
declare class BoolValue$Type extends MessageType<BoolValue> {
    constructor();
    /**
     * Encode `BoolValue` to JSON bool.
     */
    internalJsonWrite(message: BoolValue, options: JsonWriteOptions): JsonValue;
    /**
     * Decode `BoolValue` from JSON bool.
     */
    internalJsonRead(json: JsonValue, options: JsonReadOptions, target?: BoolValue): BoolValue;
    create(value?: PartialMessage<BoolValue>): BoolValue;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: BoolValue): BoolValue;
    internalBinaryWrite(message: BoolValue, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message google.protobuf.BoolValue
 */
export declare const BoolValue: BoolValue$Type;
declare class StringValue$Type extends MessageType<StringValue> {
    constructor();
    /**
     * Encode `StringValue` to JSON string.
     */
    internalJsonWrite(message: StringValue, options: JsonWriteOptions): JsonValue;
    /**
     * Decode `StringValue` from JSON string.
     */
    internalJsonRead(json: JsonValue, options: JsonReadOptions, target?: StringValue): StringValue;
    create(value?: PartialMessage<StringValue>): StringValue;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: StringValue): StringValue;
    internalBinaryWrite(message: StringValue, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message google.protobuf.StringValue
 */
export declare const StringValue: StringValue$Type;
declare class BytesValue$Type extends MessageType<BytesValue> {
    constructor();
    /**
     * Encode `BytesValue` to JSON string.
     */
    internalJsonWrite(message: BytesValue, options: JsonWriteOptions): JsonValue;
    /**
     * Decode `BytesValue` from JSON string.
     */
    internalJsonRead(json: JsonValue, options: JsonReadOptions, target?: BytesValue): BytesValue;
    create(value?: PartialMessage<BytesValue>): BytesValue;
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: BytesValue): BytesValue;
    internalBinaryWrite(message: BytesValue, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
}
/**
 * @generated MessageType for protobuf message google.protobuf.BytesValue
 */
export declare const BytesValue: BytesValue$Type;
export {};
