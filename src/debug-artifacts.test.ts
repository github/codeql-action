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

// TODO(angelapwen): Test uploadDebugArtifacts if toUpload is empty
