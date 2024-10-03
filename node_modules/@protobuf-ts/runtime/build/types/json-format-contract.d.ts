import type { IMessageType } from "./message-type-contract";
/**
 * Options for parsing JSON data.
 * All boolean options default to `false`.
 */
export interface JsonReadOptions {
    /**
     * Ignore unknown fields: Proto3 JSON parser should reject unknown fields
     * by default. This option ignores unknown fields in parsing, as well as
     * unrecognized enum string representations.
     */
    ignoreUnknownFields: boolean;
    /**
     * This option is required to read `google.protobuf.Any`
     * from JSON format.
     */
    typeRegistry?: readonly IMessageType<any>[];
}
/**
 * Options for serializing to JSON object.
 * All boolean options default to `false`.
 */
export interface JsonWriteOptions {
    /**
     * Emit fields with default values: Fields with default values are omitted
     * by default in proto3 JSON output. This option overrides this behavior
     * and outputs fields with their default values.
     */
    emitDefaultValues: boolean;
    /**
     * Emit enum values as integers instead of strings: The name of an enum
     * value is used by default in JSON output. An option may be provided to
     * use the numeric value of the enum value instead.
     */
    enumAsInteger: boolean;
    /**
     * Use proto field name instead of lowerCamelCase name: By default proto3
     * JSON printer should convert the field name to lowerCamelCase and use
     * that as the JSON name. An implementation may provide an option to use
     * proto field name as the JSON name instead. Proto3 JSON parsers are
     * required to accept both the converted lowerCamelCase name and the proto
     * field name.
     */
    useProtoFieldName: boolean;
    /**
     * This option is required to write `google.protobuf.Any`
     * to JSON format.
     */
    typeRegistry?: readonly IMessageType<any>[];
}
/**
 * Options for serializing to JSON string.
 * All options default to `false` or `0`.
 */
export interface JsonWriteStringOptions extends JsonWriteOptions {
    prettySpaces: number;
}
/**
 * Make options for reading JSON data from partial options.
 */
export declare function jsonReadOptions(options?: Partial<JsonReadOptions>): Readonly<JsonReadOptions>;
/**
 * Make options for writing JSON data from partial options.
 */
export declare function jsonWriteOptions(options?: Partial<JsonWriteStringOptions>): JsonWriteStringOptions;
/**
 * Merges JSON write or read options. Later values override earlier values. Type registries are merged.
 */
export declare function mergeJsonOptions<T extends JsonWriteStringOptions | JsonReadOptions>(a?: Partial<T>, b?: Partial<T>): Partial<T>;
