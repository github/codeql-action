import type { MessageInfo } from "./reflection-info";
import type { UnknownMessage } from "./unknown-types";
/**
 * Determines whether two message of the same type have the same field values.
 * Checks for deep equality, traversing repeated fields, oneof groups, maps
 * and messages recursively.
 * Will also return true if both messages are `undefined`.
 */
export declare function reflectionEquals(info: MessageInfo, a: UnknownMessage | undefined, b: UnknownMessage | undefined): boolean;
