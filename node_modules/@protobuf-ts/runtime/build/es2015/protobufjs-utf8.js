// Copyright (c) 2016, Daniel Wirtz  All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
// * Redistributions of source code must retain the above copyright
//   notice, this list of conditions and the following disclaimer.
// * Redistributions in binary form must reproduce the above copyright
//   notice, this list of conditions and the following disclaimer in the
//   documentation and/or other materials provided with the distribution.
// * Neither the name of its author, nor the names of its contributors
//   may be used to endorse or promote products derived from this software
//   without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
const fromCharCodes = (chunk) => String.fromCharCode.apply(String, chunk);
/**
 * @deprecated This function will no longer be exported with the next major
 * release, since protobuf-ts has switch to TextDecoder API. If you need this
 * function, please migrate to @protobufjs/utf8. For context, see
 * https://github.com/timostamm/protobuf-ts/issues/184
 *
 * Reads UTF8 bytes as a string.
 *
 * See [protobufjs / utf8](https://github.com/protobufjs/protobuf.js/blob/9893e35b854621cce64af4bf6be2cff4fb892796/lib/utf8/index.js#L40)
 *
 * Copyright (c) 2016, Daniel Wirtz
 */
export function utf8read(bytes) {
    if (bytes.length < 1)
        return "";
    let pos = 0, // position in bytes
    parts = [], chunk = [], i = 0, // char offset
    t; // temporary
    let len = bytes.length;
    while (pos < len) {
        t = bytes[pos++];
        if (t < 128)
            chunk[i++] = t;
        else if (t > 191 && t < 224)
            chunk[i++] = (t & 31) << 6 | bytes[pos++] & 63;
        else if (t > 239 && t < 365) {
            t = ((t & 7) << 18 | (bytes[pos++] & 63) << 12 | (bytes[pos++] & 63) << 6 | bytes[pos++] & 63) - 0x10000;
            chunk[i++] = 0xD800 + (t >> 10);
            chunk[i++] = 0xDC00 + (t & 1023);
        }
        else
            chunk[i++] = (t & 15) << 12 | (bytes[pos++] & 63) << 6 | bytes[pos++] & 63;
        if (i > 8191) {
            parts.push(fromCharCodes(chunk));
            i = 0;
        }
    }
    if (parts.length) {
        if (i)
            parts.push(fromCharCodes(chunk.slice(0, i)));
        return parts.join("");
    }
    return fromCharCodes(chunk.slice(0, i));
}
