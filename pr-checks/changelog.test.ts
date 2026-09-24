#!/usr/bin/env npx tsx

/**
 * Tests for `changelog.ts`.
 */

import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";

import {
  addBodyLinesToUnreleasedSection,
  ChangelogSection,
  EMPTY_CHANGELOG,
  getHeader,
  getReleaseDateString,
  NO_CHANGES_STR,
  parseChangelog,
  processChangelogForBackports,
  renderChangelog,
  setVersionAndDate,
  UNRELEASED_PLACEHOLDER,
} from "./changelog";
import { CHANGELOG_FILE } from "./config";

const testDate = new Date(2026, 7, 14);

describe("getHeader", async () => {
  function Section(headerLine: string): ChangelogSection {
    return {
      headerLine,
      bodyLines: [],
    };
  }
  await it("returns non-headers unchanged", () => {
    assert.equal("foo", getHeader(Section("foo")));
    assert.equal("- bar", getHeader(Section("- bar")));
  });
  await it("strips octothorpes", async () => {
    assert.equal("foo", getHeader(Section("# foo")));
    assert.equal("foo", getHeader(Section("## foo")));
    assert.equal("foo", getHeader(Section("### foo")));
    assert.equal("foo", getHeader(Section("#### foo")));
    assert.equal("foo", getHeader(Section("##### foo")));
    assert.equal("foo", getHeader(Section("###### foo")));
  });
  await it("strips whitespace", async () => {
    assert.equal("foo", getHeader(Section("# foo  ")));
  });
});

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

describe("parseChangelog + renderChangelog", async () => {
  await it("renderChangelog(parseChangelog(c)) == c", async () => {
    const actualChangelog = fs.readFileSync(CHANGELOG_FILE, "utf-8");
    const roundtrip = renderChangelog(parseChangelog(actualChangelog));
    assert.deepEqual(roundtrip.split("\n"), actualChangelog.split("\n"));
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

describe("addBodyLinesToUnreleasedSection", async () => {
  function newChangelogWithSections(sections: ChangelogSection[]) {
    return {
      preamble: [],
      sections,
    };
  }

  await it("throws error if '[UNRELEASED]' section is not first", async () => {
    const invalidChangelog = newChangelogWithSections([
      {
        headerLine: "## Release 1.0.0",
        bodyLines: [],
      },
      {
        headerLine: `## ${UNRELEASED_PLACEHOLDER}`,
        bodyLines: [],
      },
    ]);
    assert.throws(() =>
      addBodyLinesToUnreleasedSection(invalidChangelog, ["foo"]),
    );
  });

  await it("overwrites 'No user facing changes.'", async () => {
    const changelog = newChangelogWithSections([
      {
        headerLine: `## ${UNRELEASED_PLACEHOLDER}`,
        bodyLines: ["", NO_CHANGES_STR, ""],
      },
    ]);

    addBodyLinesToUnreleasedSection(changelog, ["- foo"]);

    assert.equal(changelog.sections[0].bodyLines.length, 3);
    assert.deepEqual(changelog.sections[0].bodyLines, ["", "- foo", ""]);
  });

  await it("does nothing if lines is empty", async () => {
    const changelog = newChangelogWithSections([
      {
        headerLine: `## ${UNRELEASED_PLACEHOLDER}`,
        bodyLines: ["", NO_CHANGES_STR, ""],
      },
    ]);
    const changelogClone = structuredClone(changelog);

    addBodyLinesToUnreleasedSection(changelog, []);

    assert.deepEqual(changelog, changelogClone);
  });

  await it("inserts a line", async () => {
    const changelog = newChangelogWithSections([
      {
        headerLine: `## ${UNRELEASED_PLACEHOLDER}`,
        bodyLines: ["", "- Added a new dependency.", ""],
      },
    ]);
    const lineToInsert = "- foo";

    addBodyLinesToUnreleasedSection(changelog, [lineToInsert]);

    assert.equal(changelog.sections[0].bodyLines.length, 4);
    assert.ok(
      changelog.sections[0].bodyLines.some((line) => line === lineToInsert),
    );
  });
});
