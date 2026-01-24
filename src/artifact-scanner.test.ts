import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import test from "ava";

import {
  GITHUB_PAT_CLASSIC_PATTERN,
  isAuthToken,
  scanArtifactsForTokens,
  TokenType,
} from "./artifact-scanner";
import { getRunnerLogger } from "./logging";
import {
  checkExpectedLogMessages,
  getRecordingLogger,
  LoggedMessage,
} from "./testing-utils";

function makeTestToken(length: number = 36) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return chars.repeat(Math.ceil(length / chars.length)).slice(0, length);
}

test("makeTestToken", (t) => {
  t.is(makeTestToken().length, 36);
  t.is(makeTestToken(255).length, 255);
});

test("isAuthToken", (t) => {
  // Undefined for strings that aren't tokens
  t.is(isAuthToken("some string"), undefined);
  t.is(isAuthToken("ghp_"), undefined);
  t.is(isAuthToken("ghp_123"), undefined);

  // Token types for strings that are tokens.
  t.is(isAuthToken(`ghp_${makeTestToken()}`), TokenType.PersonalAccessClassic);
  t.is(
    isAuthToken(`ghs_${makeTestToken(255)}`),
    TokenType.AppInstallationAccess,
  );
  t.is(
    isAuthToken(`github_pat_${makeTestToken(22)}_${makeTestToken(59)}`),
    TokenType.PersonalAccessFineGrained,
  );

  // With a custom pattern set
  t.is(
    isAuthToken(`ghp_${makeTestToken()}`, [GITHUB_PAT_CLASSIC_PATTERN]),
    TokenType.PersonalAccessClassic,
  );
  t.is(
    isAuthToken(`github_pat_${makeTestToken(22)}_${makeTestToken(59)}`, [
      GITHUB_PAT_CLASSIC_PATTERN,
    ]),
    undefined,
  );
});

const testTokens = [
  {
    type: TokenType.PersonalAccessClassic,
    value: `ghp_${makeTestToken()}`,
    checkPattern: "Personal Access Token",
  },
  {
    type: TokenType.PersonalAccessFineGrained,
    value:
      "github_pat_1234567890ABCDEFGHIJKL_MNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHI",
    checkPattern: "Personal Access Token",
  },
  {
    type: TokenType.OAuth,
    value: `gho_${makeTestToken()}`,
  },
  {
    type: TokenType.UserToServer,
    value: `ghu_${makeTestToken()}`,
  },
  {
    type: TokenType.ServerToServer,
    value: `ghs_${makeTestToken()}`,
  },
  {
    type: TokenType.Refresh,
    value: `ghr_${makeTestToken()}`,
  },
  {
    type: TokenType.AppInstallationAccess,
    value: `ghs_${makeTestToken(255)}`,
  },
];

for (const { type, value, checkPattern } of testTokens) {
  test(`scanArtifactsForTokens detects GitHub ${type} tokens in files`, async (t) => {
    const logMessages = [];
    const logger = getRecordingLogger(logMessages, { logToConsole: false });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-"));

    try {
      // Create a test file with a fake GitHub token
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, `This is a test file with token ${value}`);

      const error = await t.throwsAsync(
        async () => await scanArtifactsForTokens([testFile], logger),
      );

      t.regex(
        error?.message || "",
        new RegExp(`Found 1 potential GitHub token.*${checkPattern || type}`),
      );
      t.regex(error?.message || "", /test\.txt/);

      checkExpectedLogMessages(t, logMessages, [
        "Starting best-effort check",
        `Found 1 ${type}`,
      ]);
    } finally {
      // Clean up
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
}

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
