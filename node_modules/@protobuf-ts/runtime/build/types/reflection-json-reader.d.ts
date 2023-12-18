import type { JsonObject, JsonValue } from "./json-typings";
import type { JsonReadOptions } from "./json-format-contract";
import type { EnumInfo } from "./reflection-info";
import { LongType, PartialMessageInfo, ScalarType } from "./reflection-info";
import type { UnknownEnum, UnknownScalar } from "./unknown-types";
/**
 * Reads proto3 messages in canonical JSON format using reflection information.
 *
 * https://developers.google.com/protocol-buffers/docs/proto3#json
 */
export declare class ReflectionJsonReader {
    private readonly info;
    /**
     * JSON key to field.
     * Accepts the original proto field name in the .proto, the
     * lowerCamelCase name, or the name specified by the json_name option.
     */
    private fMap?;
    constructor(info: PartialMessageInfo);
    protected prepare(): void;
    assert(condition: any, fieldName: string, jsonValue: JsonValue): asserts condition;
    /**
     * Reads a message from canonical JSON format into the target message.
     *
     * Repeated fields are appended. Map entries are added, overwriting
     * existing keys.
     *
     * If a message field is already present, it will be merged with the
     * new data.
     */
    read<T extends object>(input: JsonObject, message: T, options: JsonReadOptions): void;
    /**
     * Returns `false` for unrecognized string representations.
     *
     * google.protobuf.NullValue accepts only JSON `null` (or the old `"NULL_VALUE"`).
     */
    enum(type: EnumInfo, json: unknown, fieldName: string, ignoreUnknownFields: boolean): UnknownEnum | false;
    scalar(json: JsonValue, type: ScalarType, longType: LongType | undefined, fieldName: string): UnknownScalar;
}
