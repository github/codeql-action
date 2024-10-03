import * as ts from "typescript";
/**
 * Adds multiple comment blocks as line comments
 * in front of the given node.
 *
 * Applies a dirty hack to enforce newlines
 * between each block.
 */
export declare function addCommentBlocksAsLeadingDetachedLines<T extends ts.Node>(node: T, ...texts: string[]): void;
/**
 * Adds a JSDoc comment block in front of the given node.
 *
 * A JSDoc comment looks like this:
 *   /**
 *    * body text
 *    *\/
 *
 * A regular block comment looks like this:
 *   /* body text *\/
 *
 */
export declare function addCommentBlockAsJsDoc<T extends ts.Node>(node: T, text: string): void;
