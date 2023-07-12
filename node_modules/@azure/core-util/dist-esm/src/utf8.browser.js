// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
let encoder;
/**
 * Returns a cached TextEncoder.
 * @internal
 */
function getTextEncoder() {
    if (encoder) {
        return encoder;
    }
    if (typeof TextEncoder === "undefined") {
        throw new Error(`Your browser environment is missing "TextEncoder".`);
    }
    encoder = new TextEncoder();
    return encoder;
}
/**
 * Converts a utf8 string into a byte array.
 * @param content - The utf8 string to convert.
 * @internal
 */
export function utf8ToBytes(content) {
    return getTextEncoder().encode(content);
}
//# sourceMappingURL=utf8.browser.js.map