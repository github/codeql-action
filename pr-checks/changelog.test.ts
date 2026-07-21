#!/usr/bin/env npx tsx

/**
 * Tests for `changelog.ts`.
 */

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_CHANGELOG,
  getReleaseDateString,
  processChangelogForBackports,
  setVersionAndDate,
} from "./changelog";

const testDate = new Date(2026, 7, 14);

describe("getReleaseDateString", async () => {
  await it("formats dates as expected", async () => {
    assert.equal(getReleaseDateString(testDate), "14 Aug 2026");
  });
});

const emptyChangelogExpected = `# CodeQL Action Changelog

## 9.99.9 - 14 Aug 2026

No user facing changes.

`;

describe("setVersionAndDate", async () => {
  await it("replaces the placeholder", async () => {
    const result = setVersionAndDate("9.99.9", EMPTY_CHANGELOG, testDate);
    assert.equal(result, emptyChangelogExpected);
  });
});

const testChangelog = `# CodeQL Action Changelog

## 4.12.3 - 14 Aug 2026

No user facing changes.
`;

const testChangelogResult: string = `# CodeQL Action Changelog

## 3.12.3 - 14 Aug 2026

No user facing changes.
`;

describe("processChangelogForBackports", async () => {
  await it("replaces major versions", async () => {
    const result = processChangelogForBackports("4", "3", testChangelog);

    assert.deepEqual(result.split("\n"), testChangelogResult.split("\n"));
  });
});
