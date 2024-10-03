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
export declare function utf8read(bytes: Uint8Array): string;
