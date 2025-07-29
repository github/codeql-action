export = CborMap;
/**
 * Wrapper around a JavaScript Map object that allows the keys to be
 * any complex type.  The base Map object allows this, but will only
 * compare the keys by identity, not by value.  CborMap translates keys
 * to CBOR first (and base64's them to ensure by-value comparison).
 *
 * This is not a subclass of Object, because it would be tough to get
 * the semantics to be an exact match.
 *
 * @extends Map
 */
declare class CborMap extends Map<any, any> {
    /**
     * @ignore
     * @param {unknown} key
     * @returns {string}
     */
    static _encode(key: unknown): string;
    /**
     * @ignore
     * @param {string} key
     * @returns {unknown}
     */
    static _decode(key: string): unknown;
    /**
     * Creates an instance of CborMap.
     *
     * @param {Iterable<any>} [iterable] An Array or other iterable
     *   object whose elements are key-value pairs (arrays with two elements, e.g.
     *   <code>[[ 1, 'one' ],[ 2, 'two' ]]</code>). Each key-value pair is added
     *   to the new CborMap; null values are treated as undefined.
     */
    constructor(iterable?: Iterable<any>);
    /**
     * Adds or updates an element with a specified key and value.
     *
     * @param {any} key The key identifying the element to store.
     *   Can be any type, which will be serialized into CBOR and compared by
     *   value.
     * @param {any} val The element to store.
     * @returns {this} This object.
     */
    set(key: any, val: any): this;
    /**
     * Returns a new Iterator object that contains the [key, value] pairs for
     * each element in the Map object in insertion order.
     *
     * @returns {MapIterator<any>} Key value pairs.
     * @yields {any[]} Key value pairs.
     */
    entries(): MapIterator<any>;
    /**
     * Executes a provided function once per each key/value pair in the Map
     * object, in insertion order.
     *
     * @param {function(any, any, Map<any,any>): undefined} fun Function to
     *   execute for each element, which takes a value, a key, and the Map
     *   being traversed.
     * @param {any} thisArg Value to use as this when executing callback.
     * @throws {TypeError} Invalid function.
     */
    forEach(fun: (arg0: any, arg1: any, arg2: Map<any, any>) => undefined, thisArg?: any): void;
    /**
     * Push the simple value onto the CBOR stream.
     *
     * @param {import('./encoder.js')} gen The generator to push onto.
     * @returns {boolean} True on success.
     */
    encodeCBOR(gen: import("./encoder.js")): boolean;
    /**
     * Returns a new Iterator object that contains the [key, value] pairs for
     * each element in the Map object in insertion order.
     *
     * @returns {MapIterator<any>} Key value pairs.
     */
    [Symbol.iterator](): MapIterator<any>;
}
