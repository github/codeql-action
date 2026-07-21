#!/usr/bin/env npx tsx

/**
 * Tests for `versions.ts`.
 */

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCurrentVersion, replaceVersionInPackageJson } from "./versions";

describe("getCurrentVersion", async () => {
  await it("reads versions", async () => {
    const result = getCurrentVersion(`{ "version": "1.23.4" }`);
    assert.deepEqual(result, "1.23.4");
  });
});

const packageJsonContents = `{
  "name": "codeql",
  "version": "1.23.4"
}
`;

const packageJsonContentsExpected = `{
  "name": "codeql",
  "version": "2.23.4"
}
`;

describe("replaceVersionInPackageJson", async () => {
  await it("replaces versions", async () => {
    const result = replaceVersionInPackageJson(
      "1.23.4",
      "2.23.4",
      packageJsonContents,
    );
    assert.deepEqual(
      result.split("\n"),
      packageJsonContentsExpected.split("\n"),
    );
    assert.deepEqual(JSON.parse(result), { name: "codeql", version: "2.23.4" });
  });
});
