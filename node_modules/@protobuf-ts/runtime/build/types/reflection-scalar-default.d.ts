import { LongType, ScalarType } from "./reflection-info";
/**
 * Creates the default value for a scalar type.
 */
export declare function reflectionScalarDefault(type: ScalarType, longType?: LongType): string | number | bigint | boolean | Uint8Array;
