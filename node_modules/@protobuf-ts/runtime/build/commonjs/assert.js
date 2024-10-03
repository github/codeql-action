"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertFloat32 = exports.assertUInt32 = exports.assertInt32 = exports.assertNever = exports.assert = void 0;
/**
 * assert that condition is true or throw error (with message)
 */
function assert(condition, msg) {
    if (!condition) {
        throw new Error(msg);
    }
}
exports.assert = assert;
/**
 * assert that value cannot exist = type `never`. throw runtime error if it does.
 */
function assertNever(value, msg) {
    throw new Error(msg !== null && msg !== void 0 ? msg : 'Unexpected object: ' + value);
}
exports.assertNever = assertNever;
const FLOAT32_MAX = 3.4028234663852886e+38, FLOAT32_MIN = -3.4028234663852886e+38, UINT32_MAX = 0xFFFFFFFF, INT32_MAX = 0X7FFFFFFF, INT32_MIN = -0X80000000;
function assertInt32(arg) {
    if (typeof arg !== "number")
        throw new Error('invalid int 32: ' + typeof arg);
    if (!Number.isInteger(arg) || arg > INT32_MAX || arg < INT32_MIN)
        throw new Error('invalid int 32: ' + arg);
}
exports.assertInt32 = assertInt32;
function assertUInt32(arg) {
    if (typeof arg !== "number")
        throw new Error('invalid uint 32: ' + typeof arg);
    if (!Number.isInteger(arg) || arg > UINT32_MAX || arg < 0)
        throw new Error('invalid uint 32: ' + arg);
}
exports.assertUInt32 = assertUInt32;
function assertFloat32(arg) {
    if (typeof arg !== "number")
        throw new Error('invalid float 32: ' + typeof arg);
    if (!Number.isFinite(arg))
        return;
    if (arg > FLOAT32_MAX || arg < FLOAT32_MIN)
        throw new Error('invalid float 32: ' + arg);
}
exports.assertFloat32 = assertFloat32;
