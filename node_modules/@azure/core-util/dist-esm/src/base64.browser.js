// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * Converts a base64 string into a byte array.
 * @param content - The base64 string to convert.
 * @internal
 */
export function base64ToBytes(content) {
    if (typeof atob !== "function") {
        throw new Error(`Your browser environment is missing the global "atob" function.`);
    }
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
/**
 * Converts an ArrayBuffer to base64 string.
 * @param buffer - Raw binary data.
 * @internal
 */
export function bufferToBase64(buffer) {
    if (typeof btoa !== "function") {
        throw new Error(`Your browser environment is missing the global "btoa" function.`);
    }
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}
//# sourceMappingURL=base64.browser.js.map