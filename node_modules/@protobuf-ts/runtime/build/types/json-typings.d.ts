/**
 * Represents any possible JSON value:
 * - number
 * - string
 * - boolean
 * - null
 * - object (with any JSON value as property)
 * - array (with any JSON value as element)
 */
export declare type JsonValue = number | string | boolean | null | JsonObject | JsonArray;
/**
 * Represents a JSON object.
 */
export declare type JsonObject = {
    [k: string]: JsonValue;
};
interface JsonArray extends Array<JsonValue> {
}
/**
 * Get the type of a JSON value.
 * Distinguishes between array, null and object.
 */
export declare function typeofJsonValue(value: JsonValue | undefined): 'string' | 'number' | 'object' | 'array' | 'null' | 'boolean' | 'undefined';
/**
 * Is this a JSON object (instead of an array or null)?
 */
export declare function isJsonObject(value: JsonValue): value is JsonObject;
export {};
