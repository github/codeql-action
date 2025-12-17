import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import test from "ava";

import { scanArtifactsForTokens } from "../.github/workflows/artifact-scanner/artifact-scanner";
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

    const result = await scanArtifactsForTokens([testFile], logger);

    t.is(result.scannedFiles, 1);
    t.is(result.findings.length, 1);
    t.is(result.findings[0].tokenType, "Personal Access Token");
    t.is(result.findings[0].filePath, "test.txt");
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

    const result = await scanArtifactsForTokens([testFile], logger);

    t.is(result.scannedFiles, 1);
    t.is(result.findings.length, 0);
  } finally {
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("scanArtifactsForTokens skips binary files", async (t) => {
  const logger = getRunnerLogger(true);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-"));

  try {
    // Create a binary file (we'll just use a simple zip for this test)
    const zipFile = path.join(tempDir, "test.zip");
    fs.writeFileSync(zipFile, Buffer.from([0x50, 0x4b, 0x03, 0x04])); // ZIP header

    const result = await scanArtifactsForTokens([zipFile], logger);

    // The zip file itself should be counted but not scanned for tokens
    t.is(result.findings.length, 0);
  } finally {
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("scanArtifactsForTokens detects tokens in debug artifacts zip", async (t) => {
  const logger = getRunnerLogger(true);
  const testZipPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "src",
    "testdata",
    "debug-artifacts-with-fake-token.zip",
  );

  const result = await scanArtifactsForTokens([testZipPath], logger);

  t.true(result.scannedFiles > 0, "Should have scanned files");
  t.true(
    result.findings.length > 0,
    "Should have found tokens in the test zip",
  );

  // Check that the token types are tracked
  const serverToServerFindings = result.findings.filter(
    (f) => f.tokenType === "Server-to-Server Token",
  );
  t.is(
    serverToServerFindings.length,
    1,
    "Should have found exactly 1 Server-to-Server Token",
  );

  // Check that the path includes the nested structure
  const expectedPath =
    "debug-artifacts-with-fake-token.zip/debug-artifacts-with-test-token/my-db-java-partial.zip/my-db-java-partial/trap/java/invocations/kotlin.9017231652989744319.trap";
  t.true(
    result.findings.some((f) => f.filePath === expectedPath),
    `Expected to find token at ${expectedPath}, but found: ${result.findings.map((f) => f.filePath).join(", ")}`,
  );
});
