import * as ts from "typescript";
export declare type SimpleJsValue = string | number | bigint | boolean | undefined | null | SimpleJsValue[] | {
    [k: string]: SimpleJsValue;
} | TypedArray;
declare type TypedArray = Uint8Array | Int8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
/**
 * Creates nodes for simple JavaScript values.
 *
 * Simple JavaScript values include:
 * - all primitives: number, bigint, string, boolean
 * - undefined, null
 * - plain objects containing only simple JavaScript values
 * - arrays containing only simple JavaScript values
 * - typed arrays
 */
export declare function typescriptLiteralFromValue(value: SimpleJsValue): ts.Expression;
export {};
