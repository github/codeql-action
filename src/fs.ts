/**
 * This module exports a `FileSystem` type which corresponds to the interface of the "fs" module.
 *
 * Functions which are parameterised over this type can then be passed a different implementation in tests:
 *
 * ```typescript
 * import * as nodefs from "fs";
 *
 * function foo(fs: FileSystem = nodefs) {
 *   // Uses the real "fs" module by default, but can be given a different implementation.
 * }
 * ```
 *
 * The type can also be constrained to a subset of available operations. For example, in the following
 * case we have a function that only needs `statSync`:
 *
 * ```
 * function bar(fs: FileSystem<"statSync"> = nodefs) {
 *   // This function can only use `statSync`.
 * }
 * ```
 *
 * This is useful to define a clearer interface for what the function does and also only requires stubbing
 * of the relevant functions.
 */

import * as fs from "fs";

/** Represents the names of operations exported from "fs". */
export type FileOperation = keyof typeof fs;

/** Represents the type of "fs", optionally filtered down to just `Ops`. */
export type FileSystem<Ops extends FileOperation = keyof typeof fs> = {
  [Key in Ops]: (typeof fs)[Key];
};
