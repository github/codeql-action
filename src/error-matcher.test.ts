import test from "ava";

import { namedMatchersForTesting } from "./error-matcher";

/*
NB We test the regexes for all the matchers against example log output snippets.
*/

test("fatalError matches against example log output", async (t) => {
  t.assert(
    testErrorMatcher(
      "fatalError",
      "A fatal error occurred: Could not process query metadata for test-query.ql"
    )
  );
});

function testErrorMatcher(matcherName: string, logSample: string): boolean {
  if (!(matcherName in namedMatchersForTesting)) {
    throw new Error(`Unknown matcher ${matcherName}`);
  }
  const regex = namedMatchersForTesting[matcherName].outputRegex;
  if (regex === undefined) {
    throw new Error(`Cannot test matcher ${matcherName} with null regex`);
  }
  return regex.test(logSample);
}
