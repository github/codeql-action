import * as json from ".";

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
