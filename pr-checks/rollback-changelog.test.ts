/**
 * Tests for `rollback-changelog.ts`.
 */

import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";

import { getReleaseDateString, parseChangelog } from "./changelog";
import { CHANGELOG_FILE } from "./config";
import { updateChangelog } from "./rollback-changelog";

describe("updateChangelog", async () => {
  await it("replaces the first section with one for the rollback release", async () => {
    const actualChangelog = parseChangelog(
      fs.readFileSync(CHANGELOG_FILE, "utf-8"),
    );
    const existingFirstSection = actualChangelog.sections[0];

    const today = new Date();
    updateChangelog(actualChangelog, {
      "new-version": "Test.1.3",
      "rollback-version": "Test.1.2",
      "target-version": "Test.1.1",
      today,
    });

    // Check that the old, first section is gone.
    for (const section of actualChangelog.sections) {
      assert.notDeepEqual(section, existingFirstSection);
    }

    // Check that the new, first section matches our expectations.
    const newFirstSection = actualChangelog.sections[0];
    assert.deepEqual(
      newFirstSection.headerLine,
      `## Test.1.3 - ${getReleaseDateString(today)}`,
    );
    assert.equal(newFirstSection.bodyLines.length, 3);
    assert.deepEqual(
      newFirstSection.bodyLines[1],
      `This release rolls back Test.1.2 due to issues with that release. It is identical to Test.1.1.`,
    );
  });
});
