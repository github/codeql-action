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
});

test("uploadDebugArtifacts when artifacts empty", async (t) => {
  // Test that no error is thrown if artifacts list is empty.
  const logger = getActionsLogger();
  await t.notThrowsAsync(async () => {
    const uploaded = await debugArtifacts.uploadDebugArtifacts(
      logger,
      [],
      "i-dont-exist",
      "artifactName",
      GitHubVariant.DOTCOM,
      undefined,
    );
    t.is(
      uploaded,
      "no-artifacts-to-upload",
      "Should not have uploaded any artifacts",
    );
  });
});

test("uploadDebugArtifacts when no codeql version is used", async (t) => {
  // Test that the artifact is uploaded.
  const logger = getActionsLogger();
  await t.notThrowsAsync(async () => {
    const uploaded = await debugArtifacts.uploadDebugArtifacts(
      logger,
      ["hucairz"],
      "i-dont-exist",
      "artifactName",
      GitHubVariant.DOTCOM,
      undefined,
    );
    t.is(
      uploaded,
      "upload-failed",
      "Expect failure to upload artifacts since root dir does not exist",
    );
  });
});

test("uploadDebugArtifacts when new codeql version is used", async (t) => {
  // Test that the artifact is uploaded.
  const logger = getActionsLogger();
  await t.notThrowsAsync(async () => {
    const uploaded = await debugArtifacts.uploadDebugArtifacts(
      logger,
      ["hucairz"],
      "i-dont-exist",
      "artifactName",
      GitHubVariant.DOTCOM,
      "2.20.3",
    );
    t.is(
      uploaded,
      "upload-failed",
      "Expect failure to upload artifacts since root dir does not exist",
    );
  });
});

test("uploadDebugArtifacts when old codeql is used", async (t) => {
  // Test that the artifact is not uploaded.
  const logger = getActionsLogger();
  await t.notThrowsAsync(async () => {
    const uploaded = await debugArtifacts.uploadDebugArtifacts(
      logger,
      ["hucairz"],
      "i-dont-exist",
      "artifactName",
      GitHubVariant.DOTCOM,
      "2.20.2",
    );
    t.is(
      uploaded,
      "upload-not-supported",
      "Expect failure to upload artifacts since root dir does not exist",
    );
  });
});
