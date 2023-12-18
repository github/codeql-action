import type { IMessageType, PartialMessage } from "./message-type-contract";
import type { FieldInfo, PartialFieldInfo } from "./reflection-info";
import { ReflectionTypeCheck } from "./reflection-type-check";
import { ReflectionJsonReader } from "./reflection-json-reader";
import { ReflectionJsonWriter } from "./reflection-json-writer";
import { ReflectionBinaryReader } from "./reflection-binary-reader";
import { ReflectionBinaryWriter } from "./reflection-binary-writer";
import type { JsonValue } from "./json-typings";
import type { JsonReadOptions, JsonWriteOptions, JsonWriteStringOptions } from "./json-format-contract";
import type { BinaryReadOptions, BinaryWriteOptions, IBinaryReader, IBinaryWriter } from "./binary-format-contract";
/**
 * This standard message type provides reflection-based
 * operations to work with a message.
 */
export declare class MessageType<T extends object> implements IMessageType<T> {
    /**
     * The protobuf type name of the message, including package and
     * parent types if present.
     *
     * If the .proto file included a `package` statement,
     * the type name will always start with a '.'.
     *
     * Examples:
     * 'MyNamespaceLessMessage'
     * '.my_package.MyMessage'
     * '.my_package.ParentMessage.ChildMessage'
     */
    readonly typeName: string;
    /**
     * Simple information for each message field, in the order
     * of declaration in the .proto.
     */
    readonly fields: readonly FieldInfo[];
    /**
     * Contains custom service options from the .proto source in JSON format.
     */
    readonly options: JsonOptionsMap;
    /**
     * Contains the prototype for messages returned by create() which
     * includes the `MESSAGE_TYPE` symbol pointing back to `this`.
     */
    readonly messagePrototype?: Readonly<{}> | undefined;
    protected readonly defaultCheckDepth = 16;
    protected readonly refTypeCheck: ReflectionTypeCheck;
    protected readonly refJsonReader: ReflectionJsonReader;
    protected readonly refJsonWriter: ReflectionJsonWriter;
    protected readonly refBinReader: ReflectionBinaryReader;
    protected readonly refBinWriter: ReflectionBinaryWriter;
    constructor(name: string, fields: readonly PartialFieldInfo[], options?: JsonOptionsMap);
    /**
     * Create a new message with default values.
     *
     * For example, a protobuf `string name = 1;` has the default value `""`.
     */
    create(): T;
    /**
     * Create a new message from partial data.
     * Where a field is omitted, the default value is used.
     *
     * Unknown fields are discarded.
     *
     * `PartialMessage<T>` is similar to `Partial<T>`,
     * but it is recursive, and it keeps `oneof` groups
     * intact.
     */
    create(value: PartialMessage<T>): T;
    /**
     * Clone the message.
     *
     * Unknown fields are discarded.
     */
    clone(message: T): T;
    /**
     * Determines whether two message of the same type have the same field values.
     * Checks for deep equality, traversing repeated fields, oneof groups, maps
     * and messages recursively.
     * Will also return true if both messages are `undefined`.
     */
    equals(a: T | undefined, b: T | undefined): boolean;
    /**
     * Is the given value assignable to our message type
     * and contains no [excess properties](https://www.typescriptlang.org/docs/handbook/interfaces.html#excess-property-checks)?
     */
    is(arg: any, depth?: number): arg is T;
    /**
     * Is the given value assignable to our message type,
     * regardless of [excess properties](https://www.typescriptlang.org/docs/handbook/interfaces.html#excess-property-checks)?
     */
    isAssignable(arg: any, depth?: number): arg is T;
    /**
     * Copy partial data into the target message.
     */
    mergePartial(target: T, source: PartialMessage<T>): void;
    /**
     * Create a new message from binary format.
     */
    fromBinary(data: Uint8Array, options?: Partial<BinaryReadOptions>): T;
    /**
     * Read a new message from a JSON value.
     */
    fromJson(json: JsonValue, options?: Partial<JsonReadOptions>): T;
    /**
     * Read a new message from a JSON string.
     * This is equivalent to `T.fromJson(JSON.parse(json))`.
     */
    fromJsonString(json: string, options?: Partial<JsonReadOptions>): T;
    /**
     * Write the message to canonical JSON value.
     */
    toJson(message: T, options?: Partial<JsonWriteOptions>): JsonValue;
    /**
     * Convert the message to canonical JSON string.
     * This is equivalent to `JSON.stringify(T.toJson(t))`
     */
    toJsonString(message: T, options?: Partial<JsonWriteStringOptions>): string;
    /**
     * Write the message to binary format.
     */
    toBinary(message: T, options?: Partial<BinaryWriteOptions>): Uint8Array;
    /**
     * This is an internal method. If you just want to read a message from
     * JSON, use `fromJson()` or `fromJsonString()`.
     *
     * Reads JSON value and merges the fields into the target
     * according to protobuf rules. If the target is omitted,
     * a new instance is created first.
     */
    internalJsonRead(json: JsonValue, options: JsonReadOptions, target?: T): T;
    /**
     * This is an internal method. If you just want to write a message
     * to JSON, use `toJson()` or `toJsonString().
     *
     * Writes JSON value and returns it.
     */
    internalJsonWrite(message: T, options: JsonWriteOptions): JsonValue;
    /**
     * This is an internal method. If you just want to write a message
     * in binary format, use `toBinary()`.
     *
     * Serializes the message in binary format and appends it to the given
     * writer. Returns passed writer.
     */
    internalBinaryWrite(message: T, writer: IBinaryWriter, options: BinaryWriteOptions): IBinaryWriter;
    /**
     * This is an internal method. If you just want to read a message from
     * binary data, use `fromBinary()`.
     *
     * Reads data from binary format and merges the fields into
     * the target according to protobuf rules. If the target is
     * omitted, a new instance is created first.
     */
    internalBinaryRead(reader: IBinaryReader, length: number, options: BinaryReadOptions, target?: T): T;
}
declare type JsonOptionsMap = {
    [extensionName: string]: JsonValue;
};
export {};
