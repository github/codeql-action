export declare function detectBi(): void;
declare abstract class SharedPbLong {
    /**
     * Low 32 bits.
     */
    readonly lo: number;
    /**
     * High 32 bits.
     */
    readonly hi: number;
    /**
     * Create a new instance with the given bits.
     */
    constructor(lo: number, hi: number);
    /**
     * Is this instance equal to 0?
     */
    isZero(): boolean;
    /**
     * Convert to a native number.
     */
    toNumber(): number;
    /**
     * Convert to decimal string.
     */
    abstract toString(): string;
    /**
     * Convert to native bigint.
     */
    abstract toBigInt(): bigint;
}
/**
 * 64-bit unsigned integer as two 32-bit values.
 * Converts between `string`, `number` and `bigint` representations.
 */
export declare class PbULong extends SharedPbLong {
    /**
     * ulong 0 singleton.
     */
    static ZERO: PbULong;
    /**
     * Create instance from a `string`, `number` or `bigint`.
     */
    static from(value: string | number | bigint): PbULong;
    /**
     * Convert to decimal string.
     */
    toString(): string;
    /**
     * Convert to native bigint.
     */
    toBigInt(): bigint;
}
/**
 * 64-bit signed integer as two 32-bit values.
 * Converts between `string`, `number` and `bigint` representations.
 */
export declare class PbLong extends SharedPbLong {
    /**
     * long 0 singleton.
     */
    static ZERO: PbLong;
    /**
     * Create instance from a `string`, `number` or `bigint`.
     */
    static from(value: string | number | bigint): PbLong;
    /**
     * Do we have a minus sign?
     */
    isNegative(): boolean;
    /**
     * Negate two's complement.
     * Invert all the bits and add one to the result.
     */
    negate(): PbLong;
    /**
     * Convert to decimal string.
     */
    toString(): string;
    /**
     * Convert to native bigint.
     */
    toBigInt(): bigint;
}
export {};
