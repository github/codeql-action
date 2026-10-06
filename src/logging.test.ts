import test from "ava";

import { joinMessageStrings } from "./logging";
import { setupTests } from "./testing-utils";

setupTests(test);

test("joinMessageStrings", async (t) => {
  // For strings and errors, it is the identity function.
  t.deepEqual(joinMessageStrings("Hello"), "Hello");

  const error = new Error("Some error");
  t.deepEqual(joinMessageStrings(error), error);

  // For arrays of strings, we get a join-ed string.
  t.deepEqual(joinMessageStrings(["foo", "bar"]), "foo bar");
});
