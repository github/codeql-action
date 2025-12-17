import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import test from "ava";

import { scanArtifactsForTokens } from "./artifact-scanner";
import { getRunnerLogger } from "./logging";
import { getRecordingLogger, LoggedMessage } from "./testing-utils";

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

if (os.platform() !== "win32") {
  test("scanArtifactsForTokens finds token in debug artifacts", async (t) => {
    t.timeout(15000); // 15 seconds
    const messages: LoggedMessage[] = [];
    const logger = getRecordingLogger(messages, { logToConsole: false });
    // The zip here is a regression test based on
    // https://github.com/github/codeql-action/security/advisories/GHSA-vqf5-2xx6-9wfm
    const testZip = path.join(
      __dirname,
      "..",
      "src",
      "testdata",
      "debug-artifacts-with-fake-token.zip",
    );

    // This zip file contains a nested structure with a fake token in:
    // my-db-java-partial.zip/trap/java/invocations/kotlin.9017231652989744319.trap
    const error = await t.throwsAsync(
      async () => await scanArtifactsForTokens([testZip], logger),
    );

    t.regex(
      error?.message || "",
      /Found.*potential GitHub token/,
      "Should detect token in nested zip",
    );
    t.regex(
      error?.message || "",
      /kotlin\.9017231652989744319\.trap/,
      "Should report the .trap file containing the token",
    );

    const logOutput = messages.map((msg) => msg.message).join("\n");
    t.regex(
      logOutput,
      /^Extracting gz file: .*\.gz$/m,
      "Logs should show that .gz files were extracted",
    );
  });
}
