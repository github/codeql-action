import type { PbLong, PbULong } from "./pb-long";
import { LongType } from "./reflection-info";
/**
 * Utility method to convert a PbLong or PbUlong to a JavaScript
 * representation during runtime.
 *
 * Works with generated field information, `undefined` is equivalent
 * to `STRING`.
 */
export declare function reflectionLongConvert(long: PbLong | PbULong, type: LongType | undefined): string | number | bigint;
