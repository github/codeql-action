import type { BinaryWriteOptions, IBinaryWriter, WireType } from "./binary-format-contract";
/**
 * Make options for writing binary data form partial options.
 */
export declare function binaryWriteOptions(options?: Partial<BinaryWriteOptions>): Readonly<BinaryWriteOptions>;
/**
 * TextEncoderLike is the subset of the TextEncoder API required by protobuf-ts.
 */
interface TextEncoderLike {
    encode(input?: string): Uint8Array;
}
export declare class BinaryWriter implements IBinaryWriter {
    /**
     * We cannot allocate a buffer for the entire output
     * because we don't know it's size.
     *
     * So we collect smaller chunks of known size and
     * concat them later.
     *
     * Use `raw()` to push data to this array. It will flush
     * `buf` first.
     */
    private chunks;
    /**
     * A growing buffer for byte values. If you don't know
     * the size of the data you are writing, push to this
     * array.
     */
    protected buf: number[];
    /**
     * Previous fork states.
     */
    private stack;
    /**
     * Text encoder instance to convert UTF-8 to bytes.
     */
    private readonly textEncoder;
    constructor(textEncoder?: TextEncoderLike);
    /**
     * Return all bytes written and reset this writer.
     */
    finish(): Uint8Array;
    /**
     * Start a new fork for length-delimited data like a message
     * or a packed repeated field.
     *
     * Must be joined later with `join()`.
     */
    fork(): IBinaryWriter;
    /**
     * Join the last fork. Write its length and bytes, then
     * return to the previous state.
     */
    join(): IBinaryWriter;
    /**
     * Writes a tag (field number and wire type).
     *
     * Equivalent to `uint32( (fieldNo << 3 | type) >>> 0 )`.
     *
     * Generated code should compute the tag ahead of time and call `uint32()`.
     */
    tag(fieldNo: number, type: WireType): IBinaryWriter;
    /**
     * Write a chunk of raw bytes.
     */
    raw(chunk: Uint8Array): IBinaryWriter;
    /**
     * Write a `uint32` value, an unsigned 32 bit varint.
     */
    uint32(value: number): IBinaryWriter;
    /**
     * Write a `int32` value, a signed 32 bit varint.
     */
    int32(value: number): IBinaryWriter;
    /**
     * Write a `bool` value, a variant.
     */
    bool(value: boolean): IBinaryWriter;
    /**
     * Write a `bytes` value, length-delimited arbitrary data.
     */
    bytes(value: Uint8Array): IBinaryWriter;
    /**
     * Write a `string` value, length-delimited data converted to UTF-8 text.
     */
    string(value: string): IBinaryWriter;
    /**
     * Write a `float` value, 32-bit floating point number.
     */
    float(value: number): IBinaryWriter;
    /**
     * Write a `double` value, a 64-bit floating point number.
     */
    double(value: number): IBinaryWriter;
    /**
     * Write a `fixed32` value, an unsigned, fixed-length 32-bit integer.
     */
    fixed32(value: number): IBinaryWriter;
    /**
     * Write a `sfixed32` value, a signed, fixed-length 32-bit integer.
     */
    sfixed32(value: number): IBinaryWriter;
    /**
     * Write a `sint32` value, a signed, zigzag-encoded 32-bit varint.
     */
    sint32(value: number): IBinaryWriter;
    /**
     * Write a `fixed64` value, a signed, fixed-length 64-bit integer.
     */
    sfixed64(value: string | number | bigint): IBinaryWriter;
    /**
     * Write a `fixed64` value, an unsigned, fixed-length 64 bit integer.
     */
    fixed64(value: string | number | bigint): IBinaryWriter;
    /**
     * Write a `int64` value, a signed 64-bit varint.
     */
    int64(value: string | number | bigint): IBinaryWriter;
    /**
     * Write a `sint64` value, a signed, zig-zag-encoded 64-bit varint.
     */
    sint64(value: string | number | bigint): IBinaryWriter;
    /**
     * Write a `uint64` value, an unsigned 64-bit varint.
     */
    uint64(value: string | number | bigint): IBinaryWriter;
}
export {};
