import test from "ava";

import { Env, ReadOnlyEnv } from "./environment";
import { getTestEnv, setupTests } from "./testing-utils";

setupTests(test);

test("isTestingEnv() is true", (t) => {
  t.true(new ReadOnlyEnv(process.env).isTestingEnv());
  t.true(new Env(process.env).isTestingEnv());
  t.true(getTestEnv().isTestingEnv());
});
