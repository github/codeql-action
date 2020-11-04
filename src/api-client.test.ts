import test from "ava";

import { apiVersionInRange, DisallowedAPIVersionReason } from "./api-client";

test("allowed API versions", async (t) => {
  t.is(apiVersionInRange("1.33.0", "1.33", "2.0"), undefined);
  t.is(apiVersionInRange("1.33.1", "1.33", "2.0"), undefined);
  t.is(apiVersionInRange("1.34.0", "1.33", "2.0"), undefined);
  t.is(apiVersionInRange("2.0.0", "1.33", "2.0"), undefined);
  t.is(apiVersionInRange("2.0.1", "1.33", "2.0"), undefined);
  t.is(
    apiVersionInRange("1.32.0", "1.33", "2.0"),
    DisallowedAPIVersionReason.ACTION_TOO_NEW
  );
  t.is(
    apiVersionInRange("2.1.0", "1.33", "2.0"),
    DisallowedAPIVersionReason.ACTION_TOO_OLD
  );
});
