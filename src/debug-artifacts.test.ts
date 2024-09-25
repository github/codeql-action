import test from "ava";

import * as debugArtifacts from "./debug-artifacts";
import { Feature } from "./feature-flags";
import { createFeatures } from "./testing-utils";
import { GitHubVariant } from "./util";

test("sanitizeArtifactName", (t) => {
  t.deepEqual(
    debugArtifacts.sanitizeArtifactName("hello-world_"),
    "hello-world_",
  );
  t.deepEqual(
    debugArtifacts.sanitizeArtifactName("hello`world`"),
    "helloworld",
  );
  t.deepEqual(debugArtifacts.sanitizeArtifactName("hello===123"), "hello123");
  t.deepEqual(
    debugArtifacts.sanitizeArtifactName("*m)a&n^y%i££n+v!a:l[i]d"),
    "manyinvalid",
  );
});

test("uploadDebugArtifacts", async (t) => {
  // Test that no error is thrown if artifacts list is empty.
  const mockFeature = createFeatures([Feature.ArtifactUpgrade]);
  await t.notThrowsAsync(
    debugArtifacts.uploadDebugArtifacts(
      [],
      "rootDir",
      "artifactName",
      GitHubVariant.DOTCOM,
      mockFeature,
    ),
  );
});
