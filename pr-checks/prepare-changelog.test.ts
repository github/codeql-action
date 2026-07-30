/**
 * Tests for `prepare-changelog.ts`.
 */

import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { EMPTY_CHANGELOG, NO_CHANGES_STR } from "./changelog";
import { extractChangelogSnippet } from "./prepare-changelog";

let testDir: string;

beforeEach(() => {
  // Set up a temporary directory for testing
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "prepare-changelog-test-"));
});

afterEach(() => {
  /** Clean up temporary directories. */
  fs.rmSync(testDir, { recursive: true, force: true });
});

const testBody = `- Test change`;
const testChangelog = `${EMPTY_CHANGELOG.replace(NO_CHANGES_STR, testBody)}

## Another section

- Other change`;

describe("extractChangelogSnippet", async () => {
  await it("returns the default body if the input doesn't exist", async () => {
    const result = extractChangelogSnippet(path.join(testDir, "not-here.md"));
    assert.deepEqual(result, NO_CHANGES_STR);
  });

  await it("returns the first section if the input exists", async () => {
    const changelogPath = path.join(testDir, "test-readme.md");
    fs.writeFileSync(changelogPath, testChangelog);

    const result = extractChangelogSnippet(changelogPath);
    assert.deepEqual(result, testBody);
  });

  await it("returns an empty string if there is no first section", async () => {
    const changelogPath = path.join(testDir, "test-readme.md");
    fs.writeFileSync(changelogPath, "# CodeQL Action Changelog\n");

    const result = extractChangelogSnippet(changelogPath);
    assert.deepEqual(result, "");
  });
});
