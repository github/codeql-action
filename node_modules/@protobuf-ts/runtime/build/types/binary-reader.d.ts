import type { BinaryReadOptions, IBinaryReader } from "./binary-format-contract";
import { WireType } from "./binary-format-contract";
import { PbLong, PbULong } from "./pb-long";
/**
 * Make options for reading binary data form partial options.
 */
export declare function binaryReadOptions(options?: Partial<BinaryReadOptions>): Readonly<BinaryReadOptions>;
/**
 * TextDecoderLike is the subset of the TextDecoder API required by protobuf-ts.
 */
interface TextDecoderLike {
    decode(input?: Uint8Array): string;
}
export declare class BinaryReader implements IBinaryReader {
    /**
     * Current position.
     */
    pos: number;
    /**
     * Number of bytes available in this reader.
     */
    readonly len: number;
    private readonly buf;
    private readonly view;
    private readonly textDecoder;
    constructor(buf: Uint8Array, textDecoder?: TextDecoderLike);
    /**
     * Reads a tag - field number and wire type.
     */
    tag(): [number, WireType];
    /**
     * Skip one element on the wire and return the skipped data.
     * Supports WireType.StartGroup since v2.0.0-alpha.23.
     */
    skip(wireType: WireType): Uint8Array;
    protected varint64: () => [number, number];
    /**
     * Throws error if position in byte array is out of range.
     */
    protected assertBounds(): void;
    /**
     * Read a `uint32` field, an unsigned 32 bit varint.
     */
    uint32: () => number;
    /**
     * Read a `int32` field, a signed 32 bit varint.
     */
    int32(): number;
    /**
     * Read a `sint32` field, a signed, zigzag-encoded 32-bit varint.
     */
    sint32(): number;
    /**
     * Read a `int64` field, a signed 64-bit varint.
     */
    int64(): PbLong;
    /**
     * Read a `uint64` field, an unsigned 64-bit varint.
     */
    uint64(): PbULong;
    /**
     * Read a `sint64` field, a signed, zig-zag-encoded 64-bit varint.
     */
    sint64(): PbLong;
    /**
     * Read a `bool` field, a variant.
     */
    bool(): boolean;
    /**
     * Read a `fixed32` field, an unsigned, fixed-length 32-bit integer.
     */
    fixed32(): number;
    /**
     * Read a `sfixed32` field, a signed, fixed-length 32-bit integer.
     */
    sfixed32(): number;
    /**
     * Read a `fixed64` field, an unsigned, fixed-length 64 bit integer.
     */
    fixed64(): PbULong;
    /**
     * Read a `fixed64` field, a signed, fixed-length 64-bit integer.
     */
    sfixed64(): PbLong;
    /**
     * Read a `float` field, 32-bit floating point number.
     */
    float(): number;
    /**
     * Read a `double` field, a 64-bit floating point number.
     */
    double(): number;
    /**
     * Read a `bytes` field, length-delimited arbitrary data.
     */
    bytes(): Uint8Array;
    /**
     * Read a `string` field, length-delimited data converted to UTF-8 text.
     */
    string(): string;
}
export {};
