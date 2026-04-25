import test from "ava";

import * as json from "../json";
import { setupTests } from "../testing-utils";

import * as types from "./types";
import { getAuthConfig } from "./validation";

setupTests(test);

function makeFromSchema(
  includeOptional: boolean,
  schema: json.Schema,
): json.FromSchema<typeof schema> {
  const result = {};
  for (const [key, validator] of Object.entries(schema)) {
    if (!validator.required && !includeOptional) {
      continue;
    }
    result[key] = `value-for-${key}`;
  }
  return result;
}

const schemaTests = [
  { schema: types.azureConfigSchema, name: "isAzureConfig" },
  { schema: types.awsConfigSchema, name: "isAWSConfig" },
  { schema: types.jfrogConfigSchema, name: "isJFrogConfig" },
] as Array<{ schema: json.Schema; name: string }>;

for (const schemaTest of schemaTests) {
  for (const includeOptional of [true, false]) {
    const minimalName = includeOptional ? "full" : "minimal";

    test(`getAuthConfig - ${schemaTest.name} - ${minimalName}`, async (t) => {
      const config = makeFromSchema(includeOptional, schemaTest.schema);

      t.deepEqual(
        getAuthConfig({
          ...config,
          unexpected: "unexpected-value",
        } as json.UnvalidatedObject<types.AuthConfig>),
        config,
      );
    });
  }
}

test("getAuthConfig - token", async (t) => {
  const config = makeFromSchema(true, types.tokenSchema);

  t.deepEqual(
    getAuthConfig({
      ...config,
      unexpected: "unexpected-value",
    } as json.UnvalidatedObject<types.AuthConfig>),
    config,
  );
});

test("getAuthConfig - username and password", async (t) => {
  const config = makeFromSchema(true, types.usernamePasswordSchema);

  t.deepEqual(
    getAuthConfig({
      ...config,
      unexpected: "unexpected-value",
    } as json.UnvalidatedObject<types.AuthConfig>),
    config,
  );
});

test("getAuthConfig - empty", async (t) => {
  const config = makeFromSchema(false, types.usernamePasswordSchema);

  // Since the purpose of constructing the `AuthConfig` values is for
  // serialisation to JSON so that they can be passed to the proxy as configuration,
  // we only care that the stringified JSON representations are the same.
  t.deepEqual(
    JSON.stringify(
      getAuthConfig({
        ...config,
        unexpected: "unexpected-value",
      } as json.UnvalidatedObject<types.AuthConfig>),
    ),
    JSON.stringify({}),
  );
});
