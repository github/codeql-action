import type { FieldInfo, MessageInfo } from "./reflection-info";
import type { BinaryReadOptions, BinaryWriteOptions, IBinaryReader, IBinaryWriter } from "./binary-format-contract";
import type { JsonValue } from "./json-typings";
import type { JsonReadOptions, JsonWriteOptions, JsonWriteStringOptions } from "./json-format-contract";
/**
 * The symbol used as a key on message objects to store the message type.
 *
 * Note that this is an experimental feature - it is here to stay, but
 * implementation details may change without notice.
 */
export declare const MESSAGE_TYPE: unique symbol;
/**
 * Similar to `Partial<T>`, but recursive, and keeps `oneof` groups
 * intact.
 */
export declare type PartialMessage<T extends object> = {
    [K in keyof T]?: PartialField<T[K]>;
};
declare type PartialField<T> = T extends (Date | Uint8Array | bigint | boolean | string | number) ? T : T extends Array<infer U> ? Array<PartialField<U>> : T extends ReadonlyArray<infer U> ? ReadonlyArray<PartialField<U>> : T extends {
    oneofKind: string;
} ? T : T extends {
    oneofKind: undefined;
} ? T : T extends object ? PartialMessage<T> : T;
/**
 * A message type provides an API to work with messages of a specific type.
 * It also exposes reflection information that can be used to work with a
 * message of unknown type.
 */
export interface IMessageType<T extends object> extends MessageInfo {
    /**
     * The protobuf type name of the message, including package and
     * parent types if present.
     *
     * Examples:
     * 'MyNamespaceLessMessage'
     * 'my_package.MyMessage'
     * 'my_package.ParentMessage.ChildMessage'
     */
    readonly typeName: string;
    /**
     * Simple information for each message field, in the order
     * of declaration in the .proto.
     */
    readonly fields: readonly FieldInfo[];
    /**
     * Contains custom message options from the .proto source in JSON format.
     */
    readonly options: {
        [extensionName: string]: JsonValue;
    };
    /**
     * Contains the prototype for messages returned by create() which
     * includes the `MESSAGE_TYPE` symbol pointing back to `this`.
     */
    readonly messagePrototype?: Readonly<{}> | undefined;
    /**
     * Create a new message with default values.
     *
     * For example, a protobuf `string name = 1;` has the default value `""`.
     */
    create(): T;
    /**
     * Create a new message from partial data.
     *
     * Unknown fields are discarded.
     *
     * `PartialMessage<T>` is similar to `Partial<T>`,
     * but it is recursive, and it keeps `oneof` groups
     * intact.
     */
    create(value: PartialMessage<T>): T;
    /**
     * Create a new message from binary format.
     */
    fromBinary(data: Uint8Array, options?: Partial<BinaryReadOptions>): T;
    /**
     * Write the message to binary format.
     */
    toBinary(message: T, options?: Partial<BinaryWriteOptions>): Uint8Array;
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
     * Convert the message to canonical JSON value.
     */
    toJson(message: T, options?: Partial<JsonWriteOptions>): JsonValue;
    /**
     * Convert the message to canonical JSON string.
     * This is equivalent to `JSON.stringify(T.toJson(t))`
     */
    toJsonString(message: T, options?: Partial<JsonWriteStringOptions>): string;
    /**
     * Clone the message.
     *
     * Unknown fields are discarded.
     */
    clone(message: T): T;
    /**
     * Copy partial data into the target message.
     *
     * If a singular scalar or enum field is present in the source, it
     * replaces the field in the target.
     *
     * If a singular message field is present in the source, it is merged
     * with the target field by calling mergePartial() of the responsible
     * message type.
     *
     * If a repeated field is present in the source, its values replace
     * all values in the target array, removing extraneous values.
     * Repeated message fields are copied, not merged.
     *
     * If a map field is present in the source, entries are added to the
     * target map, replacing entries with the same key. Entries that only
     * exist in the target remain. Entries with message values are copied,
     * not merged.
     *
     * Note that this function differs from protobuf merge semantics,
     * which appends repeated fields.
     */
    mergePartial(target: T, source: PartialMessage<T>): void;
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
export {};
