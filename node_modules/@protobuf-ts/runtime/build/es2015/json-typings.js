/**
 * Get the type of a JSON value.
 * Distinguishes between array, null and object.
 */
export function typeofJsonValue(value) {
    let t = typeof value;
    if (t == "object") {
        if (Array.isArray(value))
            return "array";
        if (value === null)
            return "null";
    }
    return t;
}
/**
 * Is this a JSON object (instead of an array or null)?
 */
export function isJsonObject(value) {
    return value !== null && typeof value == "object" && !Array.isArray(value);
}
