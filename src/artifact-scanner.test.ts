import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import test from "ava";

import { scanArtifactsForTokens } from "./artifact-scanner";
import { getRunnerLogger } from "./logging";

test("scanArtifactsForTokens detects GitHub tokens in files", async (t) => {
  const logger = getRunnerLogger(true);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-"));

  try {
    // Create a test file with a fake GitHub token
    const testFile = path.join(tempDir, "test.txt");
    fs.writeFileSync(
      testFile,
      "This is a test file with token ghp_1234567890123456789012345678901234AB",
    );

    const error = await t.throwsAsync(
      async () => await scanArtifactsForTokens([testFile], logger),
    );

    t.regex(
      error?.message || "",
      /Found 1 potential GitHub token.*Personal Access Token/,
    );
    t.regex(error?.message || "", /test\.txt/);
  } finally {
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("scanArtifactsForTokens handles files without tokens", async (t) => {
  const logger = getRunnerLogger(true);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-"));

  try {
    // Create a test file without tokens
    const testFile = path.join(tempDir, "test.txt");
    fs.writeFileSync(
      testFile,
      "This is a test file without any sensitive data",
    );

    await t.notThrowsAsync(
      async () => await scanArtifactsForTokens([testFile], logger),
    );
  } finally {
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
