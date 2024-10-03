"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reflectionLongConvert = void 0;
const reflection_info_1 = require("./reflection-info");
/**
 * Utility method to convert a PbLong or PbUlong to a JavaScript
 * representation during runtime.
 *
 * Works with generated field information, `undefined` is equivalent
 * to `STRING`.
 */
function reflectionLongConvert(long, type) {
    switch (type) {
        case reflection_info_1.LongType.BIGINT:
            return long.toBigInt();
        case reflection_info_1.LongType.NUMBER:
            return long.toNumber();
        default:
            // case undefined:
            // case LongType.STRING:
            return long.toString();
    }
}
exports.reflectionLongConvert = reflectionLongConvert;
