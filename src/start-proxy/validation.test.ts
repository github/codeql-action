import test from "ava";

import * as json from "../json";
import { makeFromSchema } from "../json/testing-util";
import { setupTests } from "../testing-utils";

import * as types from "./types";
import { getAuthConfig } from "./validation";

setupTests(test);

for (const schemaTest of types.oidcSchemas) {
  for (const includeOptional of [true, false]) {
    const minimalName = includeOptional ? "full" : "minimal";

    test(`getAuthConfig - ${schemaTest.name} - ${minimalName}`, async (t) => {
      const config = makeFromSchema(includeOptional, schemaTest.schema);

      t.deepEqual(
        getAuthConfig({
          ...config,
          unexpected: "unexpected-value",
        } as unknown as json.UnvalidatedObject<types.AuthConfig>),
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
