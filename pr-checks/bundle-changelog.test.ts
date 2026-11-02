/**
 * Tests for `bundle-changelog.ts`.
 */

import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  CLI_VERSION_ENV_VAR,
  getChangenote,
  getCLIVersion,
  getPRNumber,
  getPRUrl,
  PR_URL_ENV_VAR,
} from "./bundle-changelog";
import { isValidChangenoteContent } from "./changelog/validate";

let testDir: string;

beforeEach(() => {
  // Set up a temporary directory for testing
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-changelog-test-"));
});

afterEach(() => {
  /** Clean up temporary directories. */
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("getCLIVersion", async () => {
  await it("throws if the environment variable is not set", async () => {
    delete process.env[CLI_VERSION_ENV_VAR];
    assert.throws(() => getCLIVersion());
  });

  await it("throws if the environment variable is empty", async () => {
    process.env[CLI_VERSION_ENV_VAR] = "    ";
    assert.throws(() => getCLIVersion());
  });

  await it("returns value of the environment variable if set", async () => {
    const testValue = "1.2.3";
    process.env[CLI_VERSION_ENV_VAR] = testValue;
    assert.deepEqual(getCLIVersion(), testValue);
  });
});

const testPrUrl = "https://github.com/github/codeql-action/pulls/42";

describe("getPRUrl", async () => {
  await it("throws if the environment variable is not set", async () => {
    delete process.env[PR_URL_ENV_VAR];
    assert.throws(() => getPRUrl());
  });

  await it("throws if the environment variable is empty", async () => {
    process.env[PR_URL_ENV_VAR] = "    ";
    assert.throws(() => getPRUrl());
  });

  await it("returns value of the environment variable if set", async () => {
    process.env[PR_URL_ENV_VAR] = testPrUrl;
    assert.deepEqual(getPRUrl(), testPrUrl);
  });
});

describe("getPRNumber", async () => {
  await it("throws if the last part of the input is not a number", async () => {
    assert.throws(() => getPRNumber(`${testPrUrl}/foo`));
  });

  await it("throws if the last part of the input is not a positive number", async () => {
    assert.throws(() => getPRNumber(`${testPrUrl}/-100`));
  });

  await it("returns the PR number from an URL", async () => {
    assert.equal(getPRNumber(testPrUrl), 42);
  });
});

describe("getChangenote", async () => {
  await it("returns a note linking to the bundle release and the PR", async () => {
    assert.equal(
      getChangenote("1.2.3", testPrUrl),
      "- Update default CodeQL bundle version to [1.2.3](https://github.com/github/codeql-action/releases/tag/codeql-bundle-v1.2.3). [#42](https://github.com/github/codeql-action/pulls/42)\n",
    );
  });

  await it("returns valid changenote content", async () => {
    assert.ok(isValidChangenoteContent(getChangenote("1.2.3", testPrUrl)));
  });
});
