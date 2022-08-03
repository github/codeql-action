// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * Encodes a string in base64 format.
 * @param value - The string to encode
 */
export function encodeString(value) {
    return Buffer.from(value).toString("base64");
}
/**
 * Encodes a byte array in base64 format.
 * @param value - The Uint8Aray to encode
 */
export function encodeByteArray(value) {
    // Buffer.from accepts <ArrayBuffer> | <SharedArrayBuffer>-- the TypeScript definition is off here
    // https://nodejs.org/api/buffer.html#buffer_class_method_buffer_from_arraybuffer_byteoffset_length
    const bufferValue = value instanceof Buffer ? value : Buffer.from(value.buffer);
    return bufferValue.toString("base64");
}
/**
 * Decodes a base64 string into a byte array.
 * @param value - The base64 string to decode
 */
export function decodeString(value) {
    return Buffer.from(value, "base64");
}
//# sourceMappingURL=base64.js.map