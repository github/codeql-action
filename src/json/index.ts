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

/** Asserts that `value` is a number. */
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
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
  check: (
    val: unknown,
    opts: CheckSchemaOptions,
    path: string,
  ) => CheckSchemaResult;
  required: boolean;
};

function defaultCheck(
  validate: (val: unknown) => val is any,
): (arg: unknown) => CheckSchemaResult {
  return (arg) => ({ unknownKeys: [], invalidKeys: [], valid: validate(arg) });
}

function makeValidator<T>(
  validate: (arg: unknown) => arg is T,
  required: boolean = true,
) {
  return {
    validate,
    check: defaultCheck(validate),
    required,
  } as const satisfies Validator<T>;
}

/** Extracts `T` from `Validator<T>`. */
export type UnwrapValidator<V> = V extends Validator<infer A> ? A : never;

/** A validator for string fields in schemas. */
export const string = makeValidator(isString);

/** A validator for number fields in schemas. */
export const number = makeValidator(isNumber);

/** A validator for arrays. */
export function array<T>(validator: Validator<T>) {
  const validate = (val: unknown) => {
    return isArray(val) && val.every((e) => validator.validate(e));
  };
  return {
    validate,
    check: (val: unknown, opts: CheckSchemaOptions, path: string) => {
      const result: CheckSchemaResult = successfulCheckSchema();

      // The value must be an array.
      if (!isArray(val)) {
        result.valid = false;
        return result;
      }

      // Validate all elements of the array.
      let index = 0;
      for (const e of val) {
        const elementPath = `${path}[${index}]`;
        const eResult = validator.check(e, opts, `${elementPath}`);

        result.invalidKeys.push(...eResult.invalidKeys);
        result.unknownKeys.push(...eResult.unknownKeys);
        index++;

        if (!eResult.valid) {
          result.valid = false;

          // Add the element path to `invalidKeys` if we didn't get
          // any more specific ones from the element validator.
          if (eResult.invalidKeys.length === 0) {
            result.invalidKeys.push(elementPath);
          }

          if (opts.failFast) {
            return result;
          }

          continue;
        }
      }

      return result;
    },
    required: true,
  } as const satisfies Validator<T[]>;
}

/** A validator for objects. */
export function object<
  S extends Schema,
  T extends UnvalidatedObject<any> = FromSchema<S>,
>(schema: S) {
  return {
    validate: (val: unknown) => {
      return isObject(val) && validateSchema<S, T>(schema, val);
    },
    check: (val, opts, path) => {
      if (!isObject(val)) {
        return invalidCheckSchema();
      }
      return checkSchema(schema, val, opts, path);
    },
    required: true,
  } as const satisfies Validator<T>;
}

/**
 * Transforms a validator to be optional, accepting `undefined` or `null` for an
 * absent value.
 */
export function optionalOrNull<T>(validator: Validator<T>) {
  return {
    validate: (val: unknown) => {
      return val === undefined || val === null || validator.validate(val);
    },
    check: (val, opts, path) => {
      if (val === undefined || val === null) {
        return successfulCheckSchema();
      }
      return validator.check(val, opts, path);
    },
    required: false,
  } as const satisfies Validator<T | undefined | null>;
}

/**
 * Transforms a validator to be optional, accepting `undefined` for an absent
 * value but, unlike `optionalOrNull`, rejecting `null`.
 */
export function optional<T>(validator: Validator<T>) {
  return {
    validate: (val: unknown): val is T | undefined => {
      return val === undefined || validator.validate(val);
    },
    check: (val, opts, path) => {
      if (val === undefined) {
        return successfulCheckSchema();
      }
      return validator.check(val, opts, path);
    },
    required: false,
  } as const satisfies Validator<T | undefined>;
}

/** Represents an arbitrary object schema. */
export type Schema = Record<string, Validator<any>>;

/** Extracts the required keys from `S`. */
export type RequiredKeys<S extends Schema> = {
  [K in keyof S]: S[K]["required"] extends true ? K : never;
}[keyof S];

/** Extracts optional keys from `S`. */
export type OptionalKeys<S extends Schema> = {
  [K in keyof S]: S[K]["required"] extends true ? never : K;
}[keyof S];

