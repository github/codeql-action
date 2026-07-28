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
  getCLIVersion,
  getPRNumber,
  getPRUrl,
  PR_URL_ENV_VAR,
  updateChangelog,
} from "./bundle-changelog";
import {
  EMPTY_CHANGELOG,
  NO_CHANGES_STR,
  UNRELEASED_PLACEHOLDER,
} from "./changelog";

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

const testChangelog = `${EMPTY_CHANGELOG.trimEnd()}

## 4.23.7

- Other change

## 4.23.6

${NO_CHANGES_STR}`;

const expectedChangelog = `# CodeQL Action Changelog

## ${UNRELEASED_PLACEHOLDER}

- Update default CodeQL bundle version to

## 4.23.7

- Other change

## 4.23.6

${NO_CHANGES_STR}`;

describe("updateChangelog", async () => {
  await it("removes `NO_CHANGES_STR` if present in [UNRELEASED] section", async () => {
    const result = updateChangelog(EMPTY_CHANGELOG, "");
    assert.ok(!result.includes(NO_CHANGES_STR.trim()));
  });

  await it("doesn't remove `NO_CHANGES_STR` if present in versioned section", async () => {
    const result = updateChangelog(
      EMPTY_CHANGELOG.replace(UNRELEASED_PLACEHOLDER, "1.2.3"),
      "",
    );
    assert.ok(result.includes(NO_CHANGES_STR.trim()));
  });

  await it("throws if there are no sections", async () => {
    assert.throws(() => {
      updateChangelog(
        "# CodeQL Action Changelog",
        "- Update default CodeQL bundle version to",
      );
    });
  });

  await it("adds note at the end of the first section", async () => {
    const result = updateChangelog(
      testChangelog,
      "- Update default CodeQL bundle version to",
    );
    assert.deepEqual(result, expectedChangelog);
  });
});
