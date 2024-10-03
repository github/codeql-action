"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reflectionScalarDefault = void 0;
const reflection_info_1 = require("./reflection-info");
const reflection_long_convert_1 = require("./reflection-long-convert");
const pb_long_1 = require("./pb-long");
/**
 * Creates the default value for a scalar type.
 */
function reflectionScalarDefault(type, longType = reflection_info_1.LongType.STRING) {
    switch (type) {
        case reflection_info_1.ScalarType.BOOL:
            return false;
        case reflection_info_1.ScalarType.UINT64:
        case reflection_info_1.ScalarType.FIXED64:
            return reflection_long_convert_1.reflectionLongConvert(pb_long_1.PbULong.ZERO, longType);
        case reflection_info_1.ScalarType.INT64:
        case reflection_info_1.ScalarType.SFIXED64:
        case reflection_info_1.ScalarType.SINT64:
            return reflection_long_convert_1.reflectionLongConvert(pb_long_1.PbLong.ZERO, longType);
        case reflection_info_1.ScalarType.DOUBLE:
        case reflection_info_1.ScalarType.FLOAT:
            return 0.0;
        case reflection_info_1.ScalarType.BYTES:
            return new Uint8Array(0);
        case reflection_info_1.ScalarType.STRING:
            return "";
        default:
            // case ScalarType.INT32:
            // case ScalarType.UINT32:
            // case ScalarType.SINT32:
            // case ScalarType.FIXED32:
            // case ScalarType.SFIXED32:
            return 0;
    }
}
exports.reflectionScalarDefault = reflectionScalarDefault;
