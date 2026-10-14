import test from "ava";

import * as debugArtifacts from "./debug-artifacts";
import { getActionsLogger } from "./logging";
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
  t.deepEqual(
    debugArtifacts.sanitizeArtifactName("\\foo\\bar//baz"),
    "foobarbaz",
  );
});

test("getArtifactSuffix", (t) => {
  // No suffix if there's no `matrix` input, it is invalid, or has no keys.
  t.is(debugArtifacts.getArtifactSuffix(undefined), "");
  t.is(debugArtifacts.getArtifactSuffix(""), "");
  t.is(debugArtifacts.getArtifactSuffix("invalid json"), "");
  t.is(debugArtifacts.getArtifactSuffix("{}"), "");
  t.is(debugArtifacts.getArtifactSuffix("null"), "");
  t.is(debugArtifacts.getArtifactSuffix("123"), "");
  t.is(debugArtifacts.getArtifactSuffix('"string"'), "");

  // Suffixes for non-empty, valid `matrix` inputs.
  const testMatrices = [
    { matrix: { language: "go" }, expected: "-go" },
    {
      matrix: { language: "javascript", "build-mode": "none" },
      expected: "-none-javascript",
    },
    {
      matrix: { "build-mode": "none", language: "javascript" },
      expected: "-none-javascript",
    },
  ];

  for (const testMatrix of testMatrices) {
    const suffix = debugArtifacts.getArtifactSuffix(
      JSON.stringify(testMatrix.matrix),
    );
    t.is(suffix, testMatrix.expected);
  }
});

// These next tests check whether `uploadArtifacts` attempts to upload an artifact. Since it's not
// easy to mock the actual call to upload an artifact, we check that we get an "upload-failed"
// result, instead of actually uploading the artifact.

test("uploadArtifacts returns 'no-artifacts-to-upload' when there are no files to upload", async (t) => {
  // Test that no error is thrown if artifacts list is empty.
  const logger = getActionsLogger();
  await t.notThrowsAsync(async () => {
    const uploaded = await debugArtifacts.uploadArtifacts(
      logger,
      [],
      "i-dont-exist",
      "artifactName",
      GitHubVariant.DOTCOM,
    );
    t.is(
      uploaded,
      "no-artifacts-to-upload",
      "Should not have uploaded any artifacts",
    );
  });
});

test("uploadArtifacts attempts an upload when there are files to upload", async (t) => {
  const logger = getActionsLogger();
  await t.notThrowsAsync(async () => {
    const uploaded = await debugArtifacts.uploadArtifacts(
      logger,
      ["hucairz"],
      "i-dont-exist",
      "artifactName",
      GitHubVariant.DOTCOM,
    );
    t.is(
      uploaded,
      // The failure is expected since we don't want to actually upload any artifacts in unit tests.
      "upload-failed",
      "Expect failure to upload artifacts since root dir does not exist",
    );
  });
});
