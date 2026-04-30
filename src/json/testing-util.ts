import { ExecutionContext } from "ava";

import * as json from ".";

/**
 * Constructs an object based on `schema` for unit tests.
 * Assumes that all keys in `schema` have string values.
 *
 * @param includeOptional Whether to include optional properties.
 * @param schema The schema to base the object on.
 * @returns An object that satisfies `schema`.
 */
export function makeFromSchema<S extends json.Schema>(
  includeOptional: boolean,
  schema: S,
): json.FromSchema<S> {
  const result = {};
  for (const [key, validator] of Object.entries(schema)) {
    if (!validator.required && !includeOptional) {
      continue;
    }
    result[key] = `value-for-${key}`;
  }
  return result as json.FromSchema<S>;
}

/** Options for `withSchemaMatrix`. */
export interface SchemaMatrixOptions {
  /** Whether cases where the properties are entirely absent should be excluded. */
  excludeAbsent?: boolean;
}

/**
 * Constructs a test matrix of possible objects for `schema`: all required properties
 * plus all permutations of possible states for the optional properties.
 *
 * @param schema The schema to construct a test matrix for.
 * @param body The test body to call with each value from the test matrix.
 */
export function withSchemaMatrix<S extends json.Schema>(
  t: ExecutionContext<any>,
  schema: S,
  opts: SchemaMatrixOptions,
  body: (value: json.FromSchema<S>) => void,
): void {
  // Construct a base object that includes all required properties.
  const required = makeFromSchema(false, schema);

  // Identify optional properties.
  const optionalKeys: Array<keyof S> = [];

  for (const [key, validator] of Object.entries(schema)) {
    if (!validator.required) {
      optionalKeys.push(key);
    }
  }

  const optionalValues = (key: keyof S) => [
    null,
    undefined,
    `value-for-${String(key)}`,
  ];

  // Constructs an array of test objects, starting with `required` and combining it with all
  // possible states of each optional property. For example, with default settings:
  //
  // For { requiredKey: string }, we get: `[{ requiredKey: "some-string-value" }]`
  //
  // For { requiredKey: string, optionalKey?: string }, we get:
  // [ { requiredKey: "some-string-value" },
  //   { requiredKey: "some-string-value", optionalKey: undefined },
  //   { requiredKey: "some-string-value", optionalKey: null },
  //   { requiredKey: "some-string-value", optionalKey: "some-value" },
  // ]
  const permutations = (keys: Array<keyof S>) => {
    if (keys.length === 0) return [required];

    const bases = permutations(keys.slice(1));
    const result: Array<json.FromSchema<S>> = [];

    const optionalKey = keys[0];
    for (const base of bases) {
      if (!opts.excludeAbsent) {
        // Optional keys can be absent entirely.
        result.push(base);
      }

      // Or be present and have one of the `optionalValues`.
      for (const optionalValue of optionalValues(optionalKey)) {
        result.push({ ...base, [optionalKey]: optionalValue });
      }
    }
    return result;
  };

  // Call `body` for all test cases.
  const testCases = permutations(optionalKeys);
  for (const testCase of testCases) {
    try {
      body(testCase);
    } catch (err) {
      t.log(testCase);
      throw err;
    }
  }
}
