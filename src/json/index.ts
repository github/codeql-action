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
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

/**
 * Represents a field of type `T` in a schema.
 * Carries a validation function and flag indicating whether the field is required or not.
 */
export type Validator<T> = {
  validate: (val: unknown) => val is T;
  required: boolean;
};

/** Extracts `T` from `Validator<T>`. */
export type UnwrapValidator<V> =
  V extends Validator<infer A>
    ? V["required"] extends true
      ? A
      : A | undefined
    : never;

/** A validator for string fields in schemas. */
export const string = {
  validate: isString,
  required: true,
} as const satisfies Validator<string>;

/** Transforms a validator to be optional. */
export function optional<T>(validator: Validator<T>) {
  return {
    validate: (val: unknown) => {
      return val === undefined || val === null || validator.validate(val);
    },
    required: false,
  } as const satisfies Validator<T | undefined | null>;
}

/** Represents an arbitrary object schema. */
export type Schema = Record<string, Validator<any>>;

/** Constructs an object type corresponding to a schema. */
export type FromSchema<S extends Schema> = {
  [K in keyof S]: UnwrapValidator<S[K]>;
};

/**
 * Validates `obj` against `schema`.
 *
 * @param schema The schema to validate against.
 * @param obj The object to validate.
 * @returns Asserts that `obj` is of the `schema`'s type if validation is successful.
 */
export function validateSchema<S extends Schema>(
  schema: S,
  obj: UnvalidatedObject<any>,
): obj is FromSchema<S> {
  for (const [key, validator] of Object.entries(schema)) {
    const hasKey = key in obj;

    // If the property is required, but absent, fail.
    if (validator.required && !hasKey) {
      return false;
    }

    // If the property is required, but undefined or null, fail.
    if (validator.required && (obj[key] === undefined || obj[key] === null)) {
      return false;
    }

    // If the property is present, validate it.
    if (hasKey && !validator.validate(obj[key])) {
      return false;
    }
  }

  return true;
}