/** Constructs an object type corresponding to a schema. */
export type FromSchema<S extends Schema> = {
  [K in RequiredKeys<S>]: UnwrapValidator<S[K]>;
} & { [K in OptionalKeys<S>]?: UnwrapValidator<S[K]> };

/**
 * Validates that `obj` satisfies at least `schema`. Additional keys are accepted.
 *
 * @param schema The schema to validate against.
 * @param obj The object to validate.
 * @returns Asserts that `obj` is of the `schema`'s type if validation is successful.
 */
export function validateSchema<
  S extends Schema,
  T extends UnvalidatedObject<any> = FromSchema<S>,
>(schema: S, obj: UnvalidatedObject<any>): obj is T {
  const result = checkSchema(schema, obj, { failFast: true });
  return result.valid;
}

export interface CheckSchemaOptions {
  /** Whether to stop validation after the first error. */
  failFast?: boolean;
}

export interface CheckSchemaResult {
  /** Whether the `obj` satisfies the schema. */
  valid: boolean;
  /** Unknown keys that were found during validation. */
  unknownKeys: string[];
  /** Known keys that failed validation. */
  invalidKeys: string[];
}

/**
 * Convenience function to produce a `CheckSchemaResult` where `valid: true`.
 */
function successfulCheckSchema(): CheckSchemaResult {
  return {
    valid: true,
    unknownKeys: [],
    invalidKeys: [],
  };
}

/**
 * Convenience function to produce a `CheckSchemaResult` where `valid: false`.
 */
function invalidCheckSchema(): CheckSchemaResult {
  return {
    valid: false,
    unknownKeys: [],
    invalidKeys: [],
  };
}

export function checkSchema<S extends Schema>(
  schema: S,
  obj: UnvalidatedObject<any>,
  options: CheckSchemaOptions = {},
  path: string = "",
): CheckSchemaResult {
  const result: CheckSchemaResult = successfulCheckSchema();

  // Track the set of input keys. We remove keys from this set as we recognise them
  // during validation.
  const inputKeys = new Set(Object.keys(obj));

  // Track keys that have failed validation, starting with the empty set.
  const invalidKeys = new Set();

  // Loop through all keys in the object schema and validate that the given object
  // satisfies the schema key.
  for (const [key, validator] of Object.entries(schema)) {
    const hasKey = key in obj;

    // Remove key from set of unrecognised keys.
    inputKeys.delete(key);

    // Add the key to the set of invalid keys. We remove it later once
    // it passes validation.
    invalidKeys.add(key);

    // If the property is required, but absent, fail.
    if (validator.required && !hasKey) {
      result.valid = false;

      if (options.failFast) {
        break;
      }
      continue;
    }

    // If the property is required, but undefined or null, fail.
    if (validator.required && (obj[key] === undefined || obj[key] === null)) {
      result.valid = false;

      if (options.failFast) {
        break;
      }
      continue;
    }

    // If the property is present, validate it.
    if (hasKey) {
      const checkResult = validator.check(obj[key], options, `${path}.${key}`);

      result.unknownKeys.push(...checkResult.unknownKeys);
      result.invalidKeys.push(...checkResult.invalidKeys);

      // If we have invalid keys from the validator, then that means that
      // we have a more specific key than `key`. Remove `key` from the results.
      if (checkResult.invalidKeys.length > 0) {
        invalidKeys.delete(key);
      }

      if (!checkResult.valid) {
        result.valid = false;

        if (options.failFast) {
          break;
        }
        continue;
      }
    }

    // If we reach this point, the key has been successfully validated.
    invalidKeys.delete(key);
  }

  // If there are any remaining keys in `inputKeys`, add them to `unknownKeys`.
  for (const remainingKey of inputKeys) {
    result.unknownKeys.push(`${path}.${remainingKey}`);
  }

  // If there are any remaining keys in `invalidKeys`, add them to the result.
  for (const invalidKey of invalidKeys) {
    result.invalidKeys.push(`${path}.${invalidKey}`);
  }

  return result;
}
