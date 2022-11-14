import test from "ava";

import * as debugArtifacts from "./debug-artifacts";

test("sanitizeArifactName", (t) => {
  t.deepEqual(
    debugArtifacts.sanitizeArifactName("hello-world_"),
    "hello-world_"
  );
  t.deepEqual(debugArtifacts.sanitizeArifactName("hello`world`"), "helloworld");
  t.deepEqual(debugArtifacts.sanitizeArifactName("hello===123"), "hello123");
  t.deepEqual(
    debugArtifacts.sanitizeArifactName("*m)a&n^y%i££n+v!a:l[i]d"),
    "manyinvalid"
  );
});

test("uploadDebugArtifacts", async (t) => {
  // Test that no error is thrown if artifacts list is empty.
  await t.notThrowsAsync(
    debugArtifacts.uploadDebugArtifacts([], "rootDir", "artifactName")
  );
});
