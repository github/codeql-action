/**
 * Represents a value we have obtained from parsing JSON which we know is an object,
 * and expect to be of some type `T` which has not yet been validated.
 */
export type UnvalidatedObject<T> = { [P in keyof T]?: unknown };

/** Represents a value we have obtained from parsing JSON which we know is an array. */
export type UnvalidatedArray = unknown[];

/**
 * Attempts to parse `data` as JSON. This function does not perform any validation and will therefore
 * return a value of an `unknown` type if successful. Throws if `data` is not valid JSON.
 */
export function parseString(data: string): unknown {
  return JSON.parse(data) as unknown;
}

/** Asserts that `value` is an object, which is not yet validated, but expected to be of type `T`. */
export function isObject<T>(value: unknown): value is UnvalidatedObject<T> {
  return typeof value === "object";
}

/** Asserts that `value` is an array, which is not yet validated. */
export function isArray(value: unknown): value is UnvalidatedArray {
  return Array.isArray(value);
}

/** Asserts that `value` is a string. */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Asserts that `value` is either a string or undefined. */
export function isStringOrUndefined(
  value: unknown,
): value is string | undefined {
  return value === undefined || isString(value);
}
