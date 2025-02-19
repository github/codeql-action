declare function findPaginatedResourcePath(responseData: any): string[];
/**
 * The interfaces of the "get" and "set" functions are equal to those of lodash:
 * https://lodash.com/docs/4.17.15#get
 * https://lodash.com/docs/4.17.15#set
 *
 * They are cut down to our purposes, but could be replaced by the lodash calls
 * if we ever want to have that dependency.
 */
declare const get: (object: any, path: string[]) => any;
type Mutator = any | ((value: unknown) => any);
declare const set: (object: any, path: string[], mutator: Mutator) => void;
export { findPaginatedResourcePath, get, set };
