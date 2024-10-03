import type { BinaryReadOptions, IBinaryReader } from "./binary-format-contract";
import type { FieldInfo, PartialMessageInfo } from "./reflection-info";
import { LongType, ScalarType } from "./reflection-info";
import type { UnknownMap, UnknownScalar } from "./unknown-types";
/**
 * Reads proto3 messages in binary format using reflection information.
 *
 * https://developers.google.com/protocol-buffers/docs/encoding
 */
export declare class ReflectionBinaryReader {
    private readonly info;
    protected fieldNoToField?: ReadonlyMap<number, FieldInfo>;
    constructor(info: PartialMessageInfo);
    protected prepare(): void;
    /**
     * Reads a message from binary format into the target message.
     *
     * Repeated fields are appended. Map entries are added, overwriting
     * existing keys.
     *
     * If a message field is already present, it will be merged with the
     * new data.
     */
    read<T extends object>(reader: IBinaryReader, message: T, options: BinaryReadOptions, length?: number): void;
    /**
     * Read a map field, expecting key field = 1, value field = 2
     */
    protected mapEntry(field: FieldInfo & {
        kind: "map";
    }, reader: IBinaryReader, options: BinaryReadOptions): [string | number, UnknownMap[string]];
    protected scalar(reader: IBinaryReader, type: ScalarType, longType: LongType | undefined): UnknownScalar;
}
